#!/usr/bin/env bash
# Daily backup of the database (pg_dump) and uploaded files.
# Keeps 14 daily backups and 8 weekly backups (Sunday copies).
# Cron (as the deploy user):  15 2 * * *  /opt/msblr/deploy/backup.sh >> /var/log/msblr-backup.log 2>&1
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/msblr}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/msblr}"
COMPOSE="docker compose --env-file ${APP_DIR}/deploy/.env.production -f ${APP_DIR}/deploy/docker-compose.yml"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${BACKUP_DIR}/daily" "${BACKUP_DIR}/weekly"
set -a; . "${APP_DIR}/deploy/.env.production"; set +a

echo "[$(date -Is)] database dump"
${COMPOSE} exec -T db pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --format=custom --no-owner > "${BACKUP_DIR}/daily/db-${STAMP}.dump"

echo "[$(date -Is)] uploads archive"
${COMPOSE} exec -T api tar -C /data -czf - uploads > "${BACKUP_DIR}/daily/uploads-${STAMP}.tar.gz"

# refuse to keep empty files
find "${BACKUP_DIR}/daily" -type f -size 0 -delete

# weekly copy on Sundays
if [ "$(date +%u)" = "7" ]; then
  cp "${BACKUP_DIR}/daily/db-${STAMP}.dump" "${BACKUP_DIR}/weekly/"
  cp "${BACKUP_DIR}/daily/uploads-${STAMP}.tar.gz" "${BACKUP_DIR}/weekly/"
fi

# retention: 14 daily sets, 8 weekly sets (2 files per set)
ls -1t "${BACKUP_DIR}"/daily/db-* 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "${BACKUP_DIR}"/daily/uploads-* 2>/dev/null | tail -n +15 | xargs -r rm -f
ls -1t "${BACKUP_DIR}"/weekly/db-* 2>/dev/null | tail -n +9 | xargs -r rm -f
ls -1t "${BACKUP_DIR}"/weekly/uploads-* 2>/dev/null | tail -n +9 | xargs -r rm -f

echo "[$(date -Is)] done: ${STAMP}"
