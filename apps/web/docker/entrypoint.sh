#!/bin/sh
# 같은 이미지를 환경별 app-config.json으로 재사용한다. 배포 환경이
# /etc/msa-web/app-config.json을 mount하면 그 값이 빌드에 포함된 기본값을
# 대체한다. mount가 없으면 빌드 시점의 local 기본 설정으로 동작한다.
set -eu

if [ -f /etc/msa-web/app-config.json ]; then
  cp /etc/msa-web/app-config.json /usr/share/nginx/html/app-config.json
fi

exec nginx -g 'daemon off;'
