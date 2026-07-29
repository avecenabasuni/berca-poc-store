#!/bin/sh
cd /server/apps/storefront

echo "Starting Next.js Starter Storefront development server..."
export NODE_OPTIONS="-r dd-trace/init"
pnpm dev
