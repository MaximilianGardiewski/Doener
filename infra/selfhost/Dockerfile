ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

WORKDIR /app
ENV NODE_ENV=production \
    PORT=4173

COPY --chown=node:node package.json ./package.json
COPY --chown=node:node apps ./apps
COPY --chown=node:node packages ./packages

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4173)+'/api/health',{cache:'no-store'}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "--experimental-strip-types", "apps/mcello/run.mjs"]
