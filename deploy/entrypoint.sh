#!/bin/sh
set -eu

python manage.py migrate --noinput
python manage.py collectstatic --noinput
python manage.py create_admin
if [ "${SEED_DATA:-false}" = "true" ]; then
    python manage.py seed_data
fi

exec "$@"
