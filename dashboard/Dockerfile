# syntax=docker/dockerfile:1

# --- Build ------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines this at build time via `define`, so it is baked into the bundle
# rather than read at container start — the image is environment-specific, and
# a different API_URL needs a different build. No secret belongs here: this
# ARG/ENV pair ends up readable by anyone who loads the built dashboard.
ARG API_URL=http://localhost:4000/graphql
ENV API_URL=$API_URL

RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
