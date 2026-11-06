FROM node:22 AS build-env
WORKDIR /app

COPY package.json ./
COPY src ./src

RUN npm test

FROM gcr.io/distroless/nodejs22-debian13
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build-env /app/package.json ./
COPY --from=build-env /app/src ./src

CMD ["src/main.ts", "/config/config.json"]
