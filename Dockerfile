FROM node:20-alpine AS base

# Install dependencies for building native modules and network tools
RUN apk add --no-cache python3 make g++ iputils speedtest-cli

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

# Build the application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image
FROM node:20-alpine AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache iputils speedtest-cli

ENV NODE_ENV=production
ENV OUTPOST_DATA_DIR=/data

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 outpost

# Copy built application
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.js ./

# Create data directory
RUN mkdir -p /data && chown outpost:nodejs /data

USER outpost

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
