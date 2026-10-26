# The game server, as deployed to Fly.io (see fly.toml). It also serves the web build, so the game
# can be played straight from https://<app>.fly.dev as well as on CrazyGames.

# build the web client
FROM node:22-slim AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# run the server (TypeScript straight through tsx), with only what it needs
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY --from=build /app/dist/client ./dist/client
EXPOSE 8080
CMD ["node", "--import", "tsx", "src/server/index.ts"]
