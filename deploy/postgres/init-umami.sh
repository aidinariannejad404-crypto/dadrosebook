#!/bin/sh
# Creates the Umami role + database on the shared Postgres server.
# Mounted into /docker-entrypoint-initdb.d/, so Postgres runs it ONCE, when the data volume is
# empty. On an existing volume run it by hand (see docs/deploy.md):
#   docker compose -f docker-compose.prod.yml --env-file .env.prod exec db \
#     sh /docker-entrypoint-initdb.d/10-init-umami.sh
set -eu

: "${UMAMI_DB_PASSWORD:?UMAMI_DB_PASSWORD is not set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "${POSTGRES_DB:-postgres}" \
  -v umami_password="$UMAMI_DB_PASSWORD" <<'SQL'
SELECT 'CREATE ROLE umami LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'umami')\gexec
ALTER ROLE umami WITH LOGIN PASSWORD :'umami_password';
SELECT 'CREATE DATABASE umami OWNER umami'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec
REVOKE ALL ON DATABASE umami FROM PUBLIC;
SQL
