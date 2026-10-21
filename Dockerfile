# An exact Node version, so a rebuild never changes it silently; Node 22, the version the server's
# tests run on. Update it on purpose, then run `npm run server:test` (2026-10-08).
FROM node:22.23.3-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY server/ ./server/

USER node
CMD ["node", "server/index.mjs"]
