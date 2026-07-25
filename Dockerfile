FROM node:22-alpine AS base

# Install dependencies for building native modules and network tools
RUN apk add --no-cache python3 make g++ iputils speedtest-cli

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# Install production-only dependencies (no devDependencies), for the runtime image.
# Uses `base` (not a slim node image) because better-sqlite3 is a production
# dependency and needs python3/make/g++ to compile its native bindings.
FROM base AS prod-deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM node:22-alpine AS runner
WORKDIR /app

# Install runtime dependencies (speedtest-cli kept as fallback engine)
RUN apk add --no-cache iputils speedtest-cli

# Install Ookla speedtest CLI (static musl build) for live progress output
ARG OOKLA_SPEEDTEST_VERSION=1.2.0
RUN ARCH="$(apk --print-arch)" && \
    case "$ARCH" in \
      x86_64) ST_ARCH=x86_64 ;; \
      aarch64) ST_ARCH=aarch64 ;; \
      armv7) ST_ARCH=armhf ;; \
      *) ST_ARCH=x86_64 ;; \
    esac && \
    wget -qO /tmp/ookla-speedtest.tgz \
      "https://install.speedtest.net/app/cli/ookla-speedtest-${OOKLA_SPEEDTEST_VERSION}-linux-${ST_ARCH}.tgz" && \
    tar -xzf /tmp/ookla-speedtest.tgz -C /usr/local/bin speedtest && \
    rm /tmp/ookla-speedtest.tgz

ENV NODE_ENV=production
ENV OUTPOST_DATA_DIR=/data

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 outpost

# Copy built application
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.js ./

# Create data directory
RUN mkdir -p /data && chown outpost:nodejs /data

USER outpost

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
