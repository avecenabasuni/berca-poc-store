#!/bin/sh
set -eu

cd /server/apps/backend

echo "Running database migrations..."
./node_modules/.bin/medusa db:migrate

echo "Starting Medusa production server..."
exec ./node_modules/.bin/medusa start
