# syntax=docker/dockerfile:1
#
# saasrow.com, run on Bun.
#
# This file lives at .nixpacks/Dockerfile because that is the path dev2's compose
# stack builds (cli-tools dev2/dev2-site provision records it per site). It used to
# be nixpacks output (Node + npm, plus apt chromium for puppeteer); it is now a
# hand-written Bun image, so do not regenerate it with nixpacks.
#
# No chromium: nothing the web app runs uses puppeteer. It is used by the
# fetch-metadata Supabase edge function (runs on Supabase) and by
# scripts/backfill-listing-assets.mjs (run by hand on a dev box).
#
# Contract with /home/anthony/www/saasrow.com on dev2, unchanged: listens on 3000
# inside the container, answers / for the deploy health check, reads its secrets
# from app.env at run time. The NEXT_PUBLIC_* values arrive as compose build args.

FROM oven/bun:1.4.0-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
# puppeteer's postinstall (a Chrome download) is not a trusted dependency, so bun
# does not run it; the env var says so explicitly.
ENV PUPPETEER_SKIP_DOWNLOAD=1
RUN bun install --frozen-lockfile

FROM deps AS build
COPY . .
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_TELEMETRY_DISABLED=1
# `bun --bun next build` (the build script): Next runs on Bun, not Node.
RUN bun run build

FROM oven/bun:1.4.0-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Docker sets HOSTNAME to the container id and Next's standalone server binds to it
# literally; it must listen on every interface for the published port to reach it.
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=bun:bun /app/.next/standalone ./
COPY --from=build --chown=bun:bun /app/.next/static ./.next/static
COPY --from=build --chown=bun:bun /app/public ./public
USER bun
EXPOSE 3000
# 127.0.0.1, not localhost: localhost resolves ::1 first and Next binds IPv4 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "server.js"]
