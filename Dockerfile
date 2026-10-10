FROM node:20-alpine

WORKDIR /app

COPY package.json .
RUN npm install --omit=dev

COPY server.js .
COPY public/ ./public/

# La cartella cache viene montata come volume in docker-compose
RUN mkdir -p cache

EXPOSE 3000

CMD ["node", "server.js"]
