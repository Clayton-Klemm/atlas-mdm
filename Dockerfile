FROM node:26-bookworm-slim@sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567
LABEL org.opencontainers.image.title="Atlas MDM" \
      org.opencontainers.image.description="Electrical product master data stewardship portfolio" \
      org.opencontainers.image.source="https://github.com/Clayton-Klemm/atlas-mdm"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
COPY --chown=node:node samples ./samples
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node test ./test
COPY --chown=node:node e2e ./e2e
COPY --chown=node:node playwright.config.js ./playwright.config.js
COPY --chown=node:node docs/openapi.json ./docs/openapi.json
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
EXPOSE 8080
CMD ["node", "src/server.js"]
