FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app

# libpq/psycopg come as binary wheels; no compiler needed.
COPY requirements.txt requirements-dev.txt ./
ARG INSTALL_DEV=false
RUN if [ "$INSTALL_DEV" = "true" ]; then pip install -r requirements-dev.txt; \
    else pip install -r requirements.txt; fi

RUN groupadd --system app && useradd --system --gid app --home /app app
COPY --chown=app:app . .
RUN mkdir -p /app/media /app/private_media /app/staticfiles \
    && chown -R app:app /app/media /app/private_media /app/staticfiles

USER app
EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
# web (prod). Dev compose overrides with: python manage.py runserver 0.0.0.0:8000
# worker: celery -A config worker -l info
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--access-logfile", "-"]
