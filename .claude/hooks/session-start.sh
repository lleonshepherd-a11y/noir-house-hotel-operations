#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm ci --no-audit --no-fund

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
export PATH="$HOME/.local/bin:$PATH"

uv tool install --quiet "graphifyy[sql]"
graphify install --platform claude >/dev/null

if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$CLAUDE_ENV_FILE"
fi
