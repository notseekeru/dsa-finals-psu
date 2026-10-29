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

FROM base AS builder

RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31.7-alpine3.24 AS prod

USER root

RUN apk upgrade --no-cache

USER 101

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
