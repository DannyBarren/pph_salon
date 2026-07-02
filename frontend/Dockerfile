# Development-oriented image for docker-compose. For production on Vercel this
# Dockerfile is not used (Vercel builds the app natively).
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
