#!/usr/bin/env bash

set -u

failed=0

check_url() {
  local name="$1"
  local url="$2"

  if curl --fail --silent --show-error --max-time 10 "$url" >/dev/null; then
    printf 'healthcheck name=%s status=ok url=%s\n' "$name" "$url"
  else
    printf 'healthcheck name=%s status=failed url=%s\n' "$name" "$url" >&2
    failed=1
  fi
}

check_url "api" "http://127.0.0.1:3030/health"
check_url "n8n" "http://127.0.0.1:5679/healthz"
check_url "public_https" "https://zoho.hdevsolucoes.tech/healthz"

exit "$failed"
