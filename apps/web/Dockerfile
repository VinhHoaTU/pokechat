# syntax=docker/dockerfile:1
FROM oven/bun:1-slim AS build

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --filter @pokechat/web

COPY apps/web/index.html apps/web/tsconfig.json apps/web/vite.config.ts apps/web/
COPY apps/web/src/ apps/web/src/
RUN bun run --filter @pokechat/web build

FROM nginx:stable-alpine
COPY --from=build /app/apps/web/dist/ /usr/share/nginx/html/

COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $api_upstream api:3000;
        proxy_pass http://$api_upstream;
        proxy_read_timeout 900s;
    }
}
EOF
