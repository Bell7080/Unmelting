# 개발 환경 업그레이드 — little_token 피드백 이식안

`Yeop-Git/little_token`(2026 넥슨 재밌넥 최우수상)의 개발 규율을 조사해
**Unmelting에 그대로 이식할 수 있는 형태**로 정리했다.

- 조사 기준: little_token `19c93ad`(v_0.5.58) · Unmelting `a47f039`
- 각 항목은 `little_token 방식 → Unmelting 현재 상태(실측) → 이식안` 순서다.
- 이식안 코드 블록은 그대로 붙여 넣을 수 있게 썼다. 수치는 전부 실측값이다.

> 이 문서는 **작업 지시서**다. 항목을 반영하면 해당 절을 지우고 결과 규칙만
> `CLAUDE.md`로 옮긴다. 이 문서를 패치노트로 쌓지 않는다.

---

## 0. 우선순위 요약

| # | 항목 | 효과 | 위험 | 공수 |
|---|---|---|---|---|
| 1 | [문서 분할 — CLAUDE.md 다이어트](#1-문서-분할--토큰-절감) | 매 세션 컨텍스트 **43.8KB → ~12KB** | 낮음 | 2~3h |
| 2 | [BGM 스트리밍 전환](#5-오디오--렉메모리-절감) | 상주 메모리 **~120MB → ~0MB** | 낮음 | 1~2h |
| 3 | [검증 게이트 자동화](#3-ai-작업-관리--검증-게이트) | 테스트 38종이 CI에서 실제로 돌기 시작 | 낮음 | 1h |
| 4 | [리소스 수명주기 검사](#4-리소스-수명주기-검사) | 렉 유발 코드가 리뷰 없이 못 들어옴 | 낮음 | 1~2h |
| 5 | [버전·데브로그 규칙](#2-버전과-데브로그-규칙) | 변경 추적 + CLAUDE.md 오염 차단 | 낮음 | 1h |
| 6 | [에셋 파이프라인](#6-에셋-파이프라인) | 최초 로딩 압축, 회귀 차단 | 중간 | 3~4h |
| 7 | [밸런스 전수 검사 툴](#7-밸런스-전수-검사-툴) | 데이터 변경 회귀 방어 | 중간 | 4h+ |

1~5번까지가 "적은 공수로 확실히 이득"인 구간이다.

---

## 1. 문서 분할 — 토큰 절감

### little_token 방식

역할별로 문서를 **4개로 쪼갰고, AI가 매번 읽는 건 하나뿐**이다.

| 파일 | 크기 | 역할 | 자동 로드 |
|---|---|---|---|
| `AGENTS.md` | 22.2KB | 기획 원칙 + **전투 로직 불변식** + 코드 책임 경계 | O |
| `SENTENCE_COMBAT_SPEC.md` | 28.6KB | 전투 명세 원본(수식·스키마·폐지 목록) | X — 필요할 때만 |
| `VERSION.md` | 89.5KB | 버전 이력 전문 | X — **여기에만 쌓는다** |
| `TODO.md` | 22.3KB | 미완료 작업(P0~P4 우선순위) | X |

핵심은 크기가 아니라 **"쌓이는 글은 자동 로드되는 문서 밖으로"** 라는 배치다.
`AGENTS.md`에는 날짜별 변경 서술이 한 줄도 없다. 전부 `VERSION.md`로 간다.

그리고 `AGENTS.md`의 본문은 대부분 **불변식(invariant)** 이다 — "무엇을 했다"가
아니라 "무엇을 깨면 안 된다"로 쓰여 있어서, 내용이 늘어도 늙지 않는다.

```
- `core/compiler.ts`는 순수함수로 유지한다. RNG와 화면 상태를 참조하지 않는다.
- 관용구 배수가 유일한 곱셈 요소다.
- 모순 판정 뒤 어떤 슬롯에서도 선택지가 0개가 되는 소프트락을 허용하지 않는다.
```

> **정직하게 짚을 점:** little_token에 "토큰 절감"이라는 명시적 규칙 문서는
> **없다.** 위 구조가 결과적으로 그 역할을 하고 있는 것이고, 아래 이식안은
> 그 구조를 규칙으로 명문화한 것이다.

### Unmelting 현재 상태 (실측)

- `CLAUDE.md` **43,785 bytes** — little_token 자동 로드 문서의 **2배**. 매 세션 전량 로드된다.
- 단일 줄 길이 최대 **5,554자**(L40 `구현 우선 사실`), 2위 **4,847자**(L64). 한 줄에 20개 넘는 사실이 붙어 있다.
- **중복 절 3쌍**:
  - `UI/UX 규칙`(L83) ↔ L126 이후 무제목 UI 항목들 — 이모지 금지·테마 유지가 두 번
  - `코드 규칙`(L91) ↔ `코드 작성 규칙`(L105) — 4줄 중 3줄이 같은 말
  - `문서 규칙`(L96) ↔ `기획 기준`(L126) — "패치노트 누적 금지"가 두 번
- **자기 규칙 위반**: `문서 규칙`은 "장문 패치노트 누적 금지"인데, L131~200이
  정확히 누적된 패치노트다(`제단 팩 4슬롯 등장 지연을 nth-child(4)까지 명시해…`
  같은 완료 보고가 30줄 이상).

즉 현재 CLAUDE.md의 약 **40%가 과거 작업 보고서**이며, 매 세션 매 요청에
이 비용이 붙는다.

### 이식안

**A. 파일 분할**

```
CLAUDE.md                  ← 12KB 목표. 불변식 + 매니저 맵 + 규칙만.
VERSION.md                 ← 신규. 변경 이력 전량 이관. 자동 로드 안 됨.
Unmelting_Game_Concept.md  ← 유지 (원형 기획서)
Unmelting_Story.md         ← 유지 (톤/세계관)
Ena_Companion_AI_Design.md ← 유지 (에나 설계 원본)
TODO.md                    ← 신규(선택). P0~P4 미완료 작업.
```

**B. CLAUDE.md 재구성 — 이 골격으로 다시 쓴다**

```markdown
# CLAUDE.md
(원칙: 이 문서는 "지금 지켜야 하는 것"만 담는다. "무엇을 했다"는 VERSION.md로.)

## 프로젝트 요약            (현행 유지, ~10줄)
## 스토리 톤/테마 연계       (현행 유지)
## 실행/검증               (명령 목록 + 게이트)
## 코드 구조(매니저 맵)      (현행 유지 — 가장 가치 높은 절)
## 시스템 불변식            ★신설. 아래 C 참고
## UI/UX 규칙              (L83 절 + L126~135 병합, 중복 제거)
## 코드 규칙                (L91 + L105 병합, 중복 제거)
## 문서 규칙                (아래 D 참고)
```

`구현 우선 사실(2026-06-13 기준)` 절은 통째로 해체한다. 각 항목을 셋 중 하나로:

- 지금도 지켜야 하는 규칙 → **시스템 불변식**으로 이동 (단문 1줄씩)
- 과거의 변경 서술 → **VERSION.md**로 이동
- 코드를 읽으면 알 수 있는 것 → **삭제** (코드가 원본이다)

**C. 불변식 문체로 바꾸는 예시** — 사실 나열을 규칙으로 되쓴다.

```diff
- 보스 칸 기믹 격자: 큰 칸 1개로 그려지는 보스 위에 `BossGimmickManager`가 투명
-   격자를 깔아 칸 단위 피해 배율을 굴린다. (…5,554자 계속…)

+ ## 시스템 불변식
+ - 보스 칸 배율 결정은 `BossGimmickManager.resolveMultiplier()` **단일 창구**를
+   지난다. 바깥에서 태그/시너지 보정을 계산하면 태그 반응 사각지대가 생긴다.
+ - 손패 피해가 기믹 격자를 타는 진입점은 `HandSystem.hitCard` /
+   `hitCardAsAreaDamage` 둘뿐이다. 새 공격 손패는 이 둘을 거쳐야 자동 반영된다.
+ - `occupiedDistRows ≥ 2` 보스는 행별 타일이 따로 그려진다. 프로필을 켜기 전에
+   행별 오프셋을 먼저 정한다.
+ - 칸 개념이 없는 학습 시뮬은 `bossGimmickExpectation()` 요약으로 같은 밸런스를
+   따라온다. 배율을 바꾸면 이 함수도 함께 고친다.
```

같은 정보인데 (a) 짧고 (b) 각 줄이 독립적으로 검색·수정 가능하고 (c) 시간이
지나도 유효하다.

**D. 문서 규칙 — 이 4줄로 교체**

```markdown
## 문서 규칙
- `CLAUDE.md`는 **현재 지켜야 하는 규칙·불변식·경계**만 담는다. 완료된 작업
  서술을 추가하지 않는다. 변경 이력은 `VERSION.md`에만 쌓는다.
- 한 항목은 한 규칙이다. 한 줄에 여러 사실을 이어 붙이지 않는다(목표 200자 이내).
- 코드를 읽으면 바로 알 수 있는 내용은 문서에 옮겨 적지 않는다. 대신 **어느
  파일이 그 규칙의 단일 출처인지**를 적는다.
- 절을 추가하기 전에 기존 절에 들어갈 자리가 있는지 먼저 본다. 중복 절을 만들지 않는다.
```

**E. 정기 점검** — 분기마다 또는 CLAUDE.md가 20KB를 넘으면 D 기준으로 다시 압축한다.

---

## 2. 버전과 데브로그 규칙

### little_token 방식

- 버전은 `v_주.부.패치`. **필요한 가장 낮은 자리만** 올린다.
  - 패치: 버그·밸런스·문서·리팩터링·리소스 정리
  - 부: 새 시스템·화면·콘텐츠 묶음
  - 주: 저장 데이터/핵심 규칙 비호환, 정식 출시 단계
- 커밋 제목은 **`v_x.x.x - 변경 요약`** 고정. 실제 이력 81커밋이 전부 이 형식이다.
- 커밋 하나 = 논리적 변경 하나 = 버전 하나.
- 매 커밋에서 `VERSION.md` · `package.json` · `package-lock.json` 버전을 동기화.
- `VERSION.md`는 버전별로 "무엇이 왜 바뀌었는지"를 쓴다. 특히 **되돌린 이유**를
  남기는 게 특징이다:

  ```
  ### v_0.5.53
  - 승리 CLEAR 연출을 v_0.5.52 이전으로 되돌렸다. 원화를 종이·글자·요정으로
    쪼개 다시 조립하니 한 장으로 그려진 그림의 균형이 깨졌다 — 원화 한 장을
    그대로 쓰는 원래 배너로 복원한다.
  ```

  같은 시도를 두 번 하지 않게 만드는 로그다. AI 협업에서 특히 값이 크다.

> **정직하게 짚을 점:** `AGENTS.md`는 "버전 커밋에 annotated tag를 남긴다"고
> 규정하지만 저장소의 실제 태그는 **0개**다. 지켜지지 않는 규칙이니 이식할 때
> **자동화하거나 규칙에서 빼라.** 사람이 매번 손으로 붙이는 규칙은 죽는다.

### Unmelting 현재 상태

- `package.json` version `0.1.0` — 커밋 이력과 무관하게 고정.
- 변경 이력 문서 없음. 대신 `CLAUDE.md` 하단이 비공식 데브로그가 됨(§1 참조).
- 커밋 제목은 Conventional Commits(`feat(boss):`, `fix(sacrifice):`). 이미 일관돼
  있고 GitHub에서 읽기 좋다 — **바꿀 이유 없다.**

### 이식안

little_token 형식을 그대로 베끼지 말고, **"이력은 VERSION.md에만"** 이라는
핵심만 가져온다. 커밋 규약은 Unmelting 쪽이 이미 낫다.

**A. `VERSION.md` 신설**

```markdown
# 버전 관리

현재 버전: **v0.1.0**

`VERSION.md`와 `package.json`의 버전은 항상 같다.

## 번호 규칙
- 패치(0.0.x): 버그 수정, 밸런스 조정, 연출 손질, 리팩터링, 문서
- 부(0.x.0): 새 시스템·화면·콘텐츠 묶음 (예: 새 보스, 거점 신규 칸)
- 주(x.0.0): 저장 데이터 비호환 변경 (에나 저장 키 계약, `ENA_FEATURE_COUNT`
  변경 등), 또는 출시 단계 변경

## 기록 규칙
- 항목은 **무엇을 왜** 바꿨는지 쓴다. 되돌린 변경은 되돌린 이유를 반드시 남긴다.
- 이 문서에만 이력을 쌓는다. `CLAUDE.md`에 완료 보고를 추가하지 않는다.

## 변경 이력

### v0.1.0 — 2026-07-28
- (여기서부터 기록 시작)
```

**B. 커밋 규약 — CLAUDE.md `문서 규칙`에 추가**

```markdown
- 커밋 제목은 Conventional Commits(`feat(scope): 요약`)를 유지한다.
- 부(minor) 이상 버전을 올리는 커밋은 `package.json`과 `VERSION.md`를 함께
  갱신하고, `VERSION.md`에 무엇을 왜 바꿨는지 남긴다.
- 되돌리는 변경은 되돌린 **이유**를 `VERSION.md`에 반드시 적는다. 같은 시도를
  두 번 하지 않기 위한 기록이다.
```

**C. 태그는 자동화하거나 넣지 않는다.** 손으로 붙이는 규칙은 little_token에서
이미 실패했다. 굳이 원하면 CI에서 `package.json` version 변경을 감지해
자동 태깅하는 잡을 두는 쪽이 맞다.

---

## 3. AI 작업 관리 — 검증 게이트

### little_token 방식

핵심은 **"AI가 건너뛸 수 없게 npm 스크립트 체인에 게이트를 박아 둔 것"** 이다.
문서로 "테스트 돌려라"라고 부탁하는 대신 명령이 강제한다.

```json
"predev":  "npm run assets:optimize",
"prebuild":"npm run assets:optimize",
"dev":     "npm run data:generate && vite",
"build":   "npm run data:generate && npm run assets:check && npm run resources:check && tsc && vite build"
```

- `npm run build` 한 번에 **데이터 생성 → 에셋 규격 검사 → 리소스 수명주기 검사
  → 타입 검사 → 빌드**가 전부 돈다. 하나라도 실패하면 빌드가 없다.
- `predev`/`prebuild`는 npm 라이프사이클이라 **잊을 수가 없다.**
- CI(`.github/workflows/deploy.yml`)도 `type-check` → `build` 두 단계를 명시.
- 기능 브랜치는 build/type-check까지만 돌고 배포는 `main`에서만
  (`if: github.ref == 'refs/heads/main'`) — Pages 환경 보호 규칙 거부 오류 회피.
- `AGENTS.md` 작업 규칙:
  `기능 또는 데이터 변경 후 npm run type-check, npm run sweep, npm run build를 실행한다.`
- `.claude/settings.local.json`은 `.gitignore` 처리 — 개인 권한 목록은 공유 안 함.

### Unmelting 현재 상태

- `build`: `tsc && vite build` — **테스트도 린트도 안 탄다.**
- CI: `npm install` → `npm run build`뿐. `type-check` · `lint` · `test` 없음.
- **테스트 파일 38개**(`src/systems`·`src/rl`·`src/data`·`src/ui`)가
  잘 갖춰져 있는데 **자동으로 실행되는 경로가 하나도 없다.** 사람이 기억해서
  `npm run test`를 칠 때만 돈다.
- `npm run test`는 `vitest` — watch 모드라 CI에서 **영영 안 끝난다.**
- `.gitignore`에 `.claude/`가 통째로 들어 있어 공유 설정도 커밋 불가.
- `.gitignore`에 `docs/`가 있다. 문서를 `docs/`에 두면 사라진다(이 문서를
  루트에 둔 이유).

### 이식안

**A. `package.json` 스크립트 — 게이트 체인화**

```diff
   "scripts": {
     "dev": "vite",
-    "build": "tsc && vite build",
+    "build": "npm run verify && vite build",
     "preview": "vite preview",
     "type-check": "tsc --noEmit",
     "lint": "eslint src --ext .ts,.tsx",
     "format": "prettier --write src",
-    "test": "vitest"
+    "test": "vitest run",
+    "test:watch": "vitest",
+    "resources:check": "tsx src/tools/resource-lifecycle-check.ts",
+    "verify": "npm run type-check && npm run lint && npm run test && npm run resources:check"
   },
```

- `test`를 `vitest run`(1회 실행)으로 바꾸는 게 **가장 중요하다.** 지금 형태로는
  CI에 넣는 순간 잡이 안 끝난다. 대화형은 `test:watch`로 분리.
- `verify` 하나가 관문이다. AI든 사람이든 `npm run build`만 치면 전부 탄다.
- `resources:check`는 §4에서 만든다. 그때까지는 `verify`에서 빼 둬도 된다.
- `tsx`가 devDependencies에 필요하다: `npm i -D tsx`.

**B. CI 워크플로 — 검증과 배포 분리**

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main, 'claude/**']
  pull_request:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - name: Type check
        run: npm run type-check
      - name: Lint
        run: npm run lint
      - name: Test
        run: npm run test
      - name: Build
        run: npx vite build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  # Pages 환경 보호 규칙이 main만 허용하므로 배포는 main에서만 실행한다.
  # (기능 브랜치는 verify까지만 돌고 배포는 건너뛴다 → 권한 거부 오류 방지)
  deploy:
    needs: verify
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/configure-pages@v4
      - id: deployment
        uses: actions/deploy-pages@v4
```

`claude/**` 브랜치를 트리거에 넣는 게 핵심이다 — AI 작업 브랜치가 PR 전에
스스로 검증된다.

**C. `.gitignore` 수정** — 공유 설정은 커밋하고 개인 설정만 제외

```diff
-# Claude Code internal
-.claude/
+# Claude Code — 공유 설정(.claude/settings.json)은 커밋하고 개인 권한 목록만 제외
+.claude/settings.local.json

-docs/
+# docs/ 는 빌드 산출물 경로일 때만 무시한다. 문서는 저장소 루트에 둔다.
```

`docs/` 무시는 GitHub Pages `docs/` 배포를 쓰던 흔적으로 보인다. 지금은
`dist/`로 배포하므로 문서 디렉터리를 통째로 날리는 부작용만 남아 있다.

**D. CLAUDE.md `실행/검증` 절 교체**

````markdown
## 실행/검증
```bash
npm install
npm run dev
npm run verify   # type-check + lint + test + resources:check — 이것만 통과시키면 된다
npm run build    # verify 포함
```
- 기능·데이터 변경 후에는 **반드시 `npm run verify`** 를 실행하고 결과를 보고한다.
- 실패한 검사를 우회하거나 테스트를 지워서 통과시키지 않는다. 규칙이 틀렸다고
  판단되면 규칙을 고치고 그 이유를 보고에 남긴다.
````

**E. 테스트에 관한 정직한 비교** — little_token에는 테스트 프레임워크가 **없다**
(전수 검사 시뮬레이션 툴로 대체). 여기서는 little_token을 따라가면 안 된다.
Unmelting의 vitest 38종은 명백한 강점이고, 유일한 문제는 아무도 안 돌린다는 것뿐이다.

---

## 4. 리소스 수명주기 검사

little_token에서 **가장 이식 가치가 높은 단일 파일**이다.

### little_token 방식

`src/tools/resource-lifecycle-check.ts`(104줄)는 `src/**/*.ts` 전체를 훑어서
**"이 API는 이 파일에서 정확히 n번만 생성될 수 있다"** 를 강제한다.

```ts
const rules: Rule[] = [
  { label: '이미지 로더는 ResourceLibrary 캐시를 사용해야 합니다',
    pattern: /\bnew\s+Image\s*\(/g,          allowed: { 'src/ui/ResourceLibrary.ts': 1 } },
  { label: 'HTMLAudioElement 직접 생성 대신 GameAudio/Howler를 사용해야 합니다',
    pattern: /\bnew\s+Audio\s*\(/g,          allowed: {} },
  { label: 'DOM 복제는 카드 사용 고스트 한 곳에서만 허용합니다',
    pattern: /\.cloneNode\s*\(/g,            allowed: { 'src/ui/CardHand.ts': 1 } },
  { label: 'FontFace 생성은 FontManager 단일 Promise 안에서만 허용합니다',
    pattern: /\bnew\s+FontFace\s*\(/g,       allowed: { 'src/ui/FontManager.ts': 1 } },
  // …WebGLRenderer, GLTFLoader, <video>, 애니메이션 클립 복제
]
```

`allowed`에 없는 파일에서 쓰면 실패, **허용 파일이라도 개수가 다르면 실패.**
`npm run build`가 이걸 부르므로 렉 유발 코드가 조용히 늘어날 수 없다.

이게 왜 중요한가: 웹 게임 렉의 대부분은 알고리즘이 아니라 **같은 리소스를
반복 생성/디코딩**하는 데서 온다. 이 검사는 그걸 문법 수준에서 봉쇄한다.

### Unmelting 현재 상태 (실측 스캔)

| 패턴 | 건수 | 비고 |
|---|---|---|
| `new Image(` | 1 (`src/index.ts`) | 아직 단일 — **지금 잠가 두면 유지된다** |
| `new Audio(` | 0 | 깨끗 |
| `document.createElement('video')` | 0 | 해당 없음 |
| `new FontFace` | 0 | `FontManager`가 다른 방식 사용 |
| `.cloneNode(` | **7** | 어디서 쓰는지 확인 필요 |

지금 상태가 나쁘지 않다는 게 오히려 이식하기 좋은 이유다. **깨끗할 때 잠가야
싸다.** 이미 늘어난 뒤에 도입하면 정리 비용이 붙는다.

### 이식안

**A. `src/tools/resource-lifecycle-check.ts` 신설** — little_token 원본에서
규칙 테이블만 Unmelting 실측값으로 바꾼 것

```ts
/**
 * 리소스 수명주기 검사 — `npm run resources:check`.
 * 웹 게임 렉의 주범은 같은 리소스의 반복 생성·디코딩이다. 생성 지점을 파일별
 * 개수까지 고정해, 캐시를 우회하는 코드가 조용히 늘어나지 못하게 막는다.
 * 규칙을 어긴 코드가 정당하면 이 표를 함께 고치고 이유를 커밋에 남긴다.
 */
import { readFile, readdir } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
const SRC = resolve(ROOT, 'src')

interface Rule {
  label: string
  pattern: RegExp
  /** 파일별 허용 개수. 목록에 없는 파일은 0개가 기준이다. */
  allowed: Record<string, number>
}

const rules: Rule[] = [
  {
    label: '이미지 생성은 프리로드 캐시 한 곳에서만 허용합니다',
    pattern: /\bnew\s+Image\s*\(/g,
    allowed: { 'src/index.ts': 1 }, // TODO: ResourceLibrary 분리 후 그쪽으로 옮긴다
  },
  {
    label: 'HTMLAudioElement 직접 생성 대신 BgmManager/SfxManager를 사용해야 합니다',
    pattern: /\bnew\s+Audio\s*\(/g,
    allowed: {},
  },
  {
    label: 'AudioContext 생성은 오디오 매니저 두 곳에서만 허용합니다',
    pattern: /new\s+Ctor\s*\(\)|new\s+AudioContext\s*\(/g,
    allowed: { 'src/audio/BgmManager.ts': 1, 'src/audio/SfxManager.ts': 1 },
  },
  {
    label: '비디오 요소를 직접 만들지 않습니다(현재 사용처 없음)',
    pattern: /document\.createElement\(\s*['"]video['"]\s*\)/g,
    allowed: {},
  },
  {
    label: 'FontFace 생성은 FontManager 안에서만 허용합니다',
    pattern: /\bnew\s+FontFace\s*\(/g,
    allowed: {}, // FontManager가 FontFace를 쓰게 되면 여기에 등록한다
  },
  // .cloneNode 는 현재 7건이다. 사용처를 정리해 소유 파일을 확정한 뒤 규칙을 켠다.
]

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(entries.map((entry) => {
    const path = resolve(dir, entry.name)
    return entry.isDirectory() ? walk(path) : Promise.resolve([path])
  }))
  return nested.flat()
}

const files = (await walk(SRC)).filter((file) =>
  extname(file) === '.ts'
  && !file.endsWith('.test.ts')
  && file !== resolve(SRC, 'tools/resource-lifecycle-check.ts'),
)
const contents = new Map<string, string>()
await Promise.all(files.map(async (file) => {
  contents.set(relative(ROOT, file).split('\\').join('/'), await readFile(file, 'utf8'))
}))

const failures: string[] = []
for (const rule of rules) {
  const actual: Record<string, number> = {}
  for (const [file, source] of contents) {
    const count = [...source.matchAll(rule.pattern)].length
    if (count) actual[file] = count
  }
  const paths = new Set([...Object.keys(actual), ...Object.keys(rule.allowed)])
  for (const file of paths) {
    const count = actual[file] ?? 0
    const expected = rule.allowed[file] ?? 0
    if (count !== expected) failures.push(`${rule.label}: ${file} ${count}개 (허용 ${expected}개)`)
  }
}

if (failures.length) {
  failures.forEach((failure) => console.error(failure))
  process.exitCode = 1
} else {
  console.log('리소스 수명주기 검사 통과 — 직접 생성 경로가 허용 목록 안에 있습니다.')
}
```

**B. 도입 순서**

1. `npm i -D tsx` 후 위 파일 추가, `npm run resources:check` 실행 → 통과 확인
2. `.cloneNode` 7건 사용처를 확인해 소유 파일을 정하고 규칙 추가
3. `verify` 체인에 편입

**C. Unmelting 고유 규칙으로 확장 가치가 큰 후보** — 이 저장소의 실제 약속들이다.

```ts
{ label: 'z-index 극단값(5자리 이상)을 새로 만들지 않습니다',
  pattern: /z-index:\s*\d{5,}/g,
  allowed: { /* 말풍선 9999·클러치 배너 9998·도감 10500 소유 파일 */ } },

{ label: 'localStorage 직접 접근 대신 저장 헬퍼를 사용합니다(리셋 대상 누락 방지)',
  pattern: /localStorage\.(get|set|remove)Item/g,
  allowed: { /* 저장 키 소유 파일들 */ } },
```

특히 두 번째는 CLAUDE.md가 명시한 `/리셋` 규칙(`unmelting.` 접두사 전량 삭제)을
지키게 만든다. 새 저장 키가 접두사 없이 추가되면 리셋에서 조용히 빠지는데,
지금은 그걸 잡아 주는 장치가 없다.

---

## 5. 오디오 — 렉/메모리 절감

### little_token 방식

`src/audio/GameAudio.ts`(377줄) + **Howler.js**. 핵심 원칙 한 줄:

```
긴 BGM은 HTML5 스트리밍, 짧은 효과음은 Web Audio 버퍼·보이스 풀로 재생한다.
같은 파일을 클릭마다 복제·디코딩하지 않고 다음 전투 소리만 예열한다.
```

구체적으로:

| 기법 | 구현 | 효과 |
|---|---|---|
| **BGM 스트리밍** | `new Howl({ html5: true, preload: 'metadata', pool: 1 })` | 전체 PCM 디코딩 안 함. 메모리 상수 |
| **SFX 버퍼 + 보이스 풀** | `pool: 8`(hover/타격) / `5`(일반) | 연타해도 인스턴스 재사용, 잘림 없음 |
| **긴 원본 예외 처리** | 48초 연필 소리만 `html5: true` | "1초만 쓰는데 48초 디코딩" 회피 |
| **미사용 트랙 해제** | `releaseBgm()` → `Howl.unload()` | 현재+예열 트랙만 상주 |
| **로드 실패 격리** | `failedLoads` WeakSet + `loaderror` | 오디오 하나가 막혀도 전투 진입이 소프트락 안 됨 |
| **선예열** | `preloadBattleAudio(day, bossId)` | 다음 스테이지 소리를 미리, 그 곡만 |
| **입력음 위임 1회** | `document.addEventListener('click', …, true)` 캡처 위임 | 버튼마다 핸들러 안 붙임 |
| **hover 스로틀** | 55ms 미만 재발화 무시 | 마우스 스침에 소리 폭발 방지 |

`resource-lifecycle-check`가 `new Audio(`를 **0개로 강제**해서 이 규칙이 코드로
지켜진다(§4).

### Unmelting 현재 상태 (실측)

`BgmManager.ts`(201줄) · `SfxManager.ts`(101줄)는 손으로 짠 Web Audio다.
버퍼 캐시·중복 fetch 방지·크로스페이드·`evictExcept` 정리까지 이미 잘 돼 있다.
**설계가 나쁜 게 아니라, BGM에 잘못된 기법을 쓰고 있는 게 문제다.**

```
src/assets/audio/bgm_001.mp3  4.27MB  192kbps 44.1kHz stereo  ~178초
src/assets/audio/bgm_002.mp3  4.27MB  192kbps 44.1kHz stereo  ~178초
src/assets/audio/bgm_003.mp3  4.26MB  192kbps 44.1kHz stereo  ~177초
```

`BgmManager`는 이걸 `decodeAudioData()`로 **전량 PCM 디코딩**한다.

```
178초 × 44,100Hz × 2ch × 4byte(float32) ≒ 트랙당 60MB
```

- `evictExcept([index, nextIndex])`가 **현재+다음 2트랙을 유지** → 상주 **약 120MB**
- 크로스페이드 때마다 다음 곡을 새로 디코딩 → **주기적 메인스레드 스파이크**
- 3곡을 무작위로 도니 이미 디코딩했던 곡도 evict된 뒤 **재디코딩**
- 모바일(CLAUDE.md에 ≤700px 대응이 있으니 실사용 대상)에서 이 정도 오디오
  상주는 탭 강제 종료 위험 구간이다

BGM은 한 번에 한 곡을 순서대로 흘려보내면 끝이다. 랜덤 액세스가 필요 없으므로
**전량 디코딩할 이유가 애초에 없다.**

효과음은 반대로 지금이 맞다 — 짧고 자주 나니 버퍼가 정답. 다만:
- 효과음이 **2종뿐**(`sfx_click` · `sfx_attack`). 확장 시 지금 구조로 `EFFECT_VOLUME`
  테이블 같은 정리가 필요하다.
- 재생마다 `GainNode` 새로 생성 — 짧은 소리라 실측 영향은 작지만 little_token의
  풀 방식이 더 안정적이다.

### 이식안

두 갈래가 있다. **A안을 권한다.**

**A안 — Howler 도입 (little_token과 동일, 검증된 코드)**

```bash
npm i howler
npm i -D @types/howler
```

`BgmManager`를 Howl 래퍼로 교체한다. 핵심 설정:

```ts
private createTrack(index: number): Howl {
  const bgm = new Howl({
    src: [this.urls[index]],
    html5: true,          // ★ 스트리밍 — 전량 디코딩하지 않는다
    preload: 'metadata',  // ★ 메타데이터만 먼저
    loop: false,          // 곡이 끝나면 다음 무작위 트랙으로 넘긴다
    volume: 0,            // 페이드인으로 올린다
    pool: 1,
  })
  bgm.on('loaderror', () => this.failed.add(bgm))
  return bgm
}
```

크로스페이드는 `Howl.fade(from, to, ms)` + 타이머로 만든다:

```ts
/** 꼬리 3초 구간에서 다음 곡을 겹쳐 시작한다. */
private scheduleCrossfade(current: Howl, id: number) {
  const total = current.duration() * 1000
  const at = Math.max(0, total - this.fadeMs)
  this.timer = window.setTimeout(() => {
    current.fade(this.volume, 0, this.fadeMs, id)
    current.once('fade', () => { current.stop(id); current.unload() }) // ★ 즉시 해제
    this.startNext()   // 다음 곡을 fade(0 → volume, fadeMs)로 시작
  }, at)
}
```

**트레이드오프(정직하게):** `html5: true`는 `<audio>` 요소 기반이라
`AudioContext.currentTime` 기준 **샘플 정확 스케줄링을 못 한다.** 현재
`BgmManager`가 쓰는 `scheduleIteration(startAt)` 절대시각 예약은 타이머 기반으로
바뀌고, 크로스페이드 시작이 수십 ms 흔들릴 수 있다. **3초 페이드에서는 들리지
않는 오차**이므로 120MB를 되찾는 대가로는 명백히 남는 장사다. 대신 리듬 게임처럼
박자 동기가 필요해지면 그 곡만 버퍼 방식으로 예외 처리해야 한다.

SFX는 `SfxManager`를 유지해도 되고 Howl로 통일해도 된다. 통일하면
`resource-lifecycle-check`에서 `new AudioContext` 허용을 0으로 조일 수 있다.

**B안 — 의존성 없이 스트리밍 (기존 구조 최대 보존)**

Howler를 안 쓰고 `<audio>` + `MediaElementAudioSourceNode`로 바꾼다.
`decodeAudioData` 대신:

```ts
const el = new Audio(this.urls[index])
el.preload = 'metadata'
el.crossOrigin = 'anonymous'
const node = this.ctx.createMediaElementSource(el)
node.connect(gain).connect(this.masterGain)
// gain 페이드는 기존 GainNode 로직 그대로 재사용 가능
```

- 장점: 의존성 0, 기존 `GainNode` 크로스페이드 코드를 거의 그대로 씀
- 단점: 요소 수명·`revoke` 관리를 직접 해야 하고, 실패 처리·풀링을 다시 짜야 함
- **주의:** `new Audio(` 를 쓰게 되므로 §4 검사 규칙에서
  `allowed: { 'src/audio/BgmManager.ts': 1 }` 로 예외를 열어야 한다

**C. 어느 안이든 함께 넣을 규칙 — CLAUDE.md `코드 규칙`에 추가**

```markdown
- 오디오는 **긴 BGM = 스트리밍, 짧은 SFX = 버퍼 + 보이스 풀**로 나눈다.
  60초 넘는 트랙을 `decodeAudioData`로 전량 디코딩하지 않는다
  (3분 스테레오 = 약 60MB PCM).
- 오디오 로드 실패는 격리한다. 트랙 하나가 막혀도 게임 진입이 막히면 안 된다.
- 반복 입력 효과음(hover 등)은 최소 간격 스로틀을 둔다.
```

**D. 부가 최적화 (선택)** — BGM 3곡 12.8MB는 최초 로딩 비용이기도 하다.
`preload: 'metadata'` 전환만으로 초기 다운로드가 크게 줄지만, 추가로 192kbps →
128kbps 또는 OGG/Opus 변환을 하면 파일당 **4.27MB → 약 1.8MB**가 된다.
브라우저 지원은 Opus가 넓다(Safari 17+ 포함).

---

## 6. 에셋 파이프라인

### little_token 방식

- `scripts/optimize-assets.ts` — PNG를 **용도별 프로파일**로 WebP 변환하고 원본 삭제

  ```ts
  function imageProfile(path: string): ImageProfile {
    if (rel.startsWith('backgrounds/'))    return { width: 1920, height: 1080, quality: 84 }
    if (rel.startsWith('sprites/skills/')) return { width: 512,  height: 768,  quality: 82 }
    if (rel.startsWith('sprites/token/'))  return { width: 900,  height: 900,  quality: 85 }
    return { width: 720, height: 720, quality: 85 }
  }
  ```

- `--check` 모드가 **남은 PNG를 빌드 실패로** 처리 (`npm run assets:check`)
- `predev`/`prebuild`로 자동 실행 — 잊을 수 없다
- 3D는 GLB 임베디드 텍스처를 1K로 강제 (Unmelting은 2D라 해당 없음)
- `AGENTS.md`에 예외 정책 명문화:
  `기술적으로 PNG가 반드시 필요한 예외는 이 문서에 이유와 소비처를 먼저 기록하지 않는 한 추가하지 않는다.`
- **`.gitattributes`로 줄바꿈 고정** — 데이터 파일 CR 혼입으로 열이 사라진 사고 후 추가

### Unmelting 현재 상태 (실측)

```
src/assets 총 121MB
  ├─ sprites  266 × .webp   ← 이미 전량 WebP. 훌륭하다.
  ├─ audio      5 × .mp3    ← §5 참조
  └─ fonts      1 × .woff2
```

- WebP 전환은 **이미 끝나 있다.** 이식할 게 변환이 아니라 **회귀 방어**다.
- 큰 스프라이트: `eventboss_001` 1.5MB, `event_002` 1.5MB, `boss_001` 1.4MB,
  `hearth_bg_006` 1.3MB … 300KB 초과가 다수. 해상도/품질 상한 규칙이 없다.
- `.gitattributes` **없음** — 협업자가 Windows면 `.ts`/`.md`에 CRLF가 섞여
  diff 전체가 오염될 수 있다.

### 이식안

**A. `.gitattributes` 신설** (가장 싸고 즉시 이득)

```gitattributes
# 소스·문서는 LF로 통일해 diff에 줄바꿈 변경이 섞이지 않게 한다.
*.ts   text eol=lf
*.js   text eol=lf
*.json text eol=lf
*.css  text eol=lf
*.html text eol=lf
*.md   text eol=lf
*.yml  text eol=lf

# 바이너리 — 변환 금지.
*.webp binary
*.png  binary
*.mp3  binary
*.woff2 binary
```

**B. `scripts/check-assets.ts` — 변환기가 아니라 규격 검사기**

이미 전량 WebP이므로 little_token의 변환 스크립트를 그대로 옮길 필요는 없다.
필요한 건 "다시 나빠지지 않게 하는" 검사다.

```ts
/**
 * 에셋 규격 검사 — `npm run assets:check`.
 * 이미 전량 WebP이므로 변환이 아니라 회귀 방어가 목적이다.
 * 상한을 넘는 에셋은 sharp로 재인코딩하고 통과시키지 않는다.
 */
// 검사 항목:
//  1) src/assets 아래 런타임 PNG/JPG 가 남아 있으면 실패 (WebP만 허용)
//  2) 스프라이트 파일 크기 상한(예: 배경 1.2MB / 그 외 800KB) 초과 시 실패
//  3) 오디오: BGM 트랙이 스트리밍 규격(권장 128kbps 이하) 인지 경고
```

상한값은 현재 자산의 실측 분포를 보고 정하면 된다. 지금 최댓값이 1.5MB이니
"배경 1.2MB / 일반 800KB"로 잡으면 상위 몇 개만 재인코딩하면 통과한다.

**C. CLAUDE.md에 예외 정책 명문화**

```markdown
- `src/assets` 런타임 이미지는 WebP만 쓴다. PNG가 반드시 필요한 예외는 **이 문서에
  이유와 소비처를 먼저 적지 않는 한** 추가하지 않는다.
- 새 에셋을 추가한 작업은 `npm run assets:check` 결과를 함께 보고한다.
```

---

## 7. 밸런스 전수 검사 툴

### little_token 방식

`src/tools`에 검사용 헤드리스 툴 7종(총 약 2,300줄)을 두고 npm 스크립트로 노출한다.

| 명령 | 파일 | 하는 일 |
|---|---|---|
| `npm run sweep` | `sweep.ts` | **모든 문장 조합 전수 순회** → 피해 분포 + 불변식 INV-1~3 |
| `npm run check` | `check-tables.ts` | 슬롯 "중립 바닥" 보장(소프트락 원천 봉쇄), 등급 예산, 일러스트 연결, 문구 계약 |
| `npm run effects:check` | `combat-effects-check.ts` | 전투 효과 정합 |
| `npm run boss:sim` | `boss-sim.ts` | 전투 길이 + **패턴 발동 횟수** |
| `npm run run:sim` | `run-sim.ts` | 풀 런 시뮬레이션 |

설계에서 배울 점 세 가지:

1. **실게임과 같은 함수를 부른다.** `sweep.ts`는 `compile()`·`finalMultiplier()`를
   직접 호출한다 — 검사용 사본을 만들면 그 사본이 먼저 썩는다.
2. **불변식을 이름으로 출력한다.** 임계값이 아니라 성질을 검사한다.
   ```
   INV-1  전형(median)이 즉사 아님    INV-2  관용구 없이 p75 도달    INV-3  막다른 길 없음
   ```
3. **"수치만 큰 허수아비"를 잡는다.** `AGENTS.md`:
   `예고·소환·부위 파훼가 0에 가까우면 그 보스는 수치만 큰 허수아비다.`
   HP만 보는 게 아니라 **패턴이 실제로 몇 번 발동했는지**를 검사한다.
4. **생성 데이터는 손대지 않는다.** CSV가 원본, `src/data/generated`는 산출물.
   `npm run check`가 "1단계 카드의 조립 문구가 CSV 원문과 한 글자라도 다르면 실패"까지 강제한다.

### Unmelting 현재 상태

- `src/rl/EnaTrainingSimulation.ts`(2,520줄)가 이미 **헤드리스 100층 시뮬레이터**다.
  little_token의 `run-sim.ts`에 해당하는 것을 이미 갖고 있다.
- 테스트 38종에 `EventSpawn.sim.test.ts`·`BossGimmickManager.test.ts` 등
  시스템 단위 검증이 있다.
- 다만 **밸런스 분포를 사람이 읽는 형태로 뽑아 주는 CLI가 없다.** 시뮬레이터는
  에나 학습용이고, "이 보스 패턴이 몇 번 발동했나"를 묻는 도구는 아니다.
- CLAUDE.md에 "`damageProfile`은 HandSystem 실제 공식의 **보수 근사**이므로 공식
  변경 시 함께 갱신한다"는 규칙이 있다 — **손으로 지켜야 하는 이중 출처**다.
  little_token이라면 여기에 검사를 붙였을 지점이다.

### 이식안

이건 공수가 크므로 **가장 값이 큰 하나만** 먼저 한다.

**A. `damageProfile` 정합 테스트 (최우선)**

```ts
// src/systems/DamageProfile.contract.test.ts
// CLAUDE.md 규칙: damageProfile 은 HandSystem 실제 공식의 보수 근사다.
// 사람이 기억해서 지키는 대신 테스트로 강제한다.
describe('damageProfile 계약', () => {
  it('공격 손패의 damageProfile 이 HandSystem 실제 피해와 허용 오차 안에 있다', () => {
    // 공격 태그 손패 전량 × 대표 공격력 구간을 돌며
    // floor(atkMult × atk) + flat  vs  HandSystem 실제 계산 결과를 비교
  })
  it('공격 손패에 damageProfile 이 빠지지 않는다', () => { /* … */ })
})
```

이게 있으면 CLAUDE.md의 "함께 갱신한다"는 부탁이 **강제**가 된다.
에나 판단(`HandCardAdvisor`)과 RL 시뮬이 통째로 이 근사에 의존하므로,
어긋나면 학습이 조용히 틀린 값을 배운다.

**B. `npm run balance` — 분포 리포트 CLI (다음 단계)**

`EnaTrainingSimulation`을 재사용해 N회 런을 돌리고 사람이 읽는 요약을 찍는다.

```
층 도달 분포   p25 34F / med 51F / p75 72F / max 100F
보스 격파율    30F 84% · 60F 51% · 90F 22% · 100F 7%
보스 패턴 발동  양초백작 기믹칸 명중 4.2회/전투 · 기사단장 손패 2.8회/전투
불씨 고갈       평균 3.1회/런 · extinguished 체류 6.4턴
INV-1  중앙값 런이 30F 보스를 만난다              통과
INV-2  100F 클리어율이 0이 아니다                 통과
INV-3  어떤 층에서도 손패 0장 소프트락이 없다      통과
```

`boss-sim`에서 배울 핵심은 마지막 세 줄이다 — **임계값이 아니라 성질을 이름으로
검사하고 통과/위반을 찍는 것.** 임계값만 찍으면 아무도 안 읽는다.

**C. 단일 출처 규칙 명문화 — CLAUDE.md `코드 규칙`에 추가**

```markdown
- 같은 수치가 두 곳에 있으면 한쪽을 **단일 출처**로 정하고 나머지는 import 한다.
  근사가 불가피하면(예: `damageProfile` ↔ `HandSystem`) **정합 테스트를 함께 둔다.**
  "함께 갱신한다"는 문서 약속만으로는 지켜지지 않는다.
```

---

## 8. 이식하지 말 것

little_token 쪽이 오히려 뒤처지거나 Unmelting과 안 맞는 것들이다.

| 항목 | 이유 |
|---|---|
| 테스트 없는 구조 | little_token엔 테스트 프레임워크가 없다. Unmelting의 vitest 38종이 명백히 낫다. |
| annotated tag 규칙 | 문서에만 있고 실제 태그 0개. 자동화 없이는 죽는 규칙이다. |
| `v_x.x.x - 요약` 커밋 제목 | Unmelting의 Conventional Commits가 도구 호환성이 낫다. **이력을 VERSION.md에 모은다**는 핵심만 가져온다. |
| 데스크톱 전용 UI 정책 | little_token은 데스크톱 한정. Unmelting은 모바일(≤700px) 대응이 이미 구현돼 있다. |
| CSV → 코드 생성 파이프라인 | Unmelting의 데이터는 TS 테이블이고 `synergyTags` 등 타입 안전성 이득이 크다. 굳이 CSV로 내릴 이유가 없다. |
| ESLint/Prettier 없음 | little_token엔 둘 다 없다. Unmelting은 이미 갖췄다 — CI에 붙이기만 하면 된다. |

---

## 9. 실행 체크리스트

**1주차 — 즉시 이득 (약 5시간)**

- [ ] `package.json`: `test` → `vitest run`, `test:watch` 분리, `verify` 스크립트 추가 (§3-A)
- [ ] `npm i -D tsx`
- [ ] `.github/workflows/deploy.yml` 교체 — verify/deploy 분리, `claude/**` 트리거 (§3-B)
- [ ] `.gitignore`: `.claude/` → `.claude/settings.local.json`, `docs/` 제거 (§3-C)
- [ ] `.gitattributes` 신설 (§6-A)
- [ ] `VERSION.md` 신설, 현재 버전 기록 시작 (§2-A)

**2주차 — 렉/메모리 (약 3시간)**

- [ ] `npm i howler @types/howler`
- [ ] `BgmManager` → Howl `html5: true` 스트리밍 전환 (§5-A) — 상주 ~120MB 회수
- [ ] 크로스페이드를 `Howl.fade()` + 타이머로 재구성, 실제 곡 전환 청감 확인
- [ ] BGM 비트레이트 128kbps 또는 Opus 검토 (§5-D)

**3주차 — 규율 자동화 (약 4시간)**

- [ ] `src/tools/resource-lifecycle-check.ts` 신설, `verify`에 편입 (§4-A)
- [ ] `.cloneNode` 7건 사용처 확인 → 소유 파일 확정 후 규칙 추가
- [ ] `localStorage` 직접 접근 규칙 추가 — `/리셋` 누락 방지 (§4-C)
- [ ] `damageProfile` 정합 테스트 (§7-A)

**4주차 — 문서 재구성 (약 3시간, 가장 큰 지속 이득)**

- [ ] `CLAUDE.md` L131~200 패치노트 → `VERSION.md` 이관
- [ ] `구현 우선 사실` 절 해체 → `시스템 불변식` 단문화 (§1-C)
- [ ] 중복 절 3쌍 병합 (`코드 규칙`+`코드 작성 규칙`, `UI/UX 규칙`+무제목 UI 항목, `문서 규칙`+`기획 기준`)
- [ ] `문서 규칙` 4줄 교체 (§1-D)
- [ ] 목표: **43.8KB → 12KB 이하**

**언제든**

- [ ] `scripts/check-assets.ts` — 에셋 규격 회귀 방어 (§6-B)
- [ ] `npm run balance` — 밸런스 분포 리포트 CLI (§7-B)
