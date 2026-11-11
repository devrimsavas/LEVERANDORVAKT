# Leverandørvakt API image.
# Two stages: the first compiles TypeScript and generates the API docs with
# all dependencies; the second holds only what is needed to run, so the
# image has no compiler, tests or dev dependencies.

# ---- Build stage ----
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first: this layer is reused until package files change
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm run swagger

# ---- Run stage ----
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/swagger_output.json ./

# Run as the image's unprivileged "node" user, not as root
USER node

EXPOSE 3000

# Healthy once the API answers; Docker Compose waits for this
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:3000/ > /dev/null || exit 1

# Migrations run on startup, before the server starts listening
CMD ["node", "dist/server.js"]
