FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json ./
COPY src ./src

USER 10001:10001

ENTRYPOINT ["node", "src/main.ts", "/config/config.json"]
