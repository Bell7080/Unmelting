# 개발 환경 업그레이드 — 남은 작업

`Yeop-Git/little_token`(2026 넥슨 재밌넥 최우수상)의 개발 규율을 조사해 Unmelting에
이식하는 작업 지시서다. **완료된 항목은 이 문서에서 지우고 결과 규칙만 `CLAUDE.md`로
옮긴다.** 여기에 패치노트를 쌓지 않는다(완료 내역은 `VERSION.md` v0.2.0 참조).

- 조사 기준: little_token `19c93ad`(v_0.5.58) · Unmelting `da93d1d`

---

## 완료 (v0.2.0)

문서 분할 · BGM 스트리밍 전환 · 검증 게이트 · CI 분리 · 리소스 수명주기 검사 ·
버전 규칙 · `.gitattributes` · `.gitignore` 정리. 상세는 `VERSION.md`.

**남은 검증 하나:** BGM 크로스페이드는 코드 수준으로만 확인했다. 실제 곡 전환
청감(3분 지점에서 다음 곡이 자연스럽게 겹치는지)은 사람이 한 번 들어 봐야 한다.

---

## 1. 에셋 규격 회귀 방어

### little_token 방식

`scripts/optimize-assets.ts`가 PNG를 **용도별 프로파일**로 WebP 변환하고 원본을 지운다.

```ts
if (rel.startsWith('backgrounds/'))    return { width: 1920, height: 1080, quality: 84 }
if (rel.startsWith('sprites/skills/')) return { width: 512,  height: 768,  quality: 82 }
return { width: 720, height: 720, quality: 85 }
```

`--check` 모드가 남은 PNG를 빌드 실패로 처리하고(`npm run assets:check`),
`predev`/`prebuild` npm 라이프사이클로 자동 실행돼 **잊을 수가 없다.**
`AGENTS.md`에 예외 정책도 명문화돼 있다:
`PNG가 반드시 필요한 예외는 이 문서에 이유와 소비처를 먼저 기록하지 않는 한 추가하지 않는다.`

### Unmelting 현재 상태 (실측)

```
src/assets 총 121MB
  ├─ sprites  266 × .webp   ← 이미 전량 WebP
  ├─ audio      5 × .mp3
  └─ fonts      1 × .woff2
```

WebP 전환은 **이미 끝나 있다.** 필요한 건 변환기가 아니라 **회귀 방어**다.
큰 스프라이트가 상한 없이 늘고 있다: `eventboss_001` 1.5MB · `event_002` 1.5MB ·
`boss_001` 1.4MB · `hearth_bg_006` 1.3MB … 300KB 초과가 다수다.

### 할 일

**A. `scripts/check-assets.ts` 신설** — `npm run assets:check`

```
1) src/assets 아래 런타임 PNG/JPG 가 남아 있으면 실패 (WebP만 허용)
2) 파일 크기 상한 초과 시 실패 — 현재 분포 기준 배경 1.2MB / 그 외 800KB 제안
   (지금 최댓값이 1.5MB이니 상위 몇 개만 재인코딩하면 통과한다)
3) BGM 트랙이 스트리밍 규격(권장 128kbps 이하)인지 경고
```

`sharp`가 필요하다(`npm i -D sharp`). `verify` 체인에 편입한다.

**B. `CLAUDE.md` 코드 규칙에 예외 정책 추가**

```markdown
- `src/assets` 런타임 이미지는 WebP만 쓴다. PNG가 반드시 필요한 예외는 이 문서에
  이유와 소비처를 먼저 적지 않는 한 추가하지 않는다.
```

**C. BGM 용량 (선택)** — 3곡 12.8MB는 최초 다운로드 비용이다. `preload: 'metadata'`
전환으로 초기 다운로드는 이미 크게 줄었지만, 192kbps → 128kbps 또는 Opus 변환을
하면 파일당 **4.27MB → 약 1.8MB**가 된다(Opus는 Safari 17+ 포함 지원이 넓다).

---

## 2. 밸런스 전수 검사 툴

### little_token 방식

`src/tools`에 헤드리스 검사 툴 7종(약 2,300줄)을 두고 npm 스크립트로 노출한다.

| 명령 | 하는 일 |
|---|---|
| `npm run sweep` | 모든 문장 조합 전수 순회 → 피해 분포 + 불변식 INV-1~3 |
| `npm run check` | 슬롯 "중립 바닥" 보장(소프트락 원천 봉쇄), 등급 예산, 문구 계약 |
| `npm run boss:sim` | 전투 길이 + **패턴 발동 횟수** |
| `npm run run:sim` | 풀 런 시뮬레이션 |

배울 점 넷:

