FROM node:lts-alpine3.24 AS base

WORKDIR /app

COPY --chown=node:node package*.json ./

RUN chown node:node /app

USER node

RUN npm ci

COPY --chown=node:node . .

FROM base AS dev

EXPOSE 4100

CMD ["npm", "run", "dev"]

FROM base AS prune

RUN npm run build && npm prune --omit=dev

FROM node:lts-alpine3.24 AS prod

# npm + corepack removed: this image boots node directly, and they carry unfixed CVEs.
RUN rm -rf /usr/local/lib/node_modules/npm \
	/usr/local/lib/node_modules/corepack \
	/usr/local/bin/npm \
	/usr/local/bin/npx \
	/usr/local/bin/corepack

RUN apk add --no-cache --upgrade --latest musl musl-utils zlib libcrypto3 libssl3 expat

ENV NODE_ENV=production

RUN mkdir /app && chown node:node /app

WORKDIR /app

COPY --from=prune /app .

USER node

CMD ["node", "dist/server.js"]
