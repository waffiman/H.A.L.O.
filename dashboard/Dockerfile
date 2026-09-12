# Stage 1: build the public marketing site (../marketing) into static files.
# server.js serves the result at /marketing; see marketing/README.md.
FROM node:22-alpine AS marketing
WORKDIR /build
COPY marketing/package.json marketing/package-lock.json ./
RUN npm ci
COPY marketing/ ./
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache curl docker-cli docker-cli-compose
WORKDIR /app
# Build context = repo root (see docker-compose.ionos.yml)
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --omit=dev
COPY dashboard/ ./
COPY bookingSchedule.js ./bookingSchedule.js
# server.js resolves the site at path.join(__dirname, '..', 'marketing', 'dist').
COPY --from=marketing /build/dist /marketing/dist
ENV PORT=3080
EXPOSE 3080
CMD ["node", "server.js"]
