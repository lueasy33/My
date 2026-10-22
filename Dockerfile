# Аладдин — образ для сервера.
# Сборка интерфейса идёт внутри образа, на сервер не нужно ставить ничего, кроме Docker.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-slim
ENV NODE_ENV=production \
    PORT=8080 \
    DB_PATH=/app/data/aladdin.db
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server ./server
COPY content ./content
COPY public ./public
COPY --from=build /app/build ./build
# База, загруженные файлы и резервные копии живут в томе — переживают обновления
VOLUME /app/data
EXPOSE 8080
CMD ["node", "server/index.js"]
