#!/bin/sh
# Calls POST /api/harvest (app/api/harvest/route.ts), which rebuilds the index
# from Wikidata in the background (about ten minutes, one query per second at
# most) and swaps it in when done. Progress is visible on GET /api/meta.
# `kleio` is the app's service name; both containers sit on the shared
# `sites` docker network, so no public hostname or TLS is needed.
set -eu

status=$(curl -sS -o /tmp/harvest-response.json -w '%{http_code}' \
  -X POST "http://kleio:3000/api/harvest" \
  -H "Authorization: Bearer ${KLEIO_HARVEST_SECRET}")

echo "[harvest] HTTP ${status} $(cat /tmp/harvest-response.json)"

if [ "$status" -ge 400 ]; then
  exit 1
fi
