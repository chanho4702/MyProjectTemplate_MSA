# 처음부터 따라 하는 로컬 실행 가이드

이 문서는 Spring, Docker, MSA를 처음 접하는 사람도 `MyProjectTemplate`을 로컬에서 실행하고 정상 여부를 확인할 수 있도록 설명한다. 운영 배포 가이드가 아니라 **내 PC에서 템플릿의 기본 흐름을 확인하는 가이드**다.

## 이 가이드에서 실행하는 것

```text
브라우저 :5173 또는 명령어
        ↓
React SPA / Vite proxy (선택)
        ↓
Gateway :8080 또는 :8082
        ↓
sample-service :8081
        ↓
PostgreSQL writer :5432
PostgreSQL reader :5434 (선택)
```

관측성까지 켜면 Prometheus `:9090`과 Grafana `:3001`이 추가된다.

## 시작 전에 알아둘 용어

| 용어 | 쉬운 설명 |
|---|---|
| 서비스 | 독립적으로 실행되는 Spring Boot 프로그램 |
| Gateway | 외부 요청을 알맞은 서비스로 전달하는 입구 |
| writer DB | 생성·수정·삭제와 기본 조회가 사용하는 DB |
| reader DB | `@Transactional(readOnly = true)` 조회만 사용하는 복제 DB |
| Compose profile | 필요한 로컬 인프라만 골라 켜는 기능 묶음 |
| health endpoint | 프로그램이 정상인지 알려주는 확인 주소 |

## 0단계 — 터미널과 작업 폴더 준비

Windows에서는 PowerShell 7 터미널을 두 개 또는 세 개 열어 두면 편하다.

- 터미널 A: Docker와 확인 명령
- 터미널 B: `sample-service` 실행
- 터미널 C: Gateway 실행 또는 추가 확인

모든 명령은 별도 안내가 없으면 저장소 루트에서 실행한다.

```powershell
cd D:\MyProjectTemplate
Get-Location
```

정상 결과에는 `D:\MyProjectTemplate`이 표시된다. 다른 경로라면 이후 상대 경로 명령이 실패한다.

## 1단계 — 필수 프로그램 확인

```powershell
docker --version
docker compose version
node --version
java -version
```

필요한 버전은 다음과 같다.

- JDK 21
- Docker Engine과 Docker Compose v2
- Node.js 22 이상: 서비스 프론트 또는 구성 마법사를 사용할 때 필요
- pnpm 11.10.0: 서비스 프론트 workspace를 사용할 때 필요

Java가 21이 아니라면 현재 터미널에서만 JDK 21을 사용하도록 설정한다.

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
java -version
```

정상 결과 첫 줄에 `21`이 표시된다. JDK 설치 위치가 다르면 실제 폴더로 바꾼다.

Docker가 실행 중인지 확인한다.

```powershell
docker info
```

`error during connect` 또는 `Cannot connect`가 나오면 Docker Desktop을 먼저 실행한다.

## 2단계 — 사용할 포트가 비어 있는지 확인

기본 포트는 다음과 같다.

| 프로그램 | 포트 |
|---|---:|
| PostgreSQL writer | 5432 |
| PostgreSQL reader | 5434 |
| React SPA 개발 서버 | 5173 |
| Gateway | 8080 |
| sample-service | 8081 |
| 두 번째 sample-service — capacity 실험 전용 | 8083 |
| capacity proxy — 선택 | 8084 |
| Prometheus | 9090 |
| Grafana | 3001 |

Windows에서 사용 중인 포트를 확인한다.

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object LocalPort -In 5173,5432,5434,8080,8081,8083,8084,9090,3001 |
  Select-Object LocalAddress,LocalPort,OwningProcess
```

