# 의존성 업데이트와 Dependabot 운영 가이드

이 문서는 Git과 Dependabot을 처음 사용하는 사람도 GitHub에 자동 생성된 업데이트 브랜치를 안전하게 처리할 수 있도록 설명한다. 핵심 원칙은 **작은 업데이트는 묶어서 검증하고, 큰 버전 전환은 별도 작업으로 다루는 것**이다.

## 1. 브랜치가 많아지는 이유

Dependabot은 새 버전을 발견하면 업데이트 전용 브랜치와 Pull Request(PR)를 만든다. 예를 들어 `dependabot/npm_and_yarn/.../tailwindcss-4.3.3`은 사람이 개발 중인 기능 브랜치가 아니라 Tailwind CSS 버전만 바꾸기 위한 자동 브랜치다.

- 브랜치: 변경 내용을 임시로 보관하는 작업선
- PR: 그 브랜치를 `main`에 합쳐도 되는지 검토하는 화면
- CI: 테스트, 빌드, Compose 설정 검사를 자동 실행하는 장치
- `main`: 검증을 통과한 최종 기준 브랜치

로컬에서 `git branch`를 실행했을 때 `main`만 나온다면 직접 관리할 로컬 브랜치는 하나뿐이다. GitHub에서 보이는 `dependabot/...` 브랜치는 해당 PR을 처리하면 함께 정리된다.

## 2. 이 저장소의 자동 업데이트 정책

정책은 [`.github/dependabot.yml`](../.github/dependabot.yml)에 있다.

| 대상 | 확인 주기 | 동시에 열 수 있는 일반 업데이트 PR | 처리 방법 |
|---|---:|---:|---|
| Gradle | 매주 | 2개 | minor/patch를 한 PR로 묶고 major는 자동 PR에서 제외 |
| configurator npm | 매주 | 2개 | minor/patch를 한 PR로 묶고 major는 자동 PR에서 제외 |
| GitHub Actions | 매월 | 2개 | 관련 액션 업데이트를 한 PR로 묶음 |

여기서 major, minor, patch는 `주버전.부버전.수정버전` 형식의 숫자를 뜻한다.

- patch 예: `4.2.1 → 4.2.2`. 오류 수정 중심이지만 테스트는 필요하다.
- minor 예: `4.2.1 → 4.3.0`. 호환 기능 추가가 일반적이지만 테스트는 필요하다.
- major 예: `3.x → 4.x`. 설정, API 또는 실행 조건이 바뀔 수 있어 마이그레이션 작업으로 다룬다.

`ignore`의 major 제외는 일반 버전 업데이트에만 적용된다. GitHub의 보안 업데이트는 일반 업데이트 제한과 별도로 계속 생성된다.

## 3. 초보자용 PR 처리 순서

### 3.1 PR 내용 확인

1. GitHub 저장소의 **Pull requests** 탭을 연다.
2. 제목이 `chore(deps)` 또는 `chore(deps-dev)`로 시작하는지 확인한다.
3. **Files changed**에서 의존성 파일 외에 예상하지 못한 소스 코드가 바뀌지 않았는지 본다.
4. 버전 숫자의 첫 번째 자리가 바뀌면 major 업데이트로 분류한다.

예상 파일은 다음과 같다.

- Gradle wrapper: `gradle/wrapper/*`, `gradlew`, `gradlew.bat`
- Spring 또는 Java 라이브러리: `build.gradle`
- configurator npm: `tools/configurator/package.json`, `package-lock.json`
- GitHub Actions: `.github/workflows/*.yml`

### 3.2 GitHub CI 확인

PR 아래의 **Checks** 또는 **Actions**에서 다음 작업이 모두 초록색인지 확인한다.

- `backend`: Java 전체 테스트
- `configurator`: 구성 마법사 설치, 보안 감사, 테스트와 빌드
- `frontend`: OpenAPI 타입, TypeScript, React 테스트와 빌드
- `compose-contract`: 전체 Compose 프로필 설정 검사
- `load-test-contracts`: 부하 테스트 스크립트 계약 검사

하나라도 빨간색이면 병합하지 않는다. 실패 작업을 열고 첫 번째 실제 오류를 찾는다. 마지막 줄의 `exit code 1`은 결과일 뿐 원인이 아닌 경우가 많다.

### 3.3 로컬에서 다시 확인

PowerShell에서 저장소로 이동한다.

```powershell
Set-Location D:\MyProjectTemplate
git status
git pull --ff-only
```

