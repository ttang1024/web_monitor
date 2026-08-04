# syntax=docker/dockerfile:1

# --- Build ------------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vite inlines these at build time via `define`, so they are baked into the
# bundle rather than read at container start — the image is environment-
# specific, and a different API_URL needs a different build.
ARG API_URL=http://localhost:4000/graphql
ARG GEMINI_API_KEY=
ENV API_URL=$API_URL
ENV GEMINI_API_KEY=$GEMINI_API_KEY

RUN npm run build

# --- Runtime ----------------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --quiet --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
