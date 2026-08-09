#!/bin/sh
set -eu

cd /server/apps/backend

echo "Running database migrations..."
./node_modules/.bin/medusa db:migrate

echo "Reconciling idempotent Berca POC commerce data..."
./node_modules/.bin/medusa exec src/migration-scripts/initial-data-seed.js

echo "Starting Medusa production server..."
exec ./node_modules/.bin/medusa start
