FROM node:20-bookworm-slim AS build
WORKDIR /build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY . .
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} NEXT_TELEMETRY_DISABLED=1
RUN node -e "const s=process.env.NEXT_PUBLIC_API_URL;const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||s.endsWith('/'))throw Error('Explicit HTTPS API origin required')" \
    && pnpm install --frozen-lockfile --store-dir /pnpm/store \
    && pnpm run build:packages \
    && pnpm --filter @kashyap/admin run build \
    && pnpm --filter @kashyap/admin deploy --prod --frozen-lockfile --store-dir /pnpm/store /runtime \
    && rm -rf /runtime/.next /runtime/src /runtime/test \
    && cp -a apps/admin/.next /runtime/.next \
    && cp apps/admin/next.config.js /runtime/next.config.js

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
COPY --chown=node:node LICENSE NOTICE ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
