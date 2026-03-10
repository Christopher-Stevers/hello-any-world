FROM node:20-alpine AS build
WORKDIR /app

# Copy root workspace manifests first for better caching
COPY package.json package-lock.json* ./



COPY express_server ./express_server
COPY express_utils ./express_utils
COPY express_db ./express_db

# Install workspace deps (npm workspaces)
RUN npm ci

# If your app is plain JS (index.js) and doesn't need build, you're done.
# If you have TS build steps, add them here:
# RUN npm -w express_server run build

FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
# Your code uses PORT || 3001, but set a default anyway
ENV PORT=3001

# Copy installed workspace + sources
COPY --from=build /app /app


# IMPORTANT:
# The server runs with cwd=/app/express_server, so resolve(process.cwd(), '..', '.env')
# points to /app/.env
WORKDIR /app/express_server

EXPOSE 3001
CMD ["node", "index.js"]
