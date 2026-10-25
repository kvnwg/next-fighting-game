# The game server: one process serving the built client and the WebSocket on $PORT, with the
# profiles in $DATA_DIR (mount a volume there). See DEPLOY.md.
#
#   docker build -t deflect .
#   docker run -p 8080:8080 -v deflect-data:/data deflect

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    NODE_OPTIONS=--disable-warning=ExperimentalWarning
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY --from=build /app/dist/client ./dist/client
EXPOSE 8080
VOLUME /data
HEALTHCHECK --interval=15s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:' + process.env.PORT + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# node itself is PID 1, so SIGTERM (a deploy) reaches the server: matches end without a result
CMD ["node", "--import", "tsx", "src/server/index.ts"]