아무것도 나오지 않으면 모든 기본 포트를 사용할 수 있다. 결과가 나오면 [문제 해결](#문제-해결)에서 포트 충돌 항목을 확인한다.

## 3단계 — PostgreSQL 실행

### writer만 실행

처음 기능을 확인할 때는 writer 하나만으로 충분하다.

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml up -d --wait postgres
```

### writer와 reader를 함께 실행

읽기/쓰기 라우팅과 reader 장애 실험까지 하려면 다음 명령을 사용한다.

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml `
  --profile database-ha up -d --wait
```

상태를 확인한다.

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml ps
```

정상 결과:

- `postgres`가 `healthy`
- `database-ha`를 켰다면 `postgres-reader`도 `healthy`

writer와 reader 역할을 직접 확인할 수도 있다.

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml `
  exec -T postgres psql -U app -d appdb -Atc 'select pg_is_in_recovery();'

docker compose --env-file infra/.env.versions -f infra/compose.yml `
  exec -T postgres-reader psql -U app -d appdb -Atc 'select pg_is_in_recovery();'
```

- writer 결과 `f`: 복구 모드가 아니므로 쓰기 가능
- reader 결과 `t`: 복구 모드이므로 읽기 전용 복제본

## 4단계 — sample-service 실행

터미널 B를 열고 저장소 루트로 이동한다.

reader를 사용하지 않을 때:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
./gradlew :services:sample-service:bootRun --args='--spring.profiles.active=local'
```

reader까지 사용할 때는 실행 전에 reader URL을 추가한다.

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
$env:DB_READER_URL='jdbc:postgresql://localhost:5434/appdb'
./gradlew :services:sample-service:bootRun --args='--spring.profiles.active=local'
```

정상 결과에는 마지막 부분에 다음과 비슷한 문장이 표시된다.

```text
Started SampleServiceApplication
```

이 터미널은 서비스를 종료할 때까지 그대로 둔다. 명령 입력 화면으로 돌아오지 않는 것이 정상이다.

## 5단계 — API 정상 여부 확인

터미널 A에서 health를 확인한다.

```powershell
Invoke-RestMethod http://localhost:8081/actuator/health
```

정상 결과의 `status`는 `UP`이다.

현재 항목을 조회한다.

```powershell
Invoke-RestMethod http://localhost:8081/api/v1/items
```

처음 실행한 DB라면 빈 목록이 나올 수 있으며 정상이다.

테스트 항목 하나를 생성한다.

```powershell
$body = @{ name = 'first-item' } | ConvertTo-Json
Invoke-RestMethod http://localhost:8081/api/v1/items `
  -Method Post `
  -ContentType 'application/json' `
  -Body $body
```

다시 조회했을 때 `first-item`이 보이면 HTTP→서비스→writer DB 흐름이 정상이다.

## 6단계 — Gateway 실행

터미널 C에서 실행한다.

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
./gradlew :services:gateway-service:bootRun --args='--spring.profiles.active=local'
```

다른 터미널에서 Gateway 경유 요청을 확인한다.

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/items
```

`8080`을 다른 프로그램이 사용 중이라면 Gateway만 `8082`로 바꿔 실행할 수 있다.

```powershell
$env:SERVER_PORT='8082'
./gradlew :services:gateway-service:bootRun --args='--spring.profiles.active=local'
```

이때 확인 주소도 `http://localhost:8082/api/v1/items`로 바뀐다. Prometheus 기본 설정은 Gateway `8080`을 수집하므로, 장기적으로 `8082`를 사용할 경우 `infra/observability/prometheus.yml`의 Gateway 포트도 함께 맞춰야 한다.

## 7단계 — 서비스 프론트엔드 실행

Gateway API 확인까지 성공한 뒤 **터미널 D**에서 실행한다.

```powershell
cd D:\MyProjectTemplate
pnpm install --frozen-lockfile
pnpm web:dev
```

브라우저에서 <http://localhost:5173>을 연다. 화면에 저장된 항목 목록이 보이고 새 항목 생성이 성공하면 브라우저→Gateway→sample-service→DB 흐름이 정상이다.

Gateway를 `8082`에서 실행했다면 같은 터미널에서 proxy 대상을 먼저 바꾼다.

```powershell
$env:GATEWAY_PROXY_TARGET='http://localhost:8082'
pnpm web:dev
```

환경별 `app-config.json`, 정상 화면과 문제 해결은 [서비스 프론트엔드 단계별 가이드](frontend.md)를 따른다.

기본 local 실행은 인증이 꺼져 있어 Keycloak이 필요 없다. 로그인·token 갱신·로그아웃까지 확인하려면 프론트 연결 확인을 마친 뒤 [선택형 OIDC 인증 가이드](authentication.md)의 별도 절차를 따른다. API schema를 바꿀 때는 [OpenAPI 계약 가이드](api-contracts.md)에 따라 명세 → backend → 생성 타입 순서로 변경한다.

## 8단계 — Prometheus와 Grafana 실행

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml `
  --profile observability up -d --wait
```

확인 주소:

- Prometheus: <http://localhost:9090>
- Prometheus target 상태: <http://localhost:9090/targets>
- Grafana: <http://localhost:3001>
- Grafana 로컬 계정: `admin` / `grafana-local-password`
- Dashboard: `MyProjectTemplate / MyProjectTemplate Service Capacity`

Prometheus target 화면에서 실행 중인 서비스는 `UP`이어야 한다. 실행하지 않은 Gateway나 포트가 충돌한 Gateway가 `DOWN`인 것은 정상적인 원인 설명이 필요하며, 부하 결과에 해당 사실을 기록한다.

## 9단계 — 자동 테스트 실행

루트 검증:

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
./gradlew test
```

Compose 문법 검증:

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml config
```

구성 마법사 검증:

```powershell
cd tools/configurator
npm run lint
npm test
cd ../..
```

서비스 생성기와 prod 설정 계약 검증:

```powershell
pnpm tools:test
```

부하 시나리오 계약 검증:

```powershell
cd load-tests
npm test
cd ..
```

프론트 전체 검증:

```powershell
pnpm frontend:check
```

실제 부하 테스트는 [처리량과 가용성 단계별 가이드](capacity-testing.md)를 따른다.

## 10단계 — 구성 마법사 사용하기

구성 마법사는 처음 실행에 필수는 아니다. 템플릿에 포함할 기능을 고를 때 사용한다.

```powershell
cd tools/configurator
npm ci
npm run dev
```

터미널에 표시된 로컬 주소를 브라우저로 연다. 목표 TPS는 보장 성능이 아니라 다음 부하 시험의 입력값이다.

화면에서 내려받은 `template-config.json`을 저장소 루트에 놓고 적용한다.

```powershell
cd ../..
./tools/apply-config.ps1
```

생성 결과는 `generated/`에서 확인한다.

- `application-features.env`: Redis/Kafka/Search/OIDC/Gateway 인증/관측성 활성화 값
- `compose-command.txt`: 선택한 로컬 Compose profile 실행 명령
- `selection.md`: 선택 요약과 비보장 안내

새 서비스 생성 시 PowerShell과 Bash 모두 같은 설정 파일을 사용할 수 있다.

```powershell
./tools/new-service.ps1 -Name order-service -BasePackage com.acme.order -ConfigPath ./template-config.json
```

```bash
./tools/new-service.sh order-service com.acme.order ./template-config.json
```

두 생성기 모두 설정 파일을 `config/template-config.schema.json`으로 검증한 뒤 생성한다. Bash 생성기는 검증에 Node.js 22+가 필요하며, Node.js가 없으면 설정 파일을 지정했을 때 생성 없이 오류로 종료한다.

## 11단계 — 안전하게 종료하기

Spring Boot를 실행한 터미널에서 `Ctrl+C`를 누른다. 그다음 Docker 컨테이너를 중지한다.

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml `
  --profile database-ha --profile observability down
```

위 명령은 컨테이너를 내리지만 DB 데이터 volume은 보존한다.

데이터까지 완전히 삭제하는 `down -v`는 기존 로컬 DB와 Grafana 데이터를 지운다. 연습 데이터를 정말 초기화하려는 경우에만 사용한다.

## 문제 해결

| 증상 | 먼저 확인할 것 | 해결 방향 |
|---|---|---|
| `java` 버전이 21이 아님 | `java -version` | 현재 터미널의 `JAVA_HOME`과 `PATH`를 JDK 21로 설정 |
| Docker 연결 오류 | `docker info` | Docker Desktop 실행 후 다시 시도 |
| `port is already allocated` | `Get-NetTCPConnection` | 충돌 프로그램을 확인하거나 이 프로젝트의 포트를 명시적으로 변경 |
| sample-service가 DB에 연결하지 못함 | Compose `ps`, 5432 포트 | PostgreSQL이 `healthy`인지 확인 |
| reader 연결 오류 | reader `healthy`, `DB_READER_URL` | reader를 사용하지 않으면 환경변수를 제거하고 writer fallback으로 재실행 |
| Gateway `8080` 기동 실패 | 8080 포트 | `SERVER_PORT=8082`처럼 빈 포트 사용 |
| 프론트가 API에 연결하지 못함 | Gateway health와 Vite proxy 대상 | Gateway가 `8082`면 `GATEWAY_PROXY_TARGET`도 `8082`로 설정 |
| 프론트 설정 오류 | `apps/web/public/app-config.json` | JSON 문법과 local/dev/prod URL 안전 규칙 확인 |
| Prometheus target `DOWN` | 대상 서비스와 포트 | 서비스를 실행하거나 scrape 포트를 실제 실행 포트와 일치시킴 |
| 이전 데이터가 계속 보임 | Docker volume | 정상적인 volume 보존 동작이며, 정말 필요할 때만 `down -v`로 초기화 |

문제가 생기면 오류 메시지의 마지막 30줄, 실행한 명령, `docker compose ... ps` 결과를 함께 남기면 원인을 찾기 쉽다.
