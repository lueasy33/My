#!/usr/bin/env bash
# Переезд сайта «Аладдин» на новый сервер вместе с данными.
# Запускается на НОВОМ сервере, адрес старого — аргументом:
#   curl -fsSL https://raw.githubusercontent.com/lueasy33/My/main/migrate.sh | bash -s 83.217.203.60
#
# Что делает:
#   1. Ставит Docker и скачивает проект в /opt/aladdin.
#   2. Останавливает сайт на старом сервере (чтобы данные не разошлись)
#      и забирает оттуда папку data и файл .env — спросит пароль root старого сервера.
#   3. Меняет адрес сайта на адрес нового сервера и запускает сайт.
# Старый сервер не удаляется: если что-то пойдёт не так, сайт на нём можно
# вернуть командой на старом сервере:  cd /opt/aladdin && docker compose start app
set -euo pipefail

OLD="${1:-}"
REPO="${REPO:-https://github.com/lueasy33/My.git}"
DIR=/opt/aladdin
say()  { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ -n "$OLD" ] || fail "Укажите IP старого сервера: bash migrate.sh 83.217.203.60"
[ "$(id -u)" -eq 0 ] || fail "Запустите от root"
[ ! -f "$DIR/data/aladdin.db" ] || fail "На этом сервере уже есть база ($DIR/data). Переезд остановлен, чтобы ничего не затереть"

if ! command -v docker >/dev/null 2>&1; then
  say "Ставлю Docker (2–3 минуты)…"
  curl -fsSL https://get.docker.com | sh
fi
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

if [ ! -d "$DIR/.git" ]; then
  say "Скачиваю проект…"
  git clone "$REPO" "$DIR"
fi
cd "$DIR"

say "Забираю данные со старого сервера $OLD"
echo "  Сейчас спросит пароль root СТАРОГО сервера (символы не видны)."
echo "  Сайт на старом сервере остановится, чтобы данные не разошлись."
ssh -o StrictHostKeyChecking=accept-new "root@$OLD" \
  'cd /opt/aladdin && docker compose stop app >/dev/null 2>&1; tar czf - data .env' \
  | tar xzf - -C "$DIR"
[ -f data/aladdin.db ] || fail "База не перенеслась. Сайт на старом сервере можно вернуть: cd /opt/aladdin && docker compose start app"
echo "  Перенесено: $(du -sh data | cut -f1), сотрудников в базе — смотрите после запуска"

# Новый адрес: свой домен оставляем как есть, адрес вида IP.sslip.io меняем на новый IP
ip="$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
old_domain="$(grep -E '^DOMAIN=' .env | cut -d= -f2- || true)"
if [ -z "$old_domain" ] || [[ "$old_domain" == *sslip.io ]]; then
  new_domain="${ip//./-}.sslip.io"
  sed -i "s#^DOMAIN=.*#DOMAIN=$new_domain#" .env
  grep -q '^DOMAIN=' .env || echo "DOMAIN=$new_domain" >> .env
else
  new_domain="$old_domain"
  echo "  Свой домен $old_domain: переключите его A-запись на $ip"
fi
chmod 600 .env

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

say "Собираю и запускаю сайт (3–5 минут)…"
docker compose up -d --build

for i in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>r.json()).then(j=>{console.log('  Пользователей в базе: '+j.users);process.exit(0)},()=>process.exit(1))" 2>/dev/null; then
    say "Готово! Сайт переехал: https://$new_domain"
    echo "  Сертификат HTTPS выдаётся за 1–2 минуты после первого открытия."
    echo "  Вход — прежними телефонами и паролями."
    exit 0
  fi
  sleep 3
done
fail "Сайт не ответил за 3 минуты. Ошибки: cd $DIR && docker compose logs app --tail 100"
