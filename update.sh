#!/usr/bin/env bash
# Обновление сайта на сервере до последней версии с GitHub.
# База, загруженные файлы и настройки (папка data и файл .env) не трогаются.
#   sudo bash /opt/aladdin/update.sh
#
# На сервере с 1 ГБ памяти сборка новой версии рядом с работающей старой
# однажды повесила сервер целиком. Поэтому при малой памяти сайт на время
# сборки останавливается (2–4 минуты), зато сервер остаётся живым.
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

# Подкачка нужна при любой памяти меньше 2 ГБ: без неё сборка падает или вешает систему
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 1900 ] && ! swapon --show | grep -q .; then
  echo "▸ Добавляю подкачку 2 ГБ…"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [ "$mem_mb" -lt 1900 ]; then
  echo "▸ Памяти ${mem_mb} МБ — останавливаю сайт на время сборки (2–4 минуты)…"
  docker compose stop app
  # Старые слои сборки занимают место и память при следующей сборке
  docker builder prune -f >/dev/null 2>&1 || true
fi

echo "▸ Собираю новую версию…"
if ! docker compose build app; then
  echo "✗ Сборка не удалась — запускаю прежнюю версию"
  docker compose up -d
  exit 1
fi

echo "▸ Запускаю…"
docker compose up -d
docker image prune -f >/dev/null

# Ждём, пока сайт ответит
for i in $(seq 1 40); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    echo "▸ Готово. Сайт работает."
    exit 0
  fi
  sleep 3
done
echo "✗ Сайт не ответил за 2 минуты. Ошибки: docker compose logs app --tail 100"
exit 1
