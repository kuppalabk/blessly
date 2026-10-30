# Blessly — one image runs the web app, the job worker and migrations.
#   docker build -t wishwell .
#   docker run --env-file .env -p 3000:3000 wishwell                 # web
#   docker run --env-file .env wishwell npm run jobs                 # worker (every minute)
#   docker run --env-file .env wishwell npm run db:migrate           # once per release
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Playwright is a devDependency used only by browser tests. Skip its browser
# download so image builds (droplet and App Platform) don't fetch it.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Optional: a corporate or build-network proxy, passed with --build-arg (empty by default).
ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG NO_PROXY
# Retry slow or dropped downloads instead of failing the whole build.
ENV npm_config_fetch_retries=5 npm_config_fetch_retry_mintimeout=20000 npm_config_fetch_timeout=300000
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 UPLOAD_DIR=/data/uploads
# tsx is kept so the same image can run migrations and the job worker.
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs /app/tsconfig.json /app/drizzle.config.ts ./
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
RUN mkdir -p /data/uploads && chown -R node:node /data /app/.next
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npx", "next", "start", "-p", "3000"]
