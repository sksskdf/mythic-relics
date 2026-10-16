# 프로젝트 안내 (Claude용)

신화 유물을 모아 장착하면 그 신의 힘이 클래스로 발현되는 쿼터뷰 핵앤슬래시 액션 RPG. 지금은 프로토타입을 끝내고 단계 2(게임다운 빌드로 키우기)에 들어가는 시점이다.

## 대화 규칙

- **사용자에게는 항상 한국어로 답한다.** 작업 중 짧은 알림도 한국어로 쓴다.
- 작업 과정을 길게 중계하지 않는다. 결과와 판단, 사용자가 확인할 것만 말한다.
- 최종 답과 문서는 어색한 번역 투 없이 자연스러운 한국어로 다듬는다.
- 큰 방향은 사용자가 정한다. 사용자가 "추천대로"라고 하면 추천안으로 진행하고 무엇을 골랐는지 알린다.

## 문서 (작업 전에 관련 문서를 먼저 읽는다)

| 문서 | 내용 |
| --- | --- |
| `ROADMAP.md` | 전체 로드맵. **0.2 "지금 할 일"과 4.2 마일스톤(E1~E10)이 현재 작업 기준** |
| `DESIGN.md` | 기획 전체 (핵심 원칙, 조작, 성장, 엔드게임 구조) |
| `CLASSES.md` | 신화권 10개, 클래스 40개, 상위·히든 클래스, 칭호 |
| `ENDGAME.md` | 전설 목록, 종말 보스, 권능, 공명, 변형 |
| `PROTOTYPE.md` | 프로토타입(M0~M6) 계획과 구현 기록 |
| `PLAYTEST.md` | 자동 플레이 검증 결과, 사람이 해 본 의견과 조치 |
| `BALANCE.md` | 전투·성장 사양서 (피해 공식, 유물·적 수치, 경험치 곡선, 드랍) |

## 핵심 원칙 (어기면 안 됨)

1. **조작 최소화:** 플레이어가 직접 하는 일은 클릭뿐이다. 땅 한 번 = 이동(가다가 적을 만나면 싸움), 땅 두 번 = 적을 무시하고 이동, 적 = 공격 대상 지정. 공격·스킬·궁극기는 자동. 버튼을 늘리지 않는다.
2. **텍스트 최소화:** 전투 화면에는 글을 거의 두지 않는다. 정보 화면에서는 짧은 설명을 허용한다(E4에서 문서화 예정).
3. **2D처럼 보이는 3D:** 낮은 해상도 렌더 + 셀 셰이딩 + 외곽선, 코드로 만드는 복셀 모델.

## 기술과 명령

- Three.js + TypeScript + Vite, 테스트는 Vitest와 Playwright(브라우저 스모크).
- 사용자는 pnpm을 쓴다. `pnpm dev` = Vite 개발 서버 + Electron 창(`scripts/dev-electron.mjs`, `electron/main.cjs`), `pnpm dev:web` = 브라우저.
- 이 환경에서 Electron 확인: `ELECTRON_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader" ELECTRON_SHOT=test-results/electron.png xvfb-run -a node scripts/dev-electron.mjs` (8초 뒤 창을 찍고 닫힘)
- `npm run check`: 타입 검사 + 빌드(데이터 검사 포함) + 단위 테스트 + 스모크. **커밋 전에 반드시 통과시킨다.** 같은 검사와 봇 1판이 GitHub Actions(`.github/workflows/ci.yml`)에서도 돈다.
- `npm run build && npm run playtest [횟수] [제한 분]`: 이동만 쓰는 봇이 처음부터 승급까지 플레이하고 시간·피격 등을 기록한다 (`test-results/playtest.json`). 수치를 바꾸면 돌려 본다.
- `npm run build && node scripts/shot.mjs <파일.png> "<주소 뒤 값>" "<게임 안 코드>" [프레임]`: 원하는 상태의 스크린숏. 화면이 바뀌는 작업은 스크린숏을 직접 보고 확인한다.
- 개발 모드: `pnpm dev --dev`(또는 `pnpm dev:tools`), 브라우저는 `?dev`. 오른쪽 개발 패널(`src/dev/DevPanel.ts`)에서 유물·클래스·이동·적·전설·시간을 바꾼다. 새 시스템을 만들면 패널에도 시험 단추를 더한다.
- 점검용 주소: `?relics=all` / `?relics=mjolnir,megingjord` (유물 끼고 시작, 저장 안 함), `?fresh` (저장 지우고 시작), `?view=` (시야 높이), `?autoplay` (봇).
- 이 환경의 브라우저는 소프트웨어 렌더링이라 초당 몇 프레임밖에 안 나온다. 실제 속도의 느낌은 사용자에게 확인을 부탁한다.
- 브라우저 실행 경로: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (swiftshader 옵션은 스크립트에 있음).

