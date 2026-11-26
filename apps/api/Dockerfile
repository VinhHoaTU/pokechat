# syntax=docker/dockerfile:1
FROM oven/bun:1-slim

WORKDIR /app
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile --production --filter @pokechat/api

COPY apps/api/src/ apps/api/src/
WORKDIR /app/apps/api

# Allow Ollama requests to outlive Bun's default HTTP idle timeout.
COPY <<'EOF' docker-start.ts
import server from "./src/index";

Bun.serve({ ...server, hostname: "0.0.0.0", idleTimeout: 0 });
EOF

ENV NODE_ENV=production CACHE_DIR=/app/cache
RUN mkdir -p /app/cache && chown bun:bun /app/cache
USER bun

EXPOSE 3000
CMD ["bun", "docker-start.ts"]
