# syntax=docker/dockerfile:1

FROM node:22-bookworm AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN pnpm install --frozen-lockfile --filter backend...

COPY apps/backend ./apps/backend

RUN pnpm --filter backend build \
  && pnpm --filter backend deploy --prod /out

# Playwright browsers + system deps; pin matches apps/backend (pnpm-lock)
FROM mcr.microsoft.com/playwright:v1.58.2-noble AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

COPY --from=builder /out ./

EXPOSE 3001

CMD ["node", "dist/main.js"]