## 코드 지도

| 폴더 | 내용 |
| --- | --- |
| `src/data/` | **게임 데이터**: `relics.json`(유물), `gods.json`(신·클래스), `enemies.json`(적), `schema.ts`(형식과 검사). 숫자는 여기서 고친다 |
| `src/game/` | `Game.ts`(조립, 메인 루프), `events.ts`(이벤트 버스), `context.ts`(시스템 공용 상태), `Stage`(빛·맵), `HeroController`(이동), `HeroOrders`(클릭 → 지시), `PlayerCombat`(자동 공격), `Encounter`(적 무리·보스), `Legend`(승급 전설), `RelicPowers`(장착한 유물 효과) |
| `src/game/systems/` | 규칙: `Damage`(피해), `Relics`(줍기·장착·발현), `Progression`(경험치·드랍·승급), `HeroLife`(쓰러짐·부활), `Persistence`(저장), `PlayerInput`(클릭), `Effects`(연출). 시스템끼리는 버스로만 주고받는다 |
| `src/enemies/` | 거인 AI(`Giant.ts`: 상태, 공격 예고, 패턴)와 모델 |
| `src/skills/` | 유물 효과(`index.ts`: 데이터 → 효과), 행동·오라 종류(`actions.ts`), 궁극기 |
| `src/relics/` | 유물·신 데이터, 장착(발현·가호 판정), 드랍 규칙, 땅의 유물 |
| `src/progress/` | 클래스 레벨·경험치·친화도 |
| `src/save/` | 저장 형식과 검사 |
| `src/render/` | 픽셀 렌더러, 쿼터뷰 카메라, 화면 ↔ 월드 좌표, 실루엣 |
| `src/voxel/` | 복셀 격자, 메시 생성, 모델(`models/`) |
| `src/fx/`, `src/ui/` | 연출, HUD·시작 화면·피해 숫자 |
| `src/dev/` | 검증용 봇(`autoplay.ts`), 개발 패널(`DevPanel.ts`), 충돌·길찾기 보기(`DebugOverlay.ts`) |

## 작업 방식

- 마일스톤 작업은 `ROADMAP.md` 4.2의 표(ID, 목표, 자동 검증, 직접 플레이 체크리스트, 완료 기준)를 따른다. 끝나면 완료 기준을 확인하고 문서에 기록한다.
- 로드맵 패널(모드)은 `ROADMAP.md`를 직접 읽어 계획 탭에 보여 준다. 문서를 고치면 패널도 바뀐다. 할 일 목록 항목 이름을 `E1 ...`처럼 마일스톤 ID로 시작하게 두면 계획 탭의 마일스톤에 상태(○ ▶ ✓)가 붙는다. 상태는 MCP `roadmap` 도구로 바꾼다.
- 코드 주석과 테스트 이름은 한국어. 주변 코드의 말투와 밀도를 따른다.
- 수치는 `src/data/*.json`에서 바꾸고, 바꾸면 `BALANCE.md`와 봇 결과(`PLAYTEST.md`)를 함께 고친다.
- 새 유물은 `relics.json`에 기존 종류(충전·터지는 때·하는 일)를 조합해 넣는다. 새로운 "하는 일"이 필요할 때만 `actions.ts`와 `schema.ts`의 ACTION_PARAMS에 더한다.
- 사람이 한 플레이 의견은 `PLAYTEST.md` 6장과 로드맵 해당 마일스톤에 반영한다.

## Git

- 작업 브랜치: `claude/epic-babbage-e33i2f`. `git push -u origin claude/epic-babbage-e33i2f`.
- 요청이 없으면 PR을 만들지 않는다.
- 커밋 메시지는 한국어, 마지막에 세션이 알려 주는 Co-Authored-By·Claude-Session 줄을 붙인다. 모델 이름은 코드·문서에 쓰지 않는다.
