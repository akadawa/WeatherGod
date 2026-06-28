FROM node:20-alpine

RUN apk add --no-cache python3 make g++ wget

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

RUN mkdir -p /app/data

ENV NODE_ENV=production
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

LABEL org.opencontainers.image.title="WeatherGod" \
      org.opencontainers.image.source="https://github.com/akadawa/WeatherGod"

CMD ["node", "server/index.js"]
