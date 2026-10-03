FROM node:24-alpine
WORKDIR /app
COPY --chown=node:node package.json server.mjs activity-store.mjs transparency.mjs ./
ENV LOCALPULSE_TRACKER_HOST=0.0.0.0
ENV LOCALPULSE_TRACKER_PORT=8787
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]
