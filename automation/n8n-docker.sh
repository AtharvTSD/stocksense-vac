#!/usr/bin/env bash
set -euo pipefail
# Official CE image: no host npm/native compilation; arguments never contain secret values.
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
: "${N8N_USER_FOLDER:?An ephemeral n8n state directory is required}"
mkdir -p -- "$N8N_USER_FOLDER"
workflow_file="${N8N_WORKFLOW_FILE:-$repo_root/automation/stocksense.workflow.json}"
args=("$@")
if [[ "${1:-}" == "import:workflow" ]]; then
  args=("import:workflow" "--input=/workflow/active.json")
fi
exec docker run --rm --network host --user "$(id -u):$(id -g)" \
  --env BACKEND_URL --env INGESTION_TOKEN --env GROQ_API_KEY --env INGEST_MARKET --env RUN_ID \
  --env N8N_USER_FOLDER --env N8N_ENCRYPTION_KEY --env N8N_BLOCK_ENV_ACCESS_IN_NODE \
  --env N8N_DIAGNOSTICS_ENABLED --env N8N_VERSION_NOTIFICATIONS_ENABLED --env N8N_LOG_LEVEL \
  --env EXECUTIONS_DATA_SAVE_ON_ERROR --env EXECUTIONS_DATA_SAVE_ON_SUCCESS \
  --volume "$N8N_USER_FOLDER:$N8N_USER_FOLDER" \
  --volume "$workflow_file:/workflow/active.json:ro" \
  --entrypoint n8n docker.n8n.io/n8nio/n8n:2.48.7 "${args[@]}"
