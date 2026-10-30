FROM node:lts-alpine3.24 AS base

WORKDIR /app

COPY --chown=node:node package*.json ./

RUN chown node:node /app

USER node

RUN npm ci

COPY --chown=node:node . .

FROM base AS dev

EXPOSE 5373

CMD ["npm", "run", "dev", "--", "--host"]
