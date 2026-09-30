FROM node:24-bookworm-slim AS build
WORKDIR /opt/app
RUN npm install --global pnpm@12.5.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/backend ./apps/backend
COPY apps/web/package.json ./apps/web/package.json
COPY config ./config
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @qelvora/backend typecheck
RUN pnpm --filter @qelvora/backend exec esbuild src/operations/deploy.ts --bundle --platform=node --target=node24 --format=esm --external:express --external:pg --external:zod --outfile=dist/trust-deploy.mjs

FROM build AS runtime
ENV NODE_ENV=production PORT=4108
COPY infra ./infra
# Reviewed integrations are mounted read-only by the release operator. No secret
# or synthetic adapter is included in the image.
RUN mkdir -p integrations && chown node:node integrations
USER node
EXPOSE 4108
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4108/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","apps/backend/dist/trust-deploy.mjs"]
