FROM node:20-alpine AS build
WORKDIR /app

# Copy root workspace manifests first for better caching
COPY package.json package-lock.json* ./

# Copy only the workspaces needed by web
COPY web ./web
COPY web_db ./web_db
COPY web_utils ./web_utils

# Install all workspace dependencies
RUN npm ci

# Build Next.js app (uses root workspace config)
# Skip strict env validation at build time inside Docker
ENV SKIP_ENV_VALIDATION=1
RUN npm --workspace web run build


FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Bring full workspace from builder (includes node_modules + built output)
COPY --from=build /app /app

# Run from web workspace
WORKDIR /app/web

EXPOSE 3000
CMD ["npm", "run", "start"]