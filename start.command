#!/bin/sh
# Запуск Аладдин LMS на macOS и Linux.
# Первый запуск: установка компонентов и создание базы. Дальше — просто старт.
set -e
cd "$(dirname "$0")"

echo ""
echo "  =================================================="
echo "     ALADDIN LMS"
echo "  =================================================="
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is NOT installed."
  echo ""
  echo "  What to do:"
  echo "    1. Open https://nodejs.org"
  echo "    2. Download and install the LTS version"
  echo "    3. Run this file again"
  echo ""
  exit 1
fi

MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$MAJOR" -lt 22 ]; then
  echo "  Node.js is too old ($(node -v)). Version 22.5 or newer is required."
  echo "  Install the current LTS version from https://nodejs.org"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "  [1/3] Installing components. This takes 1-2 minutes..."
  echo ""
  npm install --no-audit --no-fund
  echo ""
fi

# Интерфейс собирается один раз (в GitHub он не хранится)
if [ ! -f build/index.html ]; then
  echo "  Building the site interface..."
  npm run build
  echo ""
fi

if [ ! -f data/aladdin.db ]; then
  echo "  [2/3] Creating the demo database..."
  npm run seed
  echo ""
fi

echo "  [3/3] Starting the server..."
echo ""
exec node server/index.js
