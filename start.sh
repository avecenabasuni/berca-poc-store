#!/bin/sh
cd /server/apps/backend

echo "Running database migrations..."
pnpm medusa db:migrate

echo "Seeding database..."
pnpm seed || echo "Seeding failed, continuing..."

echo "Starting Medusa development server..."
export NODE_OPTIONS="-r dd-trace/init --import dd-trace/register.js"
pnpm dev
