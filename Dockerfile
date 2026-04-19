# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache
COPY frontend/package*.json ./

# Install dependencies
RUN npm ci

# Copy the rest of the application code
COPY frontend/ ./

# Build the application
RUN npm run build

# Production Stage
FROM node:20-alpine

WORKDIR /app

# Only copy over the built output and node_modules necessary to run `vite preview`
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# The default port Cloud Run expects
ENV PORT=8080

EXPOSE $PORT

# Start the application using Vite's preview mode, binding to 0.0.0.0
CMD ["npm", "run", "start"]