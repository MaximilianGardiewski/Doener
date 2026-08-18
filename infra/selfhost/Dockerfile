ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app
ENV NODE_ENV=production \
    MCELLO_INTERNAL_PORT=4173 \
    MCELLO_CONTAINER_PORT=8080

COPY --chown=node:node package.json ./package.json
COPY --chown=node:node apps ./apps
COPY --chown=node:node packages ./packages
COPY --chown=node:node scripts/vendor-mcello-gsap.mjs ./scripts/vendor-mcello-gsap.mjs
RUN npm install --omit=dev --ignore-scripts --package-lock=false \
    && node scripts/vendor-mcello-gsap.mjs
COPY --chown=node:node infra/selfhost/container-entrypoint.mjs ./infra/selfhost/container-entrypoint.mjs

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MCELLO_CONTAINER_PORT||8080)+'/api/health',{cache:'no-store'}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "infra/selfhost/container-entrypoint.mjs"]
