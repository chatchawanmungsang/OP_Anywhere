FROM node:22-bookworm-slim

# Install openssl (required by Prisma) and libarchive-tools (bsdtar, required for .xlsx streaming/zip operations)
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    libarchive-tools \
  && ln -sf /usr/bin/bsdtar /usr/local/bin/tar \
  && rm -rf /var/lib/apt/lists/*

ENV TZ=Asia/Bangkok
WORKDIR /app

# Install dependencies and generate Prisma client
COPY package.json package-lock.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy application source
COPY . .

# Build Next.js production app
RUN npm run build

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run db:seed && npm run start"]
