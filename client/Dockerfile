FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# VITE_API_URL must be set as a Railway build variable so the compiled
# JS bundle contains the correct backend URL at build time.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Serve the built app with a lightweight static server
FROM node:20-slim
WORKDIR /app
RUN npm install -g serve
COPY --from=builder /app/dist ./dist

# Railway injects PORT at runtime
CMD ["sh", "-c", "serve -s dist -l ${PORT:-3000}"]
