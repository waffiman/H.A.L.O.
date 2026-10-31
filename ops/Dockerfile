# halo-ops: holds docker.sock; runs only allowlisted docker commands for the dashboard.
FROM node:22-alpine
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /ops
COPY ops/validate.mjs ops/halo-ops.mjs ./
USER root
CMD ["node", "halo-ops.mjs"]
