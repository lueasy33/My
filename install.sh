#!/usr/bin/env bash
# Установка «Аладдин» на чистый сервер Ubuntu одной командой.
#
#   sudo bash install.sh            — если папка проекта уже на сервере
#   curl -fsSL https://raw.githubusercontent.com/lueasy33/My/main/install.sh | sudo bash
#                                   — если репозиторий открытый
#
# Что делает: ставит Docker, скачивает проект в /opt/aladdin, спрашивает адрес сайта
# и данные первого администратора, запускает сайт с HTTPS. Повторный запуск безопасен:
# база и настройки сохраняются.
set -euo pipefail

REPO="${REPO:-https://github.com/lueasy33/My.git}"
DIR="${DIR:-/opt/aladdin}"

say()  { printf '\n\033[1;35m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
# Вопросы читаем с клавиатуры, даже когда скрипт пришёл через «curl | bash»
ask()  { local v; read -r -p "  $1" v </dev/tty; printf '%s' "$v"; }
asks() { local v; read -r -s -p "  $1" v </dev/tty; echo >/dev/tty; printf '%s' "$v"; }

[ "$(id -u)" -eq 0 ] || fail "Запустите от администратора: sudo bash install.sh"

# ─── 0. Подкачка ─────────────────────────────────────────────
# На самом дешёвом сервере (1 ГБ памяти) сборке сайта не хватает памяти.
# Файл подкачки на 2 ГБ решает это; на больших серверах шаг пропускается.
mem_mb=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 1900 ] && ! swapon --show | grep -q .; then
  say "Памяти ${mem_mb} МБ — добавляю подкачку 2 ГБ…"
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ─── 1. Docker ───────────────────────────────────────────────
if ! command -v docker >/dev/null 2>&1; then
  say "Ставлю Docker (2–3 минуты)…"
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null 2>&1 || fail "Не найден docker compose. Обновите Docker: curl -fsSL https://get.docker.com | sh"

# ─── 2. Файлы проекта ────────────────────────────────────────
here="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$here" ] && [ -f "$here/docker-compose.yml" ]; then
  DIR="$here"
elif [ -d "$DIR/.git" ]; then
  say "Обновляю проект в $DIR…"
  git -C "$DIR" pull --ff-only
elif [ ! -f "$DIR/docker-compose.yml" ]; then
  command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }
  say "Скачиваю проект в $DIR…"
  echo "  Если репозиторий закрытый, GitHub спросит логин и токен (вместо пароля)."
  git clone "$REPO" "$DIR"
fi
cd "$DIR"

# ─── 3. Настройки (.env) ─────────────────────────────────────
if [ ! -f .env ]; then
  ip="$(curl -fsS4 --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
  say "Настройка сайта"
  echo "  Адрес сайта. Если домена нет — просто нажмите Enter,"
  echo "  будет бесплатный адрес https://${ip//./-}.sslip.io"
  while :; do
    domain="$(ask 'Свой домен или просто Enter: ')"
    domain="${domain#https://}"; domain="${domain#http://}"; domain="${domain%%/*}"
    if [ -z "$domain" ]; then domain="${ip//./-}.sslip.io"; break; fi
    # Домен должен уже указывать на этот сервер, иначе HTTPS не получится
    dns="$(getent ahostsv4 "$domain" 2>/dev/null | awk 'NR==1{print $1}' || true)"
    if [ "$dns" = "$ip" ]; then break; fi
    echo "  Домен $domain не указывает на этот сервер ($ip)."
    echo "  Если своего домена нет — просто нажмите Enter."
  done
  echo "  Адрес сайта: https://$domain"

  echo
  echo "  Первый администратор — им вы войдёте на сайт."
  while :; do
    phone="$(ask 'Ваш телефон (например +79161234567): ')"
    digits="${phone//[^0-9]/}"
    [ "${#digits}" -ge 10 ] && break
    echo "  Введите номер телефона цифрами, например +79161234567"
  done
  name="$(ask 'Имя и фамилия: ')"
  [ -n "$name" ] || name="Администратор"
  while :; do
    pass="$(asks 'Пароль (от 8 символов, не показывается): ')"
    pass2="$(asks 'Повторите пароль: ')"
    if [ "${#pass}" -lt 8 ]; then echo "  Пароль короче 8 символов, ещё раз."
    elif [ "$pass" != "$pass2" ]; then echo "  Пароли не совпали, ещё раз."
    elif [[ "$pass$name" == *"'"* ]]; then echo "  Без символа ' (апостроф), пожалуйста."
    else break; fi
  done

  umask 077
  cat > .env <<EOF
DOMAIN=$domain
ADMIN_PHONE=$phone
ADMIN_NAME='$name'
ADMIN_PASSWORD='$pass'
EOF
  chmod 600 .env
else
  say "Настройки уже есть (.env) — оставляю как есть"
  domain="$(grep -E '^DOMAIN=' .env | cut -d= -f2-)"
fi

# ─── 4. Брандмауэр ───────────────────────────────────────────
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

# ─── 5. Запуск ───────────────────────────────────────────────
say "Собираю и запускаю сайт (первый раз 3–5 минут)…"
mkdir -p data
docker compose up -d --build

for i in $(seq 1 60); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:8080/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" 2>/dev/null; then
    say "Готово! Сайт работает: https://$domain"
    echo "  Сертификат HTTPS выдаётся автоматически за 1–2 минуты после первого открытия."
    echo "  Вход — телефоном и паролем администратора, которые вы ввели."
    echo
    echo "  Обновить сайт до новой версии:  sudo bash $DIR/update.sh"
    echo "  Посмотреть ошибки:              cd $DIR && docker compose logs --tail 100"
    exit 0
  fi
  sleep 3
done
fail "Сайт не ответил за 3 минуты. Ошибки: cd $DIR && docker compose logs --tail 100"
