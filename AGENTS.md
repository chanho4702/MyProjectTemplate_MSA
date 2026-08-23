# AGENTS.md

이 저장소는 특정 도메인 애플리케이션이 아니라 재사용 가능한 MSA 플랫폼 템플릿이다.

## 작업 원칙

1. `README.md`와 `docs/architecture.md`, `docs/environments.md`를 먼저 읽는다.
2. 공통 starter에는 비즈니스 도메인 타입을 넣지 않는다.
3. Redis, Kafka, 검색 엔진처럼 의미가 다른 기술을 하나의 범용 메시지 인터페이스로 합치지 않는다.
4. 기능은 의존성 추가와 `platform.<feature>.enabled=true` 조합으로 켜고 끌 수 있어야 한다.
5. `prod` 설정에는 로컬 비밀번호, 호스트 포트, 보안 비활성화 값을 넣지 않는다.
6. 읽기 전용 DB 라우팅은 `@Transactional(readOnly = true)`에서만 reader를 사용한다. 기본값은 writer다.
7. 처리량을 근거 없이 보장하지 않는다. 부하 환경, SLO, 결과 파일을 함께 기록한다.
8. 새 기능은 단위 테스트와 문서 예제를 함께 추가한다.

## 검증

```bash
./gradlew test
docker compose --env-file infra/.env.versions -f infra/compose.yml config
cd tools/configurator && npm run lint && npm test
cd ../.. && pnpm tools:test
pnpm frontend:check
pnpm web:e2e
```

프론트 E2E는 Chromium이 필요하다. 처음 한 번 `pnpm web:e2e:install`을 실행한다.

커밋과 배포는 사용자가 요청할 때만 수행한다.
