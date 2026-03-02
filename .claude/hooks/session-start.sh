#!/bin/bash
set -euo pipefail

# Only run in remote web sessions
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "==> Installing root dependencies..."
cd "${CLAUDE_PROJECT_DIR}"
npm install

echo "==> Installing ai-video-studio dependencies..."
cd "${CLAUDE_PROJECT_DIR}/ai-video-studio"
npm install

echo "==> Session startup complete."
