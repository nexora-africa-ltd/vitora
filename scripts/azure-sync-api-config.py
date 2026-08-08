#!/usr/bin/env python3
"""
File purpose:
    Sync Container App secrets and environment variables from source apps
    (East US) to target apps (South Africa North), with SA-specific overrides.

Usage:
    python3 scripts/azure-sync-api-config.py

Args / inputs:
    APP_MAPPINGS_JSON (optional env var): JSON list of mappings with keys:
        source_rg, source_app, target_rg, target_app
    If APP_MAPPINGS_JSON is omitted, DEFAULT_APP_MAPPINGS is used.
"""

import json
import os
import subprocess
from typing import Dict, List


DEFAULT_APP_MAPPINGS = [
    {
        "source_rg": "vitora-rg",
        "source_app": "vitora-api",
        "target_rg": "vitora-rg-sa",
        "target_app": "vitora-api-sa",
    },
    {
        "source_rg": "vitora-rg",
        "source_app": "vitora-api-prod",
        "target_rg": "vitora-rg-sa",
        "target_app": "vitora-api-prod-sa",
    },
]


def load_app_mappings() -> List[Dict[str, str]]:
    raw = os.getenv("APP_MAPPINGS_JSON", "").strip()
    if not raw:
        return DEFAULT_APP_MAPPINGS

    loaded = json.loads(raw)
    if not isinstance(loaded, list):
        raise ValueError("APP_MAPPINGS_JSON must be a JSON list")

    required = {"source_rg", "source_app", "target_rg", "target_app"}
    for idx, item in enumerate(loaded):
        if not isinstance(item, dict):
            raise ValueError(f"Mapping at index {idx} must be a JSON object")
        missing = required.difference(item.keys())
        if missing:
            missing_str = ", ".join(sorted(missing))
            raise ValueError(f"Mapping at index {idx} missing fields: {missing_str}")

    return loaded


def run_json(cmd: List[str]):
    out = subprocess.check_output(cmd, text=True)
    return json.loads(out)


def run(cmd: List[str]):
    subprocess.run(cmd, check=True)


def get_fqdn(rg: str, app: str) -> str:
    return subprocess.check_output(
        [
            "az",
            "containerapp",
            "show",
            "-g",
            rg,
            "-n",
            app,
            "--query",
            "properties.configuration.ingress.fqdn",
            "-o",
            "tsv",
        ],
        text=True,
    ).strip()


def sync_secrets(source_rg: str, source_app: str, target_rg: str, target_app: str):
    secrets = run_json(
        [
            "az",
            "containerapp",
            "secret",
            "list",
            "-g",
            source_rg,
            "-n",
            source_app,
            "--show-values",
            "-o",
            "json",
        ]
    )

    secret_pairs = [f"{secret['name']}={secret.get('value', '')}" for secret in secrets]

    for part in chunk(secret_pairs, 20):
        run(
            [
                "az",
                "containerapp",
                "secret",
                "set",
                "-g",
                target_rg,
                "-n",
                target_app,
                "--secrets",
                *part,
            ]
        )


def update_allowed_hosts(current: str, target_fqdn: str) -> str:
    values = [item.strip() for item in current.split(",") if item.strip()]
    if target_fqdn not in values:
        values.append(target_fqdn)
    return ",".join(values)


def env_pairs_with_overrides(source_rg: str, source_app: str, target_fqdn: str) -> List[str]:
    env_items = run_json(
        [
            "az",
            "containerapp",
            "show",
            "-g",
            source_rg,
            "-n",
            source_app,
            "--query",
            "properties.template.containers[0].env",
            "-o",
            "json",
        ]
    )

    env_map: Dict[str, str] = {}
    for item in env_items:
        name = item["name"]
        if "secretRef" in item:
            env_map[name] = f"secretref:{item['secretRef']}"
        else:
            env_map[name] = item.get("value", "")

    env_map["ALLOWED_HOSTS"] = update_allowed_hosts(env_map.get("ALLOWED_HOSTS", ""), target_fqdn)
    env_map["CLOUD_API_BASE_URL"] = f"https://{target_fqdn}"
    env_map["SYNC_SERVER_URL"] = f"https://{target_fqdn}/api/sync"
    env_map["MPESA_CALLBACK_URL"] = f"https://{target_fqdn}/api/billing/mpesa/callback/"

    return [f"{k}={v}" for k, v in env_map.items()]


def chunk(items: List[str], size: int) -> List[List[str]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def sync_env_vars(source_rg: str, source_app: str, target_rg: str, target_app: str):
    target_fqdn = get_fqdn(target_rg, target_app)
    pairs = env_pairs_with_overrides(source_rg, source_app, target_fqdn)

    for part in chunk(pairs, 25):
        run(
            [
                "az",
                "containerapp",
                "update",
                "-g",
                target_rg,
                "-n",
                target_app,
                "--set-env-vars",
                *part,
            ]
        )


def main():
    mappings = load_app_mappings()

    for mapping in mappings:
        source_rg = mapping["source_rg"]
        source_app = mapping["source_app"]
        target_rg = mapping["target_rg"]
        target_app = mapping["target_app"]

        print(f"Syncing secrets: {source_app} -> {target_app}")
        sync_secrets(source_rg, source_app, target_rg, target_app)

        print(f"Syncing env vars: {source_app} -> {target_app}")
        sync_env_vars(source_rg, source_app, target_rg, target_app)

    print("Sync complete.")


if __name__ == "__main__":
    main()
