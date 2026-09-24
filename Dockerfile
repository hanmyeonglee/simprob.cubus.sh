FROM node:22-bookworm-slim AS builder

ENV DEBIAN_FRONTEND=noninteractive
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /site

RUN apt-get update \
    && apt-get install -y --no-install-recommends chromium fonts-noto-cjk poppler-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY scripts ./scripts
COPY styles ./styles
COPY problems ./problems
COPY answers ./answers
RUN npm run build

FROM nginx:stable-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /site/dist/ /usr/share/nginx/html/

EXPOSE 80
