FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_CONVEX_URL
ARG VITE_CONVEX_SITE_URL

ENV VITE_CONVEX_URL=${VITE_CONVEX_URL}
ENV VITE_CONVEX_SITE_URL=${VITE_CONVEX_SITE_URL}

RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

EXPOSE 3000

CMD ["npm", "run", "start:lan"]
