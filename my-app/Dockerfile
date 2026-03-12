FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL
ARG VITE_CLERK_PUBLISHABLE_KEY

RUN BUILD_VITE_CONVEX_URL="$VITE_CONVEX_URL" \
  BUILD_VITE_CONVEX_SITE_URL="$VITE_CONVEX_SITE_URL" \
  BUILD_VITE_CLERK_PUBLISHABLE_KEY="$VITE_CLERK_PUBLISHABLE_KEY" \
  && set -a \
  && [ ! -f docker-compose.env ] || . ./docker-compose.env \
  && set +a \
  && export VITE_CONVEX_URL="${BUILD_VITE_CONVEX_URL:-$VITE_CONVEX_URL}" \
  && export VITE_CONVEX_SITE_URL="${BUILD_VITE_CONVEX_SITE_URL:-$VITE_CONVEX_SITE_URL}" \
  && export VITE_CLERK_PUBLISHABLE_KEY="${BUILD_VITE_CLERK_PUBLISHABLE_KEY:-$VITE_CLERK_PUBLISHABLE_KEY}" \
  && npm run build


FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

EXPOSE 3000

CMD ["npm", "run", "start:lan"]
