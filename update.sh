#!/usr/bin/env bash
# Обновление сайта на сервере до последней версии с GitHub.
# База, загруженные файлы и настройки (папка data и файл .env) не трогаются.
#   sudo bash /opt/aladdin/update.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ -d .git ]; then
  echo "▸ Забираю новую версию с GitHub…"
  git pull --ff-only
fi

# Перед обновлением — свежая копия базы, на всякий случай
if [ -f data/aladdin.db ]; then
  mkdir -p data/backups
  cp data/aladdin.db "data/backups/before-update-$(date +%F-%H%M).db"
fi

echo "▸ Пересобираю и перезапускаю…"
docker compose up -d --build
docker image prune -f >/dev/null
echo "▸ Готово."
