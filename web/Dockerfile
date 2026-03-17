FROM node:20-bookworm-slim AS build
WORKDIR /app

RUN npm install -g npm@10.9.2

# Copy root workspace manifests first for better caching
COPY package.json package-lock.json* ./

# Copy only the files needed for the workspace build.
# This avoids leaking host node_modules/.next into the image.
COPY web/package.json web/package-lock.json web/next.config.js web/postcss.config.js web/tsconfig.json web/eslint.config.js web/next-env.d.ts web/prettier.config.js web/.env.example ./web/
COPY web/public ./web/public
COPY web/src ./web/src
COPY web_db/package.json ./web_db/package.json
COPY web_db/prisma ./web_db/prisma
COPY web_db/src ./web_db/src
COPY web_utils/package.json ./web_utils/package.json
COPY web_utils/src ./web_utils/src

# Install all workspace dependencies
RUN npm ci

# npm is not pulling these optional native packages during workspace install.
# Install the Linux variants explicitly so Next/Tailwind can load them at build time.
RUN npm install --no-save lightningcss-linux-x64-gnu @tailwindcss/oxide-linux-x64-gnu

# Generate Prisma client for the shared db package before building Next.js.
RUN npm --workspace @repo/web_db run generate

# Build Next.js app (uses root workspace config)
# Skip strict env validation at build time inside Docker
ENV SKIP_ENV_VALIDATION=1
RUN npm --workspace web run build


FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN npm install -g npm@10.9.2

ENV NODE_ENV=production
ENV PORT=3000
ENV DOTENV_CONFIG_PATH=/app/.env

# Bring full workspace from builder (includes node_modules + built output)
COPY --from=build /app /app

# Run from web workspace
WORKDIR /app/web

EXPOSE 3000
CMD ["node", "-r", "dotenv/config", "./node_modules/next/dist/bin/next", "start"]
