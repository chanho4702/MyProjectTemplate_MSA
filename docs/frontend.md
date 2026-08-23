# 서비스 프론트엔드 처음부터 실행하기

이 문서는 React를 처음 접하는 사람도 `apps/web` 화면을 실행하고 Gateway 연결을 확인하도록 단계별로 설명한다. 현재 제공 범위는 **sample API 조회·생성, 로딩·빈 화면·오류·권한 안내, 선택형 OIDC와 OpenAPI 생성 타입**이다. 인증을 실제로 켜는 명령은 [OIDC 인증 가이드](authentication.md), API 변경 절차는 [OpenAPI 계약 가이드](api-contracts.md)를 따른다.

## 1. 무엇이 실행되나

```mermaid
flowchart LR
    B[Browser :5173] -->|/api| V[Vite local proxy]
    B -. auth.enabled=true .-> K[Keycloak :8180]
    V --> G[Gateway :8080]
    G --> S[sample-service :8081]
    S --> W[(PostgreSQL writer :5432)]
    S -. readOnly .-> R[(PostgreSQL reader :5434)]
```

브라우저는 sample-service `:8081`을 직접 호출하지 않는다. `/api` 요청은 Gateway를 지나가며, 로컬에서는 Vite proxy가 브라우저의 CORS 문제 없이 `:8080`으로 전달한다.

## 2. 먼저 준비할 것

- Node.js 22.13 이상
- pnpm 11.10.0
- PostgreSQL writer
- sample-service `:8081`
- Gateway `:8080`
- Keycloak `:8180` — OIDC를 켤 때만 필요

PowerShell에서 확인한다.

```powershell
cd D:\MyProjectTemplate
node --version
pnpm --version
Invoke-RestMethod http://localhost:8081/actuator/health
Invoke-RestMethod http://localhost:8080/actuator/health
```

Node만 있고 pnpm 명령이 없다면 Node에 포함된 Corepack으로 준비한다.

```powershell
corepack enable
corepack prepare pnpm@11.10.0 --activate
pnpm --version
```

## 3. 백엔드 실행

### 터미널 A — PostgreSQL

```powershell
cd D:\MyProjectTemplate
docker compose --env-file infra/.env.versions -f infra/compose.yml up -d --wait postgres
```

### 터미널 B — sample-service

```powershell
cd D:\MyProjectTemplate
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
./gradlew :services:sample-service:bootRun --args='--spring.profiles.active=local'
```

### 터미널 C — Gateway

```powershell
cd D:\MyProjectTemplate
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
$env:PATH="$env:JAVA_HOME\bin;$env:PATH"
./gradlew :services:gateway-service:bootRun --args='--spring.profiles.active=local'
```

다른 터미널에서 Gateway API가 성공하는지 먼저 확인한다.

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/items
```

이 명령이 실패하면 프론트엔드를 켜도 같은 API가 실패하므로 먼저 백엔드를 해결한다.

## 4. 프론트 의존성 설치

### 최초 한 번 또는 lockfile 변경 뒤

```powershell
cd D:\MyProjectTemplate
pnpm install --frozen-lockfile
```

루트 `pnpm-workspace.yaml`은 다음을 한 workspace로 관리한다.

- `apps/web`: 실제 브라우저 SPA
- `packages/api-client`: Gateway URL, request ID와 Problem Detail 해석

`tools/configurator`는 기존 npm lockfile과 배포 흐름을 유지하기 때문에 이 pnpm workspace에 포함하지 않는다.

## 5. 개발 서버 실행

### 터미널 D

```powershell
cd D:\MyProjectTemplate
pnpm web:dev
```

정상 로그에 `http://localhost:5173`이 표시된다. 브라우저에서 <http://localhost:5173>을 연다.

화면에서 확인할 것:

1. 상단 환경 표시가 `LOCAL`이다.
2. 요청 경로에 브라우저 → Gateway → sample-service → PostgreSQL이 보인다.
3. `저장된 항목`이 로딩 뒤 목록 또는 빈 화면으로 바뀐다.
4. 새 항목 이름을 입력하고 `writer DB에 저장`을 누른다.
5. 생성한 항목이 목록 첫 줄에 보인다.