1. **실게임과 같은 함수를 부른다.** `sweep.ts`는 `compile()`·`finalMultiplier()`를
   직접 호출한다 — 검사용 사본을 만들면 그 사본이 먼저 썩는다.
2. **불변식을 이름으로 출력한다.** 임계값이 아니라 성질을 검사한다.
   `INV-1 전형(median)이 즉사 아님` / `INV-3 막다른 길 없음`
3. **"수치만 큰 허수아비"를 잡는다.** HP만 보는 게 아니라 패턴이 실제로 몇 번
   발동했는지를 센다. `예고·소환·부위 파훼가 0에 가까우면 그 보스는 수치만 큰 허수아비다.`
4. 근사가 있는 곳엔 정합 검사를 붙인다.

### Unmelting 현재 상태

`src/rl/EnaTrainingSimulation.ts`(2,520줄)가 이미 헤드리스 100층 시뮬레이터다 —
`run-sim.ts`에 해당하는 것을 이미 갖고 있다. 없는 것은 **밸런스 분포를 사람이 읽는
형태로 뽑아 주는 CLI**와, `damageProfile` 같은 이중 출처의 **정합 검사**다.

### 할 일

**A. `damageProfile` 정합 테스트 (최우선)**

`CLAUDE.md`는 "`damageProfile`은 `HandSystem` 실제 공식의 보수 근사이므로 공식 변경 시
함께 갱신한다"고 적고 있다. 지금은 사람이 기억해서 지켜야 한다. 에나 판단
(`HandCardAdvisor`)과 RL 시뮬이 통째로 이 근사에 의존하므로, 어긋나면 **학습이 조용히
틀린 값을 배운다.**

```ts
// src/systems/DamageProfile.contract.test.ts
describe('damageProfile 계약', () => {
  it('공격 손패의 damageProfile 이 HandSystem 실제 피해와 허용 오차 안에 있다', () => {
    // 공격 태그 손패 전량 × 대표 공격력 구간을 돌며
    // floor(atkMult × atk) + flat  vs  HandSystem 실제 계산 결과 비교
  })
  it('공격 손패에 damageProfile 이 빠지지 않는다', () => { /* … */ })
})
```

**B. `npm run balance` — 분포 리포트 CLI**

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

핵심은 마지막 세 줄이다 — **임계값이 아니라 성질을 이름으로 검사하고 통과/위반을
찍는 것.** 임계값만 찍으면 아무도 안 읽는다.

---

## 3. 리소스 검사 규칙 확장

`src/tools/resource-lifecycle-check.ts`에 Unmelting 고유 약속을 더 넣을 수 있다.

```ts
{ label: 'z-index 극단값(5자리 이상)을 새로 만들지 않습니다',
  pattern: /z-index:\s*\d{5,}/g,
  allowed: { /* 말풍선 9999 · 클러치 배너 9998 · 도감 10500 소유 파일 */ } },

{ label: 'localStorage 직접 접근 대신 저장 헬퍼를 사용합니다',
  pattern: /localStorage\.(get|set|remove)Item/g,
  allowed: { /* 저장 키 소유 파일들 */ } },
```

두 번째가 특히 값이 크다. `CLAUDE.md`의 `/리셋` 규칙(`unmelting.` 접두사 전량 삭제)은
**새 저장 키가 접두사 없이 추가되면 조용히 깨진다.** 지금 그걸 잡아 주는 장치가 없다.

---

## 이식하지 말 것

little_token 쪽이 오히려 뒤처지거나 Unmelting과 안 맞는 것들이다.

| 항목 | 이유 |
|---|---|
| 테스트 없는 구조 | little_token엔 테스트 프레임워크가 없다. Unmelting의 vitest 38종 329개가 명백히 낫다. |
| annotated tag 규칙 | `AGENTS.md`에 규정돼 있지만 저장소의 실제 태그는 **0개**다. 자동화 없이 손으로 지키는 규칙은 죽는다. |
| `v_x.x.x - 요약` 커밋 제목 | Unmelting의 Conventional Commits가 도구 호환성이 낫다. **이력을 `VERSION.md`에 모은다**는 핵심만 가져왔다. |
| 데스크톱 전용 UI 정책 | little_token은 데스크톱 한정. Unmelting은 모바일(≤700px) 대응이 이미 구현돼 있다. |
| CSV → 코드 생성 파이프라인 | Unmelting의 데이터는 TS 테이블이고 `synergyTags` 등 타입 안전성 이득이 크다. CSV로 내릴 이유가 없다. |
| ESLint/Prettier 없음 | little_token엔 둘 다 없다. Unmelting은 이미 갖췄고 이제 CI 게이트에 붙었다. |
