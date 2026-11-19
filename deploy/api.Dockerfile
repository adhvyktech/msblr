# API image. Build context = repo root.
FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --workspaces --include-workspace-root
COPY apps/api ./apps/api
# receipt PDFs embed the Sabha logo from the web public folder
COPY apps/web/public ./apps/web/public
RUN npx prisma generate --schema apps/api/prisma/schema.prisma

FROM node:22-bookworm-slim AS run
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
RUN mkdir -p /data/uploads && chown -R node:node /data /repo
USER node
WORKDIR /repo/apps/api
EXPOSE 4000
# Apply pending migrations, then start. (Seed is NOT run in production; see DEPLOY.md for the first admin.)
CMD ["sh", "-c", "npx prisma migrate deploy && npx tsx src/index.ts"]