기본 `auth.enabled=false`에서는 로그인 버튼이 보이지 않는다. 인증 예제 설정을 사용하면 로그인 전 API 요청을 보내지 않고 `로그인 필요` 상태를 보여준다.

## 6. 화면 상태의 뜻

| 화면 | 의미 | 다음 확인 |
|---|---|---|
| `요청 중` | GET 또는 갱신 요청 진행 중 | 잠시 기다림 |
| 빈 목록 | API는 성공했지만 데이터가 0건 | 항목 하나 생성 |
| `확인 필요` | Gateway 또는 서비스 요청 실패 | 오류의 request ID와 백엔드 health 확인 |
| 생성 성공 | POST가 writer DB에 저장됨 | 목록 첫 줄 확인 |
| 설정 오류 | `app-config.json`을 읽거나 검증하지 못함 | JSON 문법과 환경 값 확인 |

오류에 request ID가 표시되면 Gateway와 sample-service 로그에서 같은 값을 검색해 한 요청의 흐름을 찾는다.

### 오류 안내의 공통 규칙

목록과 생성 폼은 같은 실패 해석기(`src/request-failure.ts`)와 같은 상태 컴포넌트(`src/feedback.tsx`)를 쓴다. 그래서 어느 화면에서 실패하든 같은 상태 코드는 같은 문구와 같은 다음 행동으로 이어진다.

| 응답 | 화면 문구 | 화면이 제안하는 행동 |
|---|---|---|
| 연결 실패 | Gateway에 연결하지 못했습니다. | `다시 시도` |
| 400 / 422 | 입력값을 확인해야 합니다. | violation을 필드 단위로 표시, 버튼 없음 |
| 401 | 인증이 만료되었거나 유효하지 않습니다. | `다시 로그인` |
| 403 | 이 작업을 수행할 권한이 없습니다. | 버튼 없음, 권한 요청 안내만 |
| 404 / 409 / 429 | 상태별 안내 | `다시 시도` |
| 5xx | 서버가 요청을 처리하지 못했습니다. | `다시 시도`, request ID 표시 |

같은 요청을 반복해도 결과가 달라지지 않는 실패(401, 403, validation)에는 `다시 시도` 버튼을 만들지 않는다.

## 7. local/dev/prod API 설정

프론트는 시작할 때 `apps/web/public/app-config.json`을 읽는다.

```json
{
  "environment": "local",
  "apiBaseUrl": "",
  "auth": {
    "enabled": false
  }
}
```

`apiBaseUrl`이 빈 값이면 브라우저와 같은 origin의 `/api`를 사용한다.

- local 개발: Vite proxy가 `/api`를 `http://localhost:8080`으로 전달
- dev: `app-config.dev.example.json`처럼 같은 origin ingress를 우선 사용. 별도 Gateway HTTPS URL이면 해당 Gateway의 명시적 CORS 정책 필요
- prod: 같은 origin ingress 권장. 외부 URL이면 HTTPS 사용

prod 설정은 API·OIDC URL의 `localhost`, 평문 HTTP, URL 안의 사용자 이름 또는 비밀번호를 거부한다. `clientSecret` 필드도 명시적으로 거부한다. client secret, access token과 운영 비밀번호는 이 JSON이나 프론트 번들에 넣지 않는다.

인증 예제 파일:

- `app-config.local.example.json`: local 인증 꺼짐
- `app-config.oidc-local.example.json`: local Keycloak 인증 켜짐
- `app-config.dev.example.json`: dev HTTPS OIDC 예시
- `app-config.prod.example.json`: prod HTTPS OIDC 예시

각 필드, Keycloak client와 Gateway 실행 방법은 [선택형 OIDC 인증을 처음부터 실행하기](authentication.md)에 있다.

배포에서는 빌드 산출물의 `app-config.json`을 환경별 설정으로 교체하거나 mount한다. 이렇게 하면 같은 불변 프론트 이미지를 dev/prod에서 다시 빌드하지 않고 사용할 수 있다.

## 8. production build 확인

```powershell
cd D:\MyProjectTemplate
pnpm web:build
```

결과는 `apps/web/dist`에 생성된다. 로컬에서 산출물을 미리 보려면:

```powershell
pnpm --filter @myprojecttemplate/web preview
```

