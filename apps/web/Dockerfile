# 저장소 루트를 build context로 사용한다.
#   docker build -f apps/web/Dockerfile -t msa-platform-web:local .
# 런타임 이미지는 infra/.env.versions의 CAPACITY_PROXY_IMAGE와 같은 nginx 계열
# 버전을 사용한다. 버전을 올릴 때 두 곳을 함께 갱신한다.
ARG NODE_IMAGE=node:22.13.1-alpine
ARG NGINX_IMAGE=nginx:1.30.4-alpine3.24

FROM ${NODE_IMAGE} AS build
WORKDIR /workspace
# 이 base image의 corepack은 회전된 npm 서명 키를 몰라 실패하므로 npm으로 설치한다.
RUN npm install -g pnpm@11.10.0
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN pnpm install --frozen-lockfile --filter "@myprojecttemplate/web..."
COPY packages/api-client packages/api-client
COPY apps/web apps/web
RUN pnpm --filter @myprojecttemplate/web build

FROM ${NGINX_IMAGE}
COPY apps/web/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/docker/entrypoint.sh /usr/local/bin/web-entrypoint.sh
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=10s --timeout=3s --retries=6 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
ENTRYPOINT ["/bin/sh", "/usr/local/bin/web-entrypoint.sh"]
