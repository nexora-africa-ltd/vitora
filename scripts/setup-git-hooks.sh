#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$repo_root"

if [ ! -d ".githooks" ]; then
  echo "❌ .githooks not found; are you in the repo root?" >&2
  exit 1
fi

# Ensure hooks are executable (required by git)
chmod +x .githooks/* 2>/dev/null || true

git config core.hooksPath .githooks

echo "✅ Git hooks enabled (core.hooksPath=.githooks)"