브라우저에서 <http://localhost:4173>을 연다. 이 저장소의 preview 설정도 로컬 `/api`를 Gateway `:8080`으로 전달한다. 실제 운영에서는 Vite preview server를 사용하지 않고 정적 파일 서버/CDN과 Gateway routing을 구성한다.

### production image와 same-origin ingress

`apps/web/Dockerfile`이 SPA production image를 만든다. build stage가 pnpm workspace에서 `vite build`를 실행하고, 런타임은 nginx가 정적 파일만 서빙한다.

```powershell
cd D:\MyProjectTemplate
docker build -f apps/web/Dockerfile -t msa-platform-web:local .
```

이미지 계약:

- `/healthz`가 200을 돌려주는 health 경계다. 이미지 자체 `HEALTHCHECK`도 같은 경로를 사용한다.
- `/etc/msa-web/app-config.json`을 mount하면 시작 시 그 값이 서빙된다. **같은 불변 이미지를 환경별 `app-config.json`만 바꿔 재사용한다.** mount가 없으면 빌드에 포함된 local 기본값으로 동작한다.
- `/app-config.json`은 `no-store`, hash가 붙은 `/assets/*`는 불변 캐시로 서빙한다.
- 이 이미지는 `/api`를 프록시하지 않는다. same-origin 연결은 ingress가 담당한다.

로컬 ingress 예제는 Compose `frontend` profile이다. nginx ingress가 `/`를 web container로, `/api`를 host의 Gateway로 전달해 브라우저는 origin 하나만 본다.

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml `
  --profile frontend up -d --build --wait
```

<http://localhost:8090>이 ingress origin이다(`FRONTEND_INGRESS_PORT`로 변경, Gateway가 다른 포트면 `GATEWAY_PORT` 지정). SPA와 API가 같은 origin이므로 CORS 정책이 필요 없다. 프론트와 Gateway를 다른 origin으로 분리해야 할 때만 Gateway에 명시적 origin·method·header CORS 정책을 추가한다.

container → ingress → Gateway → sample-service 전체 경로의 자동 smoke는 다음 명령이 실행한다.

```powershell
$env:JAVA_HOME='C:\Program Files\Java\jdk-21'
pnpm web:image:smoke
```

`tools/e2e/run-frontend-image-smoke.mjs`가 전용 포트(25432/28081/28082/28090/28091)에 격리 스택을 띄우고 데스크톱 Chromium, 모바일 viewport(Pixel 7), Firefox에서 same-origin 조회·생성(CORS preflight 부재 포함), health 경계와 환경별 config 재사용을 검증한 뒤 정리한다. 같은 검증이 CI의 `frontend-image-smoke` job에서도 실행된다.

## 9. 자동 검증

프론트 전체 검사:

```powershell
cd D:\MyProjectTemplate
pnpm frontend:check
```

이 명령은 다음을 순서대로 실행한다.

1. OpenAPI 생성 타입이 기준 명세와 같은지 확인
2. 공통 API client TypeScript 검사
3. API 성공·생성·Problem Detail·request ID·Bearer header 테스트
4. 웹 TypeScript 검사
5. runtime OIDC 설정, callback, 갱신과 비활성 lazy-load 테스트
6. 로딩·목록·오류·미로그인 안내 컴포넌트 테스트
7. production build와 OIDC 별도 chunk 생성

### 브라우저 E2E

`pnpm frontend:check`는 jsdom까지만 확인한다. 실제 Chromium에서 화면 전체를 확인하려면 E2E를 실행한다.

```powershell
cd D:\MyProjectTemplate
pnpm web:e2e:install
pnpm web:e2e
```

- `pnpm web:e2e:install`은 Chromium을 한 번만 내려받는다.
- `pnpm web:e2e`는 production build를 만들고 `vite preview`를 띄운 뒤 Playwright로 연다.
- 백엔드는 필요 없다. `/api/v1/items`와 `/app-config.json` 응답을 브라우저 단계에서 가로채기 때문에 Gateway, sample-service, PostgreSQL 없이 항상 같은 결과가 나온다.

E2E가 검증하는 것:

