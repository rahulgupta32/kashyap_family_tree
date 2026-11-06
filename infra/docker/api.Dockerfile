FROM node:20-bookworm-slim AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . .
RUN pnpm install --frozen-lockfile --store-dir /pnpm/store \
    && pnpm run build:packages \
    && pnpm --filter @kashyap/api run build \
    && pnpm --filter @kashyap/api deploy --prod --frozen-lockfile --store-dir /pnpm/store /runtime \
    && rm -rf /runtime/dist /runtime/src /runtime/test \
    && cp -a services/api/dist /runtime/dist

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
COPY --chown=node:node database/migrations/ ./database/migrations/
COPY --chown=node:node LICENSE NOTICE ./
RUN mkdir -p storage && chown node:node storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
