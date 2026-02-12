FROM node:22-alpine

WORKDIR /app

# Copy root configuration
COPY package.json package-lock.json ./

# Copy package definitions to satisfy workspace requirements
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install dependencies
RUN npm ci

# Copy client source code
COPY packages/client ./packages/client

# Set working directory to client package
WORKDIR /app/packages/client

ARG PORT=5173
ENV PORT=$PORT

# Expose the application port
EXPOSE $PORT

# Start the application
CMD ["npm", "run", "dev"]