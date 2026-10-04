# Copyright (c) 2026 Nexora Consulting Ltd. All rights reserved.
"""Capture/restore database and protected credentials as one stopped-hub rollback set.

Use: python hub-update-state.py capture --snapshot DIR --database PATH
     --sync-state PATH --secrets PATH --env PATH [--device-key PATH]
     python hub-update-state.py restore --snapshot DIR
Stop API, sync, and scheduled backup writers first. The snapshot is local,
permission-restricted rollback material (not an encrypted off-site backup).
"""

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def capture(snapshot, paths):
    """Preserve exact bytes, absence, paths, and hashes before conversion/re-enrollment."""
    snapshot.mkdir(mode=0o700, parents=True, exist_ok=False)
    entries = []
    for index, path in enumerate(paths):
        path = path.resolve()
        saved = snapshot / str(index)
        entry = {"path": str(path), "saved": str(index), "present": path.exists()}
        if path.exists():
            stat = path.stat()
            shutil.copy2(path, saved)
            os.chmod(saved, 0o600)
            entry["sha256"] = digest(saved)
            entry["mode"] = stat.st_mode & 0o777
            entry["uid"] = stat.st_uid
            entry["gid"] = stat.st_gid
        entries.append(entry)
    manifest = snapshot / "manifest.json"
    manifest.write_text(json.dumps(entries), encoding="utf-8")
    os.chmod(manifest, 0o600)


def restore(snapshot):
    """Verify the entire stopped-hub rollback set before replacing any member."""
    entries = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
    for entry in entries:
        if entry["present"] and digest(snapshot / entry["saved"]) != entry["sha256"]:
            raise RuntimeError("Rollback snapshot checksum mismatch; services must remain stopped")
    for entry in entries:
        target = Path(entry["path"])
        if entry["present"]:
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_name(target.name + ".rollback")
            shutil.copy2(snapshot / entry["saved"], temporary)
            if os.name != "nt":
                os.chmod(temporary, entry["mode"])
                if os.geteuid() == 0:
                    os.chown(temporary, entry["uid"], entry["gid"])
            os.replace(temporary, target)
        else:
            # Includes new WAL/SHM files: never replay the failed upgrade's WAL
            # against the database restored from the previous encryption epoch.
            target.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["capture", "restore"])
    parser.add_argument("--snapshot", type=Path, required=True)
    for name in ("database", "sync-state", "secrets", "env", "device-key"):
        parser.add_argument(f"--{name}", type=Path)
    args = parser.parse_args()
    if args.action == "capture":
        if any(
            getattr(args, name) is None for name in ("database", "sync_state", "secrets", "env")
        ):
            parser.error("capture requires database, sync-state, secrets and env paths")
        paths = [
            args.database,
            Path(str(args.database) + "-wal"),
            Path(str(args.database) + "-shm"),
            args.sync_state,
            args.secrets,
            args.env,
        ]
        if args.device_key:
            paths.append(args.device_key)
        capture(args.snapshot, paths)
    else:
        restore(args.snapshot)


if __name__ == "__main__":
    main()
