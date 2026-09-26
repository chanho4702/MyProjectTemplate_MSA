# 모듈 카탈로그

## starter 활성화 규칙

starter는 의존성을 추가해도 위험한 기능을 자동으로 켜지 않는다. 외부 인프라 기능은 해당 클래스가 존재하고 `platform.<feature>.enabled=true`일 때 활성화된다.

| 모듈 | 설정 스위치 | 제공 기능 |
|---|---|---|
| `platform-starter-web` | 기본 활성 | 요청 ID, UTC Clock, 표준 Problem Detail |
| `platform-starter-data-jpa` | `platform.datasource.enabled` | JPA, Flyway, writer/reader routing |
| `platform-starter-redis` | `platform.redis.enabled` | 타입 안전 JSON cache, TTL |
| `platform-starter-kafka` | `platform.kafka.enabled` | 공통 event envelope, publisher |
| `platform-starter-search` | `platform.search.enabled` | 검색 포트와 Elasticsearch adapter |
| `platform-starter-security` | `platform.security.enabled` | JWT/OIDC resource server |
| `platform-starter-observability` | `platform.observability.enabled` | Prometheus, OTLP tracing |

`platform-starter-data-jpa`의 reader routing은 `platform.datasource.reader.url`이 있을 때만 reader pool을 따로 만든다. 실행 중 reader 장애는 writer로 자동 전환되지 않으므로, 관리형 reader endpoint나 DB proxy가 없으면 reader URL을 비워 두는 편이 안전하다. 근거와 조건은 [권장 아키텍처](architecture.md) 3절을 따른다.

`platform-starter-web`의 공통 handler는 `@Valid` 본문 위반(`MethodArgumentNotValidException`)과 `@RequestParam` 제약 위반(`HandlerMethodValidationException`)을 모두 `VALIDATION_FAILED` Problem Detail로 바꾼다. 쿼리 파라미터 범위 검증은 controller 분기 대신 `@Min`/`@Max`로 선언한다.

security와 observability도 값이 없으면 활성화되지 않는다. observability가 비활성화되면 Prometheus·OTLP metrics, tracing과 OTLP logging exporter를 함께 끄며 health/info 같은 기본 actuator 경계는 web starter에 남는다.

`services/gateway-service`는 외부 진입점과 circuit breaker를 제공한다. 로컬은 정적 URI를 사용하고 운영에서는 서비스 DNS 또는 플랫폼 discovery를 사용한다.

## 권장 조합

CRUD 서비스:

```groovy
implementation project(':starters:platform-starter-web')
implementation project(':starters:platform-starter-data-jpa')
```

이벤트 발행 서비스:

```groovy
implementation project(':starters:platform-starter-kafka')
```

```yaml
platform:
  kafka:
    enabled: true
```

조회 최적화 서비스:

```groovy
implementation project(':starters:platform-starter-redis')
implementation project(':starters:platform-starter-search')
```

서비스가 사용하지 않는 starter는 넣지 않는다. 모든 starter를 일괄 포함하는 `platform-starter-all`은 만들지 않는다.

`tools/new-service.ps1`과 `tools/new-service.sh`는 선택한 starter와 `application-platform-<feature>.yml`을 함께 생성한다. dev/prod 외부 주소와 자격증명에는 localhost 기본값이 없으므로 런타임 환경에서 명시적으로 주입해야 한다.

두 생성기 모두 설정 파일을 `config/template-config.schema.json`으로 검증한 뒤에만 생성한다. PowerShell은 `Test-Json`, Bash는 `tools/lib/validate-template-config.mjs`(Node.js 22+ 필요)를 사용하며, 스키마 위반 시 어떤 파일도 만들지 않고 위반 경로를 출력하며 종료한다. Bash 환경에 Node.js가 없으면 설정 파일 지정 시 명확한 오류와 함께 중단된다.

생성된 서비스의 테스트에는 profile 계약이 포함된다. local profile은 로컬 기본값(localhost DB)으로 설정이 해석되고, dev/prod profile은 `DB_WRITER_URL` 등 외부 주소·자격증명이 없으면 기동 시 placeholder 해석 단계에서 fail-fast한다. `none`/기능별 단독/전체 선택 조합의 생성·빌드 계약은 `pnpm tools:test:generated-build`가 실제 Gradle 빌드로 검증한다.
