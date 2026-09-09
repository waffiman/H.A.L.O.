FROM node:22-alpine
RUN apk add --no-cache curl docker-cli docker-cli-compose
WORKDIR /app
# Build context = repo root (see docker-compose.ionos.yml)
COPY dashboard/package.json ./
RUN npm install --omit=dev
COPY dashboard/ ./
COPY bookingSchedule.js ./bookingSchedule.js
ENV PORT=3080
EXPOSE 3080
CMD ["node", "server.js"]
