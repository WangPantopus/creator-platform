#!/bin/zsh
set -e
set -a
source "$HOME/.config/creator-platform/w5-20261001/secrets.env"
set +a
export TRUST_API_DATABASE_URL="postgres://creator_trust_runtime:${W5_TRUST_RUNTIME_PASSWORD}@127.0.0.1:55435/creator_w5"
export TRUST_WORKER_DATABASE_URL="postgres://creator_trust_worker:${W5_TRUST_WORKER_PASSWORD}@127.0.0.1:55435/creator_w5"
export GROWTH_API_DATABASE_URL="postgres://w5_content_runtime:${W5_RUNTIME_PASSWORD}@127.0.0.1:55435/creator_w5"
export DATABASE_URL="postgres://creator_runtime:${W5_RUNTIME_PASSWORD}@127.0.0.1:55435/creator_w5"
export W5_AGENT_DATABASE_URL="postgres://creator_runtime:${W5_RUNTIME_PASSWORD}@127.0.0.1:55435/creator_w5"
export GROWTH_WORKER_DATABASE_URL="postgres://growth_worker:${W5_GROWTH_WORKER_PASSWORD}@127.0.0.1:55435/creator_w5"
export GROWTH_ENCRYPTION_KEY=$(node -e 'const key=Buffer.from(process.env.W5_GROWTH_ENCRYPTION_KEY,"base64");if(key.length!==32)process.exit(1);process.stdout.write(key.toString("hex"));')
export RELEASE_REVISION=$(git rev-parse HEAD)
NODE_ENV=development TRUST_LOCAL_DEVELOPMENT=true TRUST_CORE_DATABASE_ROLE=creator_runtime WEB_ORIGIN=http://localhost:30055 W5_API_PORT=41055 GROWTH_ENABLED=true COMMERCE_CURRENCY=USD W5_SESSION_KEY_FILE="$HOME/.config/creator-platform/w5-20261001/session-key" W5_CONTENT_WORKER=0 pnpm --filter @qelvora/backend exec tsx src/modules/content/development-server.ts
