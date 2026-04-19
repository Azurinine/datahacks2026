# Stage 1: Build the Vite app
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files from the frontend directory
COPY frontend/package*.json ./

# Use npm install instead of npm ci to bypass lockfile out-of-sync errors
RUN npm install

# Copy the rest of the frontend source
COPY frontend/ ./

# Build the project
RUN npm run build

# Stage 2: Serve the app with Nginx
FROM nginx:alpine

# Copy the build output from the builder stage to Nginx's serve directory
COPY --from=builder /app/dist /usr/share/nginx/html

# Create a custom Nginx config to handle SPA routing and the Cloud Run port
RUN echo 'server { \
    listen 8080; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]