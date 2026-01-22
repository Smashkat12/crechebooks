#!/bin/sh
set -e

echo "Checking DATABASE_URL..."
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set!"
  exit 1
fi
echo "DATABASE_URL is set (length: ${#DATABASE_URL} characters)"

echo "Running database migrations..."
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy

echo "Regenerating Prisma Client after migrations..."
npx prisma generate

echo "Starting API server..."
exec node dist/src/main
