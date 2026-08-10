# Release Board — 데브옵스 릴리즈 Go/NoGo

**<https://rel-mgmt.metacog.co.kr>**

데브옵스 스택 **55종**의 최신 릴리즈·EOL 일정을 매일 밤 자동 수집하고,
규칙 기반으로 **지금 도입해도 되는지(GO / HOLD / NO-GO)** 를 판정해 보여주는 릴리즈 관리 보드입니다.

- 수집: 매일 **CDT 02:00 (UTC 07:00)** GitHub Actions 크론
- 데이터 출처: [endoflife.date](https://endoflife.date) (EOL·지원 일정) + [GitHub Releases API](https://docs.github.com/rest/releases) (최신 릴리즈·릴리즈 노트)
- 호스팅: 정적 SPA → GitHub Pages (서버 비용 0)

---

## 이 보드가 답하는 질문

| 질문 | 화면에서 보는 곳 |
| --- | --- |
| 최신 버전을 지금 올려도 되나? | **판정** 열 (GO / HOLD / NO-GO + 점수) |
| 안 된다면 뭘 올려야 하나? | **도입 권장** 열 — 지금 기준을 통과하는 가장 최신 버전 |
| 왜 그렇게 판정했나? | 행을 펼치면 나오는 **판정 근거** (감점 항목과 점수) |
| 언제까지 쓸 수 있나? | **지원 잔여** 미터 + 릴리즈 트레인별 EOL 타임라인 |
| 어제와 뭐가 달라졌나? | 상단 **직전 수집 대비 변경** 피드 |

헤드라인 판정은 언제나 *최신 버전* 기준입니다. 최신이 GO가 아닐 때 실무에서 필요한 건
"그럼 뭘 쓰지?"이므로, 통과하는 최신 버전을 **도입 권장**으로 함께 계산합니다.

---

## 판정 규칙

100점에서 리스크만큼 감점하고 **80점 이상 GO / 50점 이상 HOLD / 미만 NO-GO** 로 나눕니다.
규칙은 [`scripts/verdict.ts`](scripts/verdict.ts) 한 파일에 모여 있습니다.

**즉시 탈락 (점수와 무관하게 NO-GO)**

- 프리릴리즈 — RC / beta / alpha / snapshot 태그
- 보안 지원 종료(EOL)가 이미 지난 버전

**감점 항목**

| 항목 | 감점 |
| --- | --- |
| 새 트레인(.0) 출시 7일 미만 | −45 |
| 새 트레인 숙성 기간 미달 (기본 30일) | −25 |
| 패치 릴리즈 3일 미만 / 10일 미만 | −25 / −12 |
| `.0` 릴리즈 | −20 |
| 기준 패치 번호 미달 | −10 |
| EOL 잔여 30일 / 90일 / 180일 미만 | −55 / −30 / −15 |
| 일반 지원 종료 (보안 패치만 제공) | −20 |
| 유지보수 중단된 트레인 | −25 |
| EOL 잔여 365일 이상 | **+5** |
| LTS 라인 | **+8** |

새 마이너 트레인과 기존 트레인의 패치는 리스크 성격이 다릅니다. 전자는 기능 변경이 들어와
초기 결함이 몰리고, 후자는 대개 버그·보안 수정이라 **미루는 것 자체가 리스크**여서 기준일을 나눠 적용합니다.

임계값은 제품별로 덮어쓸 수 있습니다. PostgreSQL·MySQL·MongoDB처럼 되돌리기 어려운 시스템은
숙성 기준을 90일로 올려 잡았습니다 — [`scripts/catalog.ts`](scripts/catalog.ts)의 `policy` 참고.

---

## 추적 대상 추가·수정

[`scripts/catalog.ts`](scripts/catalog.ts) 배열에 한 줄 추가하면 끝입니다.

```ts
{
  id: 'nats',
  name: 'NATS',
  category: 'runtime',              // container | iac-cicd | observability | runtime
  vendor: 'CNCF',
  blurb: '경량 메시징 시스템',
  homepage: 'https://nats.io',
  icon: 'natsdotio',                // simple-icons slug (선택)
  eol: 'nats-server',               // endoflife.date slug (선택)
  repo: 'nats-io/nats-server',      // GitHub owner/repo (선택)
  policy: { minSoakDays: 45 },      // 기본 정책 오버라이드 (선택)
}
```

- `eol`과 `repo`는 **둘 중 하나만 있어도** 동작합니다.
- 둘 다 있으면 EOL 일정은 endoflife.date를, 릴리즈 노트와 최신 패치는 GitHub을 씁니다.
- 사용 가능한 endoflife.date slug 목록: <https://endoflife.date/api/v1/products>
- 아이콘은 첫 수집 때 `public/icons/<id>.svg`로 내려받아 저장소에 커밋됩니다 (CDN 의존 없음).

---

## 로컬 실행

```bash
npm install
```

```bash
GITHUB_TOKEN=$(gh auth token) npm run collect
```

> 토큰 없이도 돌지만 GitHub API 레이트리밋이 시간당 60건이라 절반쯤 실패합니다.
> 실패한 제품은 직전 스냅샷을 유지하고 화면에 ⚠ 경고를 표시합니다.

```bash
npm run dev
```

http://localhost:5173 으로 접속합니다.

기타 스크립트

```bash
npm run collect:dry   # 파일을 쓰지 않고 수집 결과만 출력
npm run typecheck     # 타입 검사
npm run build         # 타입 검사 + 프로덕션 빌드
```

---

## GitHub Pages 배포

1. 이 저장소를 GitHub에 push 합니다 (기본 브랜치 `main`).
2. **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 바꿉니다.
3. **Settings → Actions → General → Workflow permissions** 에서 **Read and write permissions** 를 켭니다.
   (수집 결과를 저장소에 커밋하기 위해 필요합니다.)
4. **Actions → Daily collect & deploy → Run workflow** 로 첫 실행을 수동 트리거합니다.

이후에는 매일 UTC 07:00에 자동으로 수집 → 커밋 → 빌드 → 배포가 돌아갑니다.

### 커스텀 도메인

[`public/CNAME`](public/CNAME)에 `rel-mgmt.metacog.co.kr`이 들어 있습니다.
DNS에 `rel-mgmt` CNAME → `jeonck.github.io` 레코드가 있어야 하고,
GitHub이 도메인 검증을 마치면 Settings → Pages에서 **Enforce HTTPS** 를 켤 수 있습니다.

배포 경로(`vite base`)는 워크플로가 자동으로 계산합니다 — `public/CNAME`이 있으면 사이트 루트(`/`),
없으면 프로젝트 페이지 경로(`/<repo>/`)를 씁니다. 도메인을 떼려면 `public/CNAME`만 지우면 됩니다.

> GitHub Actions 크론은 UTC만 지원합니다. 미국 중부 시간에 정확히 고정하려면
> 서머타임 전환 시기에 `.github/workflows/daily.yml`의 cron을 `0 7`(CDT) ↔ `0 8`(CST)로 조정하세요.
> 야간이기만 하면 되는 용도라면 그대로 둬도 무방합니다.

---

## 구조

```
scripts/                수집기 (Node + tsx, 브라우저 코드와 타입 공유)
  catalog.ts            추적 대상 정의 — 여기만 고치면 제품이 늘어난다
  verdict.ts            Go/NoGo 규칙 엔진
  collect.ts            수집 → 병합 → 판정 → 스냅샷 저장 오케스트레이션
  sources/              endoflife.date · GitHub Releases 어댑터
  lib/                  HTTP 재시도·동시성 제한, 버전 파서
src/
  lib/types.ts          수집기와 UI가 공유하는 데이터 계약
  components/           보드 UI
public/data/
  releases.json         최신 스냅샷 (워크플로가 매일 갱신)
  events.json           최근 400건 변경 로그
```

### 안정성 설계

- 개별 제품 수집이 실패해도 **직전 스냅샷을 유지**하고 나머지는 계속 진행합니다.
- 외부 API는 지수 백오프로 3회 재시도하고, 동시 요청은 6개로 제한합니다.
- 프리릴리즈가 안정 버전을 밀어내지 않도록 트레인 단위로 안정판을 우선합니다.
