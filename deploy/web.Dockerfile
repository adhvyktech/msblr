# Builds the Vite web app. Build context = repo root.
FROM node:22-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps/web/package.json ./apps/web/package.json
COPY apps/api/package.json ./apps/api/package.json
RUN npm ci --workspaces --include-workspace-root
COPY apps/web ./apps/web
RUN npm run build -w @msblr/web

FROM busybox:1.36
COPY --from=build /repo/apps/web/dist /dist
