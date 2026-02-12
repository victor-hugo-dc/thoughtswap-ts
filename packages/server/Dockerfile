FROM node:22-alpine

WORKDIR /app

# Copy root configuration
COPY package.json package-lock.json ./

# Copy package definitions to satisfy workspace requirements
COPY packages/server/package.json ./packages/server/
COPY packages/client/package.json ./packages/client/

# Install dependencies (including devDependencies for building)
RUN npm ci

# Copy server source code
COPY packages/server ./packages/server

# Set working directory to server package
WORKDIR /app/packages/server

# environment variables
ARG DATABASE_URL
ARG PORT=3001
ENV PORT=$PORT

# Generate Prisma Client
RUN npx prisma generate

# Build the TypeScript code
RUN npm run build

# Expose the application port
EXPOSE $PORT

# Start the application
CMD ["npm", "start"]
