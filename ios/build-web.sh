#!/bin/sh
# Xcode build phase: builds the web app (npm run build → dist/) and copies it into the app as web/.
# Set MM_SKIP_WEB_BUILD=1 to copy the existing dist/ without rebuilding.
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$HOME/.nvm/current/bin:$PATH"
REPO="$SRCROOT/.."
if [ -z "$MM_SKIP_WEB_BUILD" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "error: npm not found; install Node.js, or run 'npm run build' yourself and set MM_SKIP_WEB_BUILD=1"
    exit 1
  fi
  (cd "$REPO" && { [ -d node_modules ] || npm ci; } && npm run build)
fi
if [ ! -f "$REPO/dist/index.html" ]; then
  echo "error: $REPO/dist is missing; run 'npm run build' in the repo first"
  exit 1
fi
DEST="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/web"
rm -rf "$DEST"
mkdir -p "$DEST"
# The service worker is not used in the app (WKWebView has none here); everything else is copied as built.
rsync -a --exclude 'sw.js' --exclude 'workbox-*.js' "$REPO/dist/" "$DEST/"
