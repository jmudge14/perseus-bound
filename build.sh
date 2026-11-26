#!/bin/sh
# Perseus Bound build script (macOS / Linux / Git Bash / WSL).
#
#   ./build.sh                 install deps, run smoke test, build dist/perseus-bound.html
#   ./build.sh --skip-tests    skip the smoke and rules tests
#   ./build.sh --skip-install  reuse existing node_modules
#   ./build.sh --games 200     number of smoke-test games (default 10)
#   ./build.sh --clean         delete node_modules and dist first
#
# Exits non-zero on any failure, so it can be used as-is in CI.
set -eu

cd "$(dirname "$0")"

SKIP_TESTS=0
SKIP_INSTALL=0
CLEAN=0
GAMES=10

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-tests) SKIP_TESTS=1 ;;
    --skip-install) SKIP_INSTALL=1 ;;
    --clean) CLEAN=1 ;;
    --games) shift; GAMES="${1:?--games needs a number}" ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nBUILD FAILED: %s\n' "$1" >&2; exit 1; }

step "Checking Node.js"
command -v node >/dev/null 2>&1 || fail "Node.js is not installed. Get the LTS version from https://nodejs.org"
command -v npm >/dev/null 2>&1 || fail "npm is not on PATH (it normally comes with Node.js)."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node.js 18 or newer is required (found $(node -v))."
echo "node $(node -v), npm $(npm -v)"

if [ "$CLEAN" -eq 1 ]; then
  step "Cleaning"
  rm -rf node_modules dist
fi

if [ "$SKIP_INSTALL" -eq 0 ]; then
  step "Installing dependencies"
  if [ -f package-lock.json ]; then
    npm ci --no-audit --no-fund || fail "npm ci failed."
  else
    npm install --no-audit --no-fund || fail "npm install failed."
  fi
fi

if [ "$SKIP_TESTS" -eq 0 ]; then
  step "Running smoke test ($GAMES games)"
  node scripts/smoke-test.mjs "$GAMES" || fail "smoke test failed."
  step "Running rules test"
  node scripts/rules-test.mjs || fail "rules test failed."
fi

step "Building"
npx vite build || fail "vite build failed."
[ -f dist/index.html ] || fail "dist/index.html was not produced."
cp dist/index.html dist/perseus-bound.html

SIZE=$(wc -c < dist/perseus-bound.html | tr -d ' ')
step "Done: dist/perseus-bound.html ($SIZE bytes)"
