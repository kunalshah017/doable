#!/usr/bin/env bash
set -euo pipefail

: "${OPENAI_API_KEY:?OPENAI_API_KEY is required}"
: "${SUPERMEMORY_API_KEY:?SUPERMEMORY_API_KEY is required}"
: "${API_SERVER_KEY:?API_SERVER_KEY is required}"

export HERMES_API_KEY="${HERMES_API_KEY:-$API_SERVER_KEY}"
export HERMES_API_URL="${HERMES_API_URL:-http://127.0.0.1:8642}"
export SUPERMEMORY_CONTAINER_TAG="${SUPERMEMORY_CONTAINER_TAG:-doable-production}"
export HOME="$HERMES_HOME/home"

mkdir -p "$HERMES_HOME" "$HOME"
cd /opt/doable

if [[ ! -f "$HERMES_HOME/config.yaml" ]]; then
  cat > "$HERMES_HOME/config.yaml" <<EOF
model:
  provider: openai-api
  default: ${HERMES_MODEL:-gpt-5.4}
  base_url: https://api.openai.com/v1
memory:
  provider: supermemory
agent:
  max_turns: 60
  reasoning_effort: medium
EOF
fi

cat > "$HERMES_HOME/supermemory.json" <<EOF
{
  "container_tag": "${SUPERMEMORY_CONTAINER_TAG}",
  "auto_recall": true,
  "auto_capture": true,
  "max_recall_results": 5,
  "profile_frequency": 25,
  "capture_mode": "all",
  "search_mode": "hybrid",
  "api_timeout": 5.0
}
EOF

chown -R hermes:hermes "$HERMES_HOME"

hermes_cli=(/command/s6-setuidgid hermes /opt/hermes/.venv/bin/hermes)
"${hermes_cli[@]}" config set model.provider openai-api
"${hermes_cli[@]}" config set model.default "${HERMES_MODEL:-gpt-5.4}"
"${hermes_cli[@]}" config set model.base_url https://api.openai.com/v1
"${hermes_cli[@]}" config set memory.provider supermemory

shutdown() {
  if [[ -n "${gateway_pid:-}" ]]; then
    kill "$gateway_pid" 2>/dev/null || true
  fi
}
trap shutdown EXIT INT TERM

"${hermes_cli[@]}" gateway run --no-supervise &
gateway_pid=$!

for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:8642/health >/dev/null; then
    break
  fi
  if ! kill -0 "$gateway_pid" 2>/dev/null; then
    echo "Hermes gateway exited before becoming healthy" >&2
    exit 1
  fi
  sleep 1
done

curl -fsS http://127.0.0.1:8642/health >/dev/null || {
  echo "Hermes gateway did not become healthy" >&2
  exit 1
}

exec /command/s6-setuidgid hermes \
  /opt/doable/.venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}"