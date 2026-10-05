FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY apps/desktop apps/desktop
COPY apps/server apps/server
COPY packages packages
COPY scripts scripts
COPY tsconfig.json vite.config.ts ./
RUN npx vite build && node scripts/service-worker.mjs
FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm install --no-save tsx
COPY --from=build /app/dist dist
COPY apps/server apps/server
COPY packages packages
COPY tsconfig.json ./
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787
CMD ["npx","tsx","apps/server/index.ts"]
