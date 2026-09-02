# syntax=docker/dockerfile:1

FROM node:24-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
# Prisma reads DATABASE_URL through prisma.config.ts during `prisma generate`.
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app ./
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm start"]
