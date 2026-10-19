# Use pinned Bun image for reproducible builds (INFRA-N2)
FROM oven/bun:1.2

WORKDIR /app

# Install curl for healthcheck (INFRA-N3) and tzdata for Asia/Bangkok timezone
RUN apt-get update && apt-get install -y --no-install-recommends curl tzdata && rm -rf /var/lib/apt/lists/*

# Set timezone to Asia/Bangkok (UTC+7) — affects cron jobs, logs, and email timestamps
ENV TZ=Asia/Bangkok

# Copy package and lockfile
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Generate Prisma client
RUN bunx prisma generate

# Expose the API port
EXPOSE 3000

# Start the application in production mode (INFRA-N1)
CMD ["bun", "run", "start"]
