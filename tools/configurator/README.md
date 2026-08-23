# MSA Architecture Console

`template-config.json`을 만드는 로컬 구성 마법사다. 선택값은 저장소 루트의 JSON schema와 일치하며 `tools/apply-config.ps1`, `tools/new-service.ps1`, `tools/new-service.sh`가 그대로 소비한다. 생성기는 선택된 starter와 기능별 local/dev/prod 설정을 함께 만들며 `pnpm tools:test`로 PowerShell/Bash 결과의 동등성을 검사한다.

프론트 선택은 `none`, `spa`, `ssr` 중 하나다. `spa`는 현재 `apps/web` React SPA를 사용하며, `ssr`은 실제 SEO/서버 렌더 요구가 있을 때 후속 adapter가 필요하다는 경고를 함께 내보낸다. 이전 설정처럼 `frontend`가 없으면 적용 도구는 `none`으로 처리한다.

```bash
npm install
npm run dev
npm test
```

페이지에서 목표 TPS와 가용성은 계획 입력값으로만 사용한다. 화면에 표시되는 replica/vCPU는 최초 부하 시험을 위한 시작점이며 성능 보장이 아니다.

이 도구는 비밀 값을 수집하거나 저장하지 않는다. 내려받은 설정에도 비밀번호와 token을 넣지 않는다.
