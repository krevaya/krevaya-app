# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend .
COPY LICENSE CREDITS.md /src/
COPY backend/app/content/font_files /src/backend/app/content/font_files
RUN npm run build

FROM nginx:1.31-alpine
# both end up in site.conf.template when the container starts
ENV API_UPSTREAM=server:8000 \
    WEB_LISTEN=8460
COPY frontend/site.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/frontend/dist /usr/share/nginx/html
EXPOSE 8460
