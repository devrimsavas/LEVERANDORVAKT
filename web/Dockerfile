# Leverandørvakt web app image.
# Three stages: install dependencies, build the app, and run it from
# Next.js's standalone output, which holds only the server and the files
# it needs, without the rest of node_modules.

# ---- Dependencies ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- Run ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static

# Run as the image's unprivileged "node" user, not as root
USER node

EXPOSE 3001

# The address of the API is read when the server starts (API_URL)
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://localhost:3001/ > /dev/null || exit 1

CMD ["node", "server.js"]
