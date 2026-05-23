# =============================================================================
# Vitora HMIS Web App - Production Dockerfile (Next.js Standalone)
# =============================================================================
# Multi-stage build for minimal image size (~150MB vs ~1GB)
# Output: standalone Node.js server (no `next start` CLI needed)
# =============================================================================

# --- Stage 1: Install dependencies ---
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts

# --- Stage 2: Build the application ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time environment variables (NEXT_PUBLIC_* are baked into the bundle)
# These are passed via --build-arg in the CI workflow
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_NAME=Vitora HMIS
ARG NEXT_PUBLIC_ENV=production
ARG NEXT_PUBLIC_DEMO_MODE=false
ARG NEXT_PUBLIC_ENABLE_BILLING=true
ARG NEXT_PUBLIC_ENABLE_LAB=true
ARG NEXT_PUBLIC_ENABLE_PHARMACY=true
ARG NEXT_PUBLIC_ENABLE_TRIAGE=true
ARG NEXT_PUBLIC_ENABLE_INPATIENT=true
ARG NEXT_PUBLIC_ENABLE_THEATRE=true
ARG NEXT_PUBLIC_ENABLE_AI=true
ARG NEXT_PUBLIC_POWERSYNC_URL
ARG NEXT_PUBLIC_SENTRY_DSN

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_NAME=$NEXT_PUBLIC_APP_NAME
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV
ENV NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE
ENV NEXT_PUBLIC_ENABLE_BILLING=$NEXT_PUBLIC_ENABLE_BILLING
ENV NEXT_PUBLIC_ENABLE_LAB=$NEXT_PUBLIC_ENABLE_LAB
ENV NEXT_PUBLIC_ENABLE_PHARMACY=$NEXT_PUBLIC_ENABLE_PHARMACY
ENV NEXT_PUBLIC_ENABLE_TRIAGE=$NEXT_PUBLIC_ENABLE_TRIAGE
ENV NEXT_PUBLIC_ENABLE_INPATIENT=$NEXT_PUBLIC_ENABLE_INPATIENT
ENV NEXT_PUBLIC_ENABLE_THEATRE=$NEXT_PUBLIC_ENABLE_THEATRE
ENV NEXT_PUBLIC_ENABLE_AI=$NEXT_PUBLIC_ENABLE_AI
ENV NEXT_PUBLIC_POWERSYNC_URL=$NEXT_PUBLIC_POWERSYNC_URL
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage 3: Production runner ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy only what standalone needs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
