# CLAUDE.md

Unmelting 작업용 최소 컨텍스트. 오래된 아이디어보다 **현재 구현**을 우선한다.

## 프로젝트 한 줄
- 3레인 × 3행 필드에서 카드가 매 턴 전진하고, 플레이어는 `녹지 않는 소녀` 한 장과 손패/조합/유물로 위험과 보상을 처리하는 카드 레인 로그라이트.
- 톤: 따뜻한 촛불 + 낡은 종이 + 어두운 남보라/먹색의 몽글몽글 다크판타지.

## 실행/검증
```bash
npm install
npm run dev
npm run type-check
npm run test
npm run build
```
- 배포 타깃은 Vite `dist`.
- 시각 변경이 크면 브라우저 확인/스크린샷을 남긴다.

## 현재 구조
```text
src/index.ts                 # 런타임 조립, 턴 흐름, 점수/화폐/상점, 이벤트 핸들링
src/core/GameState.ts         # 중앙 상태, 레인 압축/리필, 턴 카운트
src/core/TurnManager.ts       # 적/폭탄/보물 변이/불씨 턴 처리
src/entities/                # Card, Character, Lane, HandCard 모델
src/systems/                 # Action, CardSpawner, Drop, Ember, Hand 시스템
src/data/                    # 손패/유물/조합 정의
src/ui/GameBoardRenderer.ts  # DOM 렌더링, CSS, 상호작용, 대부분의 UI 애니메이션
src/ui/SquareBurst.ts        # 사각 파티클 버스트
src/ui/Icons.ts              # 플랫 inline-SVG 아이콘
src/ui/Sprites.ts            # webp 스프라이트 매핑
src/assets/                  # 폰트/스프라이트
```

## 구현된 핵심 시스템
- 필드: 3레인 × 3행. 전방 행만 직접 클릭 처리, 같은 전방 카드 그룹화.
- 턴: 플레이어 행동 → 이벤트/적/폭탄/보물 변이 → 불씨 감소/리필/그룹화. 낮은 불씨 단계에서는 적 선공.
- 손패: 드롭, 자동 3장 병합, 타깃형/즉발형 효과, 체인 타임라인, 조합 발동, 촛불 게이지.
- 점수/화폐: 좌측 패널에 종합 점수와 상점 화폐 표시. 증가 시 숫자 카운트업 + `✦ ✧ ✦` 반짝임 + SquareBurst가 같은 타이밍에 재생되어야 한다.
- 상점/유물: 10턴마다 레일 셔터 후 유물 상점. 구매 비용은 종합 점수, 일부 유물은 즉시 능력치/부활/패시브 효과.
- 도감: 적/함정/보물/손패/조합/유물/용어 탭. 실제 데이터 정의를 요약 표시한다.

## UI/UX 규칙
- 기존 촛불/밀랍/낡은 카드 테마를 유지한다. 새 UI는 `GameBoardRenderer.ts`의 색/테두리/그림자/스크롤바 양식을 먼저 참고한다.
- 폰트는 `FontManager`와 OkDanDan을 사용하고 최소 12px 원칙을 깨지 않는다.
- 이모지 아이콘을 새로 넣지 않는다. 도감/검/하트/코인/상점 보석처럼 **`src/ui/Icons.ts`의 플랫 inline-SVG path 아이콘**을 사용하거나 같은 방식(`currentColor`, 단색 fill/stroke, 작은 크기 가독성)으로 추가한다.
- 점수/화폐/피해/회복 등 즉각 피드백은 효과와 수치 변화가 분리되어 보이지 않게 같은 beat 안에서 처리한다.

## 코드 작성 규칙
- TypeScript만 사용한다. import 주위에 try/catch를 두지 않는다.
- 새 코드에는 다음 작업자가 의도를 알 수 있는 짧은 주석을 남긴다. 단, 자명한 문법 설명은 피한다.
- 상태 변경은 가능한 한 시스템/엔티티에 두고, 렌더러는 표시/애니메이션 책임을 유지한다.
- 테스트용 시드, 더미 UI, 완료된 과거 실험 코드는 남기지 않는다. 발견 시 제거하거나 최종 보고에 명시한다.

## 기획 기준
- `Unmelting_Game_Concept.md`는 원형 기획서다. 구현 판단은 이 파일의 현재 구조/규칙과 실제 코드가 우선한다.
- 문서 갱신 시 긴 일자별 패치노트보다 “현재 사실/규칙/주의점”만 남긴다.
