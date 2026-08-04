# syntax=docker/dockerfile:1

# --- Build ------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies are installed from the lockfile alone, so this layer is only
# rebuilt when the lockfile changes rather than on every source edit.
COPY package.json package-lock.json ./
RUN npm ci

# The Prisma client is generated code: it has to exist before tsc runs, and it
# is built against the schema rather than shipped in node_modules.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Reinstall without dev dependencies for the runtime layer. `npm ci --omit=dev`
# would remove the generated client, so it is restored afterwards.
RUN npm ci --omit=dev && npx prisma generate

# --- Runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production

# tini reaps zombies and forwards SIGTERM, which is what the server's graceful
# shutdown listens for. Without it PID 1 is node and signals are swallowed.
RUN apk add --no-cache tini

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/package.json ./package.json

# Never run the API as root.
USER node

EXPOSE 4000

# Readiness, not liveness: a container that cannot reach MySQL should be pulled
# out of rotation, and restarting it would not help.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