| 시나리오 | 확인 |
|---|---|
| 로딩 | 응답 전 로딩 상태와 `요청 중` 표시 |
| 빈 목록 | 0건 응답의 안내 문구 |
| 목록 | 응답 순서와 record 수 |
| 5xx | 오류 문구, request ID, `다시 시도`로 복구 |
| 연결 실패 | Gateway 확인 안내 |
| 403 | 재시도 버튼 없이 권한 안내만 |
| 생성 성공 | 목록 첫 줄 반영과 전송된 요청 본문 |
| 생성 validation 오류 | 필드 단위 violation 표시 |
| 빈 입력 | 요청을 보내지 않고 폼에서 차단 |
| 인증 켬 | 로그인 전 API 미호출과 OIDC 이동 |
| 잘못된 설정 | 부팅 오류 화면 |

이 stub E2E는 Gateway 응답을 흉내 내므로 Gateway routing, CORS, 실제 OIDC redirect는 검증하지 않는다. 그 부분은 실제 스택을 띄우는 `pnpm web:e2e:oidc`([OIDC 인증 가이드](authentication.md) 8절)와 `pnpm web:image:smoke`(이 문서 8절)가 담당한다.

## 10. 자주 생기는 문제

| 증상 | 확인 | 해결 |
|---|---|---|
| `pnpm` 명령 없음 | `corepack --version` | Corepack으로 pnpm 11.10.0 활성화 |
| 5173 포트 사용 중 | `Get-NetTCPConnection -LocalPort 5173` | 기존 Vite를 종료한 뒤 재실행 |
| 화면은 열리지만 `확인 필요` | Gateway health | `:8080` Gateway와 `:8081` 서비스 실행 |
| Gateway만 8082 사용 | Vite proxy 대상 | 아래처럼 현재 터미널의 `GATEWAY_PROXY_TARGET`을 설정하고 `pnpm web:dev` 실행 |
| 설정 오류 화면 | `public/app-config.json` | JSON 문법, environment와 URL 안전 규칙 확인 |
| POST validation 오류 | 이름 길이와 공백 | 1~120자의 이름 입력 |
| production에서 localhost 거부 | prod `apiBaseUrl` | 같은 origin 또는 실제 HTTPS Gateway 사용 |
| 화면에 `로그인 필요` | 인증이 켜졌지만 미로그인 | 상단 로그인 버튼 사용 |
| 로그인 뒤 redirect 오류 | Keycloak callback 불일치 | `localhost:5173/oidc/callback` exact 등록 |
| 로그인 뒤에도 401 | Gateway issuer 불일치 | runtime authority와 Gateway issuer를 같은 realm으로 맞춤 |

Gateway 기본 포트 `8080`이 충돌해 `8082`로 실행했다면 프론트 터미널에서 다음처럼 로컬 proxy 대상만 바꾼다.

```powershell
$env:GATEWAY_PROXY_TARGET='http://localhost:8082'
pnpm web:dev
```

이 환경변수는 Vite 개발/미리보기 서버의 로컬 proxy에만 사용되며 브라우저 production bundle에 포함되지 않는다.

## 11. 종료

프론트 터미널 D에서 `Ctrl+C`를 누른다. 그다음 Gateway와 sample-service 터미널에서 각각 `Ctrl+C`를 누르고, 마지막에 Docker를 내린다.

```powershell
docker compose --env-file infra/.env.versions -f infra/compose.yml down
```

`down`은 DB volume을 보존한다. 데이터를 정말 삭제하려는 경우가 아니면 `down -v`를 사용하지 않는다.

## 아직 구현하지 않은 것

- HTTP-only cookie를 사용하는 BFF adapter와 그에 필요한 CSRF 방어
- SSR adapter — 실제 SEO·서버 렌더 요구가 확인될 때만 추가한다
- 스크린샷 기반 시각 회귀 — 픽셀 비교가 필요한 실제 요구가 생기면 추가한다
- Kubernetes ingress/LB manifest — 로컬 nginx ingress 예제까지만 있고 운영 배포 기반은 P1-B에서 다룬다

로컬 E2E와 smoke 통과는 로컬 조건의 검증이다. dev/prod의 HTTPS ingress, 실제 IdP와 CDN 조건은 배포 환경별 smoke로 별도 확인해야 한다.
