#!/usr/bin/env bash
set -Eeuo pipefail

BRANCH="${BRANCH:-feat/structured-logs}"
VPS_USER="${VPS_USER:-zoho-deploy}"
VPS_HOST="${VPS_HOST:-}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_zoho_deploy}"
REMOTE_DIR="${REMOTE_DIR:-/home/zoho-deploy/zoho-crm-api-study}"
PUSH=0
DEPLOY=0

usage() {
  cat <<'USAGE'
Uso:
  VPS_HOST=187.77.61.83 ./ops/publish-vps.sh --push --deploy

Opções:
  --push    publica a branch no repositório remoto
  --deploy  atualiza a VPS e valida os serviços
USAGE
}

for argument in "$@"; do
  case "$argument" in
    --push) PUSH=1 ;;
    --deploy) DEPLOY=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Argumento desconhecido: $argument" >&2; usage >&2; exit 2 ;;
  esac
done

[[ "$(git branch --show-current)" == "$BRANCH" ]] || {
  echo "A branch atual não é $BRANCH." >&2
  exit 1
}

git diff --check
git diff --quiet && git diff --cached --quiet || {
  echo "Há alterações locais rastreadas; revise-as antes de publicar." >&2
  git status --short >&2
  exit 1
}

npm test

if (( DEPLOY )); then
  [[ -n "$VPS_HOST" ]] || { echo "Defina VPS_HOST para usar --deploy." >&2; exit 2; }
  [[ -r "$SSH_KEY" ]] || { echo "Chave SSH não encontrada: $SSH_KEY" >&2; exit 2; }

  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 \
    "$VPS_USER@$VPS_HOST" bash -s -- "$REMOTE_DIR" <<'REMOTE_PREFLIGHT'
set -Eeuo pipefail
remote_dir="$1"
cd "$remote_dir"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "A VPS possui alterações locais; nenhum push ou pull foi executado." >&2
  git status --short >&2
  exit 1
fi
REMOTE_PREFLIGHT
fi

if (( PUSH )); then
  git push origin "$BRANCH"
fi

if (( DEPLOY )); then
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 \
    "$VPS_USER@$VPS_HOST" bash -s -- "$BRANCH" "$REMOTE_DIR" <<'REMOTE'
set -Eeuo pipefail
branch="$1"
remote_dir="$2"
cd "$remote_dir"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "A VPS possui alterações locais; nenhum pull foi executado." >&2
  git status --short >&2
  exit 1
fi

git fetch origin "$branch"
git merge --ff-only "origin/$branch"
npm test
docker compose --env-file .env.n8n -f compose.n8n.yaml up -d --build
curl -fsS http://127.0.0.1:3030/health >/dev/null
curl -fsS http://127.0.0.1:3030/readiness >/dev/null
curl -fsS http://127.0.0.1:5679/healthz >/dev/null
curl -fsSI https://zoho.hdevsolucoes.tech/healthz >/dev/null
docker compose --env-file .env.n8n -f compose.n8n.yaml ps
git rev-parse HEAD
REMOTE
fi