`git status`에 내가 작성 중인 파일이 표시되면 먼저 작업을 보관하거나 커밋해야 한다. 내용을 모른 채 삭제하거나 `reset --hard`를 실행하지 않는다.

필수 검증을 순서대로 실행한다.

```powershell
# Java 21을 이 PowerShell 세션의 Gradle 실행에 사용
$env:JAVA_HOME = "C:\Program Files\Java\jdk-21"
\.\gradlew.bat test --no-daemon

docker compose --env-file infra/.env.versions -f infra/compose.yml config

Set-Location tools\configurator
npm run lint
npm test
Set-Location ..\..

pnpm tools:test
pnpm frontend:check
```

`Dependency requires at least JVM runtime version 17` 오류가 나면 코드 문제가 아니라 `JAVA_HOME`이 Java 11을 가리키는지 먼저 확인한다.

```powershell
java -version
$env:JAVA_HOME
```

### 3.4 병합 후 최종 확인

1. PR의 모든 CI가 성공했는지 다시 본다.
2. **Squash and merge**로 병합한다.
3. **Delete branch**가 표시되면 Dependabot 브랜치를 삭제한다.
4. `main`에서 새로 시작된 CI도 모두 성공할 때까지 확인한다.
5. 로컬을 최신 상태로 맞춘다.

```powershell
Set-Location D:\MyProjectTemplate
git pull --ff-only
git status
```

정상이라면 `Your branch is up to date with 'origin/main'`과 깨끗한 작업 트리가 표시된다.

## 4. 상태별 판단표

| GitHub 상태 | 뜻 | 해야 할 일 |
|---|---|---|
| `CLEAN` + CI 성공 | 충돌이 없고 자동 검사 통과 | 변경 범위와 버전 위험을 확인한 뒤 병합 가능 |
| `UNSTABLE` | 검사 실패 또는 아직 완료되지 않은 검사 존재 | 실패 로그 확인, 병합 금지 |
| `DIRTY` | `main`과 충돌 | 최신 기준으로 브랜치를 갱신하거나 사람이 충돌 해결 |
| CI 성공 + major 업데이트 | 현재 테스트는 통과했지만 호환성 변경 가능 | 자동 병합하지 않고 별도 마이그레이션 계획 작성 |
| PR 내용이 이미 `main`에 있음 | 중복 또는 대체된 PR | 근거가 되는 커밋과 CI 링크를 남기고 PR 종료 |

## 5. 이 저장소에서 major 업데이트를 따로 다루는 이유

다음 변경은 단순 버전 숫자 교체가 아니다.

- Spring Boot 3 → 4: 프레임워크 API, 플러그인, 설정 호환성 확인 필요
- Gradle 8 → 9: 제거된 Gradle API와 플러그인 호환성 확인 필요
- TypeScript 5 → 7 또는 ESLint 9 → 10: 빌드 도구와 lint 설정 동시 검토 필요
- `@types/node` 22 → 26: 실제 CI 런타임 Node 22와 타입 기준이 달라질 수 있음

major 업데이트가 필요하면 별도 브랜치에서 마이그레이션 문서, 단위 테스트, 전체 CI 결과를 함께 준비한다. 테스트 한 번의 성공만으로 운영 호환성을 보장하지 않는다.

## 6. 자주 묻는 질문

### 브랜치가 많으면 저장소가 느려지나?

일반적으로 몇 개의 원격 브랜치 때문에 애플리케이션 실행이 느려지지는 않는다. 문제는 사람이 검토해야 할 PR이 많아져 중요한 실패나 보안 변경을 놓치기 쉬워진다는 점이다.

### Dependabot PR은 전부 병합해야 하나?

아니다. 현재 런타임과 맞지 않거나 major 마이그레이션이 준비되지 않았다면 보류하거나 종료할 수 있다. 다만 보안 업데이트는 영향도를 확인하고 우선 처리한다.

### CI가 통과하면 무조건 안전한가?

아니다. CI는 저장소에 작성된 검사 범위가 성공했다는 뜻이다. 실제 브라우저, 운영 IdP, 운영 데이터, 장시간 부하처럼 CI가 다루지 않는 범위는 별도 검증이 필요하다.

## 7. 관련 자료

- [GitHub Dependabot 옵션 공식 문서](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [GitHub Dependabot PR 수 최적화 공식 문서](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/optimizing-pr-creation-version-updates)
- [자동 테스트와 설정 검증](verification.md)
- [환경별 안전 규칙](environments.md)
