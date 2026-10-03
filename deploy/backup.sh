#!/usr/bin/env bash
# Nightly backup of the production stack:
#   - pg_dump of the store database and the Umami database (gzip)
#   - tar.gz of the media volumes (only when USE_S3=false; with S3 the buckets hold the files)
#   - deletes local backups older than BACKUP_KEEP_DAYS
#   - optional off-site copy: aws cli (BACKUP_S3_BUCKET) or rclone (BACKUP_RCLONE_REMOTE)
#
# Usage (from the repository root on the server):
#   deploy/backup.sh                 # reads .env.prod
#   ENV_FILE=/path/.env.prod deploy/backup.sh
# Cron (03:30 every night):
#   30 3 * * * cd /opt/dadrosebook && deploy/backup.sh >> /var/log/dadrosebook-backup.log 2>&1
# Restore: docs/deploy.md («بازیابی از پشتیبان»).
set -euo pipefail

cd "$(dirname "$0")/.."
ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "env file $ENV_FILE not found" >&2
  exit 1
fi

# Read only the variables we need (do not `source` the whole file: values may contain spaces).
env_value() {
  local line
  line="$(grep -E "^$1=" "$ENV_FILE" | tail -n 1 || true)"
  printf '%s' "${line#*=}"
}

POSTGRES_USER="$(env_value POSTGRES_USER)"
POSTGRES_DB="$(env_value POSTGRES_DB)"
USE_S3="$(env_value USE_S3)"
BACKUP_DIR="${BACKUP_DIR:-$(env_value BACKUP_DIR)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dadrosebook}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-$(env_value BACKUP_KEEP_DAYS)}"
KEEP_DAYS="${KEEP_DAYS:-14}"
S3_BUCKET="$(env_value BACKUP_S3_BUCKET)"
S3_ENDPOINT="$(env_value BACKUP_S3_ENDPOINT_URL)"
RCLONE_REMOTE="$(env_value BACKUP_RCLONE_REMOTE)"

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
umask 077

created=()

dump_db() {
  local db="$1" out="$BACKUP_DIR/$1-$STAMP.sql.gz"
  echo "dumping database $db → $out"
  compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$db" --no-owner --clean --if-exists \
    | gzip -9 > "$out.partial"
  mv "$out.partial" "$out"
  created+=("$out")
}

dump_db "${POSTGRES_DB:?POSTGRES_DB missing in $ENV_FILE}"
if compose exec -T db psql -U "$POSTGRES_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'umami'" | grep -q 1; then
  dump_db umami
else
  echo "database umami not found, skipped"
fi

if [[ "${USE_S3,,}" != "true" ]]; then
  out="$BACKUP_DIR/media-$STAMP.tar.gz"
  echo "archiving media volumes → $out"
  compose exec -T backend tar -czf - -C /app media private_media > "$out.partial"
  mv "$out.partial" "$out"
  created+=("$out")
fi

echo "removing local backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name '*.tar.gz' \) \
  -mtime +"$KEEP_DAYS" -print -delete

if [[ -n "$S3_BUCKET" ]]; then
  if command -v aws >/dev/null 2>&1; then
    endpoint_args=()
    [[ -n "$S3_ENDPOINT" ]] && endpoint_args=(--endpoint-url "$S3_ENDPOINT")
    for f in "${created[@]}"; do
      aws "${endpoint_args[@]}" s3 cp "$f" "s3://$S3_BUCKET/$(basename "$f")"
    done
  else
    echo "BACKUP_S3_BUCKET is set but the aws cli is not installed; off-site copy skipped" >&2
  fi
elif [[ -n "$RCLONE_REMOTE" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    for f in "${created[@]}"; do
      rclone copy "$f" "$RCLONE_REMOTE"
    done
  else
    echo "BACKUP_RCLONE_REMOTE is set but rclone is not installed; off-site copy skipped" >&2
  fi
fi

echo "backup finished: ${created[*]}"
