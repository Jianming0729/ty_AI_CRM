FROM node:22-alpine

WORKDIR /app

# Install build dependencies if needed (e.g., for sqlite3)
RUN apk add --no-cache python3 py3-setuptools make g++ curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure logs directory exists
RUN mkdir -p logs

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "src/server.js"]
