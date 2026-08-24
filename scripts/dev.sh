#!/usr/bin/env bash
# Локальна розробка: Parcel watch (фронтенд) + netlify dev --live (функції + публічний тунель)
set -e

cleanup() {
  kill $(jobs -p) 2>/dev/null
}
trap cleanup EXIT

parcel watch src/frontend/cart.js --dist-dir dist &

netlify dev --live
