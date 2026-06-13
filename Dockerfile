# Document Expiry Tracker — single container that serves the web app and runs
# the built-in daily scheduler (cloud sync + reminder emails).
FROM node:20-bookworm-slim

# Build tools for the native better-sqlite3 module.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Persisted at runtime via volumes (see docker-compose.yml).
RUN mkdir -p data uploads

EXPOSE 3000
CMD ["node", "src/server.js"]
