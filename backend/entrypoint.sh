#!/bin/sh
# Wait for the database, apply migrations, collect static files (non-DEBUG), then run the command.
set -e

python - <<'PY'
import os
import sys
import time

import django
from django.db import connection
from django.db.utils import OperationalError

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.prod")
django.setup()
for attempt in range(60):
    try:
        connection.ensure_connection()
        break
    except OperationalError:
        print("waiting for database…", flush=True)
        time.sleep(1)
else:
    sys.exit("database not reachable")
PY

if [ "${RUN_MIGRATIONS:-1}" = "1" ]; then
  python manage.py migrate --noinput
fi

case "$(echo "${DEBUG:-false}" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes|on) ;;
  *) python manage.py collectstatic --noinput ;;
esac

exec "$@"
