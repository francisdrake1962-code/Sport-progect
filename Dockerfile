FROM node:18-alpine
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
RUN mkdir -p data
COPY server/ ./server/
COPY dist/ ./dist/
COPY data/ ./data/
EXPOSE 3001
ENV NODE_ENV=production
USER appuser
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1
CMD ["node", "server/index.js"]
