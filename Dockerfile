FROM node:20-alpine AS workspace

WORKDIR /server

RUN npm install pnpm@10.11.1 -g

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/storefront/package.json ./apps/storefront/

FROM workspace AS build-dependencies

RUN pnpm install \
  --filter . \
  --filter @dtc/backend... \
  --frozen-lockfile

FROM build-dependencies AS builder

ENV NODE_ENV=production
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
ENV REDIS_URL=redis://127.0.0.1:6379
ENV STORE_CORS=http://localhost:8000
ENV ADMIN_CORS=http://localhost:9000
ENV AUTH_CORS=http://localhost:8000,http://localhost:9000
ENV JWT_SECRET=build-only-placeholder
ENV COOKIE_SECRET=build-only-placeholder

COPY apps/backend ./apps/backend

RUN pnpm --dir apps/backend build

FROM workspace AS production-dependencies

ENV NODE_ENV=production

RUN pnpm install \
  --filter @dtc/backend... \
  --prod \
  --frozen-lockfile

FROM node:20-alpine AS runner

WORKDIR /server/apps/backend

ENV NODE_ENV=production
ENV PORT=9000

COPY --from=production-dependencies /server/node_modules /server/node_modules
COPY --from=production-dependencies /server/apps/backend/node_modules ./node_modules
COPY --from=builder /server/apps/backend/.medusa/server ./
COPY start.sh /server/start.sh

RUN chmod +x /server/start.sh

EXPOSE 9000

ENTRYPOINT ["/server/start.sh"]
