# 프로젝트 안내 (Claude용)

신화 몬스터를 사냥해 장비와 유물을 모으고, 신화를 개방해 그 신의 힘을 쌓아 가는 쿼터뷰 핵앤슬래시 액션 RPG. 1차 스프린트(E1~E9)를 끝내고 2차 스프린트(E11~E18: 신화 개방·장비·위협 단계·균열)의 작업을 마쳐, 사람의 직접 플레이 확인을 기다린다.

**용어 (2차 스프린트):** 클래스 → 신화, 발현 → 신화 개방, 클래스 레벨 → 개방 단계, 승급 전설 → 전설, 유물 칸 → 장비 칸. 화면 글·문서는 새 이름을 쓰고, 코드 이름(`class`, `manifested`, `Loadout`, `promote`)은 E11-05·E12~E13에서 `myth/`·`gear/`로 옮기며 바꾼다. 자세한 것은 `docs/knowledge/glossary.md`.

## 대화 규칙

- **사용자에게는 항상 한국어로 답한다.** 작업 중 짧은 알림도 한국어로 쓴다.
- 작업 과정을 길게 중계하지 않는다. 결과와 판단, 사용자가 확인할 것만 말한다.
- 최종 답과 문서는 어색한 번역 투 없이 자연스러운 한국어로 다듬는다.
- 큰 방향은 사용자가 정한다. 사용자가 "추천대로"라고 하면 추천안으로 진행하고 무엇을 골랐는지 알린다.

## 이어받기

- **세션을 시작하면 `docs/knowledge/handoff.md`부터 읽는다.** 지금 상태·다음 할 일·사용자에게 받아야 할 것이 있다. 지식 저장소 목록은 `docs/knowledge/README.md`.
- 일을 한 덩어리 끝낼 때마다 `handoff.md`를 고치고, 사용자와 새로 정한 것은 `decisions.md`, 막혔다 풀린 것은 `troubleshooting.md`·`environment.md`에 더한다.

## 문서 (작업 전에 관련 문서를 먼저 읽는다)

| 문서 | 내용 |
| --- | --- |
| `ROADMAP.md` | 로드맵: 지금 할 일만 (2차 스프린트 E11~E18, 끝난 기록은 git). 마일스톤 → 이슈(`E11-01`) → 작업 단위(`E11-01-1`). **0.2 "지금 할 일"과 2장 마일스톤이 현재 작업 기준** |
| `REDESIGN.md` | 2차 스프린트 기획 개편안의 논의 기록 (선택지·사용자 의견·Revolution Idle 조사). 내용은 E11에서 `DESIGN.md`로 옮겼다 |
| `DESIGN.md` | 기획 전체 v2.0 (핵심 원칙, 조작, 신화 개방·장비·유물 제작, 원천 각성, 위협 단계·시련·균열·성좌판, 대화 장면). 장마다 "지금 게임" 칸은 1차 스프린트 구현 |
| `CLASSES.md` | 신화권 10개, 신화(옛 클래스) 40개, 상위·히든 신화, 칭호 |
| `ENDGAME.md` | 전설 목록, 종말 보스, 권능 (연대기·두루마리는 2차 스프린트에서 없앰) |
| `PROTOTYPE.md` | 프로토타입(M0~M6) 계획과 구현 기록 |
| `PLAYTEST.md` | 자동 플레이 검증 결과, 사람이 해 본 의견과 조치 |
| `BALANCE.md` | 전투·성장 사양서 (피해 공식, 유물·적 수치, 경험치 곡선, 드랍) |
| `ART.md` | 아트 스타일 가이드 (화면·팔레트·복셀 규격·실루엣·연출 언어·성능 기준) |
| `docs/knowledge/` | 지식 저장소: 인수인계(`handoff`), 작업 흐름, 결정 기록, 환경 제약, 구조 요약, 기준 수치, 문제 해결, 지난 마일스톤, 용어 |

## 핵심 원칙 (어기면 안 됨)

1. **조작 최소화:** 플레이어가 직접 하는 일은 클릭뿐이다. 땅 = 그곳까지 이동(싸우던 중이어도 빠져나감, 걷는 동안은 싸우지 않음), 적 = 그 적을 자동 공격, 멈춰 서면 둘레 적을 자동 공격. 두 번 클릭은 없다(E12-08). 공격·스킬·궁극기는 자동. 버튼을 늘리지 않는다.
2. **텍스트 최소화:** 전투 화면에는 글을 거의 두지 않는다. 설명 카드와 정보 화면에서는 짧은 설명을 허용한다(`DESIGN.md` 2.1).
3. **2D처럼 보이는 3D:** 낮은 해상도 렌더 + 셀 셰이딩 + 외곽선, 코드로 만드는 복셀 모델.
4. **UI는 디자인 시스템으로:** 색·글꼴·간격은 `src/ui/theme.css`의 토큰(`--c-*`, `--t-*`, `--sp-*`)만 쓴다. 글꼴은 갈무리 픽셀 글꼴을 정해진 크기(10/12/15px와 그 배수)로만 쓴다. (`DESIGN.md` 10.5)

## 기술과 명령

- Three.js + TypeScript + Vite, 테스트는 Vitest와 Playwright(브라우저 스모크).
- 사용자는 pnpm을 쓴다. `pnpm dev` = Vite 개발 서버 + Electron 창(`scripts/dev-electron.mjs`, `electron/main.cjs`), `pnpm dev:web` = 브라우저.
- 이 환경에서 Electron 확인: `ELECTRON_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader" ELECTRON_SHOT=test-results/electron.png xvfb-run -a node scripts/dev-electron.mjs` (8초 뒤 창을 찍고 닫힘)
- `npm run check`: 타입 검사 + 빌드(데이터 검사 포함) + 단위 테스트 + 스모크. **커밋 전에 반드시 통과시킨다.** 같은 검사와 봇 1판이 GitHub Actions(`.github/workflows/ci.yml`)에서도 돈다.
- `npm run build && npm run playtest [횟수] [제한 분]`: 이동만 쓰는 봇이 처음부터 2단계까지 플레이하고 첫 신화·신화 둘·2단계 시간과 피격 등을 기록한다 (`test-results/playtest.json`). 수치를 바꾸면 돌려 본다. `--threat=N`을 붙이면 2단계 뒤에도 지역 보스를 잡고 위협 단계를 올리며 N단계까지 단계마다 시간·쓰러짐·피격을 잰다 (`--source=stone`이면 원천 갈래를 그 원천에만). `--trials --relics=mjolnir --god=thor --region=midgard`이면 위협 3단계·토르 2단계로 시작해 시련 1단계 여덟을 차례로 깬다 (E16). `--rift --relics=mjolnir`이면 한계를 깬 채 엔드게임 빌드(`game.dev.endgame()`)로 마을에서 균열에 들어가 10층까지 층마다 시간을 잰다 (E17).
- `npm run build && node scripts/source-trial.mjs [판 수=2] [분=3]`: 토르(묠니르)를 고른 채 원천 하나를 각성 3단계로 몰고 미드가르드에서 1분당 처치·피격을 재, 원천 넷이 평균 ±25% 안인지 본다 (`test-results/source-trial.json`). 각성 수치를 바꾸면 돌려 본다. playtest와 같은 포트라 동시에 돌리지 않는다.
- `npm run build && node scripts/myth-trial.mjs [판 수=2] [분=3] [신 id,...]`: 신화마다 자기 유물을 끼고 그 신화를 고른 채 1분당 처치 수를 재고 중앙값 ±20%를 본다 (`test-results/myth-trial.json`, 21신화에 40분쯤). 신화·유물 수치를 바꾸면 돌려 본다. `npm run playtest`와 같은 포트를 쓰니 동시에 돌리지 않는다.
- `npm run build && node scripts/enemy-trial.mjs [유물 묶음 ...]`: 봇이 클래스 셋(기본: 토르·아르테미스·아마테라스)으로 적마다 따로 싸워 역할별 피격 수·처치 시간과 지역 보스 다섯을 잰다 (`test-results/enemy-trial.json`). 적 수치를 바꾸면 돌려 본다.
- `npm run build && node scripts/bench.mjs [적 수=40] [화질=normal|low|high]`: 적에 둘러싸인 싸움의 게임 갱신 시간·그리기 호출·삼각형 수 (`test-results/bench.json`). 모델·맵·연출을 바꾸면 재 본다. 이 환경은 소프트웨어 렌더링이라 fps는 사용자에게 확인을 부탁한다 (개발 패널 오른쪽 위에 fps).
- `npm run build && node scripts/enemy-sheet.mjs [파일.png] [적 id,...]`: 모든 적을 보통·정예로 세운 모습 모음. 적 모델을 바꾸면 찍어 본다.
- `npm run build && node scripts/class-sheet.mjs [파일.png] [신 id,...]`: 모든 클래스를 자기 유물로 발현시킨 Lv1·Lv4 모습 모음. 클래스·외형을 바꾸면 찍어 본다.
- `npm run build && node scripts/motion-sheet.mjs [파일.png] [신 id,...]`: 신화마다 1타·2타·마지막 타·유물 행동·궁극기를 게임을 멈춘 채 찍어 신화권별로 모은다 (E18). 동작·유물 행동·궁극기를 바꾸면 찍어 보고, 겹치지 않는지는 `tests/identity.test.ts`와 `ART.md` 9장.
- `npm run build && node scripts/ui-sheet.mjs [폴더] [크기,...]`: 중반쯤 상태를 꾸며 정보 화면 탭 여덟과 HUD를 화면 크기마다 찍는다(기본 1280×720·960×540·390×844). UI를 바꾸면 찍어 보고, 좁은 화면에서 잘리는지 본다. 무작위는 씨앗 고정이라, `UI_DOM=1`을 붙이면 탭마다 DOM(`.html`)도 남겨 코드를 나누기 전후를 diff로 견줄 수 있다.
- `npm run build && node scripts/shot.mjs <파일.png> "<주소 뒤 값>" "<게임 안 코드>" [프레임]`: 원하는 상태의 스크린숏. 화면이 바뀌는 작업은 스크린숏을 직접 보고 확인한다.
- `node scripts/gen-regions.mjs`: 신화권마다 깊은 땅·보스의 땅을 규칙으로 다시 만든다(E15). 이미 있는 그 땅을 덮어쓰니 규칙을 바꿀 때만 돌린다.
- 지도는 개발 패널 「지도」 탭에서 고친다: 편집을 켜고 땅을 누르면 고른 도구가 동작하고, 「저장」은 개발 서버(`pnpm dev`)가 `src/data/regions.json`에 쓴다 (`vite.config.ts`의 saveRegions).
- 개발 모드: `pnpm dev --dev`(또는 `pnpm dev:tools`), 브라우저는 `?dev`. 오른쪽 개발 패널(`src/dev/DevPanel.ts`)에서 유물·신화·이동·적·전설·시간을 바꾼다. 새 시스템을 만들면 패널에도 시험 단추를 더한다.
- 점검용 주소: `?relics=all` / `?relics=mjolnir,megingjord` (유물 끼고 시작, 저장 안 함), `?fresh` (저장 지우고 시작), `?region=olympus` (그 지역에서 시작, 새로 시작하면 마을), `?quality=low` (화질, 저장 안 함), `?view=` (시야 높이), `?autoplay` (봇).
- 이 환경의 브라우저는 소프트웨어 렌더링이라 초당 몇 프레임밖에 안 나온다. 실제 속도의 느낌은 사용자에게 확인을 부탁한다.
- 브라우저 실행 경로: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` (swiftshader 옵션은 스크립트에 있음).

## 코드 지도

| 폴더 | 내용 |
| --- | --- |
| `src/data/` | **게임 데이터**: `relics.json`(유물), `gods.json`(신·클래스), `enemies.json`(적), `classes.json`(클래스 트리, `CLASSES.md`와 같아야 함), `schema.ts`(형식과 검사), `classKit.ts`(클래스 부품: 패시브·궁극기·전설 종류), `regions.json`·`regions.ts`(지역 16곳: 자리(입구·깊은 땅·보스)·시작점·성소·무리·보스·출구·소품, 검사와 저장 모양, 다음 이웃 `nextHop`·세계 지도 자리 `worldLayout`), `scenes.json`(대화 장면). 숫자는 여기서 고친다 |
| `src/game/` | `Game.ts`(조립과 메인 루프), `MenuData`(정보 화면에 보일 값·할 일, 능력치, 설명 카드 상태), `Storyline`(대화 장면을 여는 때·미루기·말 걸기), `AttackFx`(휘두른 궤적·원거리 공격 모습), `HoverCards`(커서 아래 카드·몬스터 이름표), `World`(지역 들어가기 `enter`·출구 이동 `travelTo`·암전, Game에도 같은 이름의 위임이 있음), `TitleBackdrop`(시작 화면 뒤 장면), `Villagers`(마을 사람과 말풍선), `events.ts`(이벤트 버스), `context.ts`(시스템 공용 상태), `Stage`(빛·맵), `HeroController`(이동), `HeroOrders`(클릭 → 지시), `PlayerCombat`(자동 공격), `Encounter`(적 무리·보스), `Legend`(승급 전설), `RelicPowers`(장착한 유물 효과) |
| `src/game/systems/` | 규칙: `Damage`(피해), `Relics`(줍기·장착·발현), `Progression`(경험치·드랍·승급), `HeroLife`(쓰러짐·부활), `Persistence`(저장), `PlayerInput`(클릭), `Effects`(연출), `Sound`(소리), `Threat`(위협 단계·원천 갈래·편의 자동화 세기·한계를 깸), `Trials`(시련 진행: 제약·난이도·기록), `Rift`(균열: 층·축복·다음 층 문·끝). 시스템끼리는 버스로만 주고받는다 |
| `src/enemies/` | 적 AI(`Giant.ts`: 상태, 공격 예고, 돌진·던지기·막기·부르기·거리 유지·둘러싸기), 날아가는 것(`Projectile.ts`), 정예(`elite.ts`), 모델 생성기(`enemyModel.ts`: 몸 종류 여섯, 거인은 `giantModel.ts`) |
| `src/skills/` | 유물 효과(`index.ts`: 데이터 → 효과), 행동·오라 종류(`actions.ts`), 행동의 모습(`actionLooks.ts`: 던지는 것·땅 울림 연출, E18), 궁극기(`Ultimate.ts`, 종류+모양) |
| `src/looks/` | 외형: 칸과 외형 목록(`catalog.ts`, 1차 클래스는 `classLooks.ts`), 장착 → 모습·보관함(`outfit.ts`), 일반 장비 외형(`gearLooks.ts`, 모델은 `src/voxel/models/gearLooks.ts`). 모델은 `src/voxel/models/looks.ts`(손으로 찍은 것)·`classLooks.ts`(생성기 `gen.ts`로 만든 것)·`mythWeapons.ts`(손으로 찍은 신화 무기), 적용은 `systems/Appearance.ts` |
| `src/relics/` | 유물·신 데이터(`data.ts`), 유물 모델·아이콘, 커서 아래 유물 고르기 |
| `src/gear/` | 장비(E13): 칸 7과 가방(`Loadout`), 일반 장비 굴리기(`roll`), 신화의 유물과 단계(`mythRelic`), 재료(`materials`), 대장간 제작법·분해(`forge`), 땅에 떨어진 것(`Pickups`), 드랍 규칙(`DropTable`) |
| `src/myth/` | 신화(E11-05): 신화 판정(`manifest.ts`, 지금은 유물 수로 발현·가호), 개방 단계·경험치·원천 숙련(`ClassProgress`), 단계별로 얻는 것(`levelGains`). E12에서 영구 개방·상시·추가 효과가 여기 들어온다 |
| `src/build/` | 빌드 상태(E11-04): 열린 신화·고른 신화·장비·원천 → 피해 배율·지속 효과·공격 리듬(`BuildState.ts`의 `computeBuild`, 게임 안에서는 `ctx.build`) |
| `src/progress/` | 바깥 성장(E14): 위협 단계·원천 숙련·전투 경험(`Threat`), 편의 자동화(`Conveniences`), 시련 기록·보상(`Trials`, 규칙은 `src/data/trials.ts`), 균열 기록·성좌판(`Rift`, 수치 `src/data/rift.ts`, 층 생성 `src/world/riftFloor.ts`). 수치는 `src/data/threat.ts`, 원천 각성은 `src/data/awakening.ts`(적용은 `src/skills/SourceAwakening.ts`) |
| `src/save/` | 저장 형식과 검사 |
| `src/render/` | 픽셀 렌더러, 쿼터뷰 카메라, 화면 ↔ 월드 좌표, 실루엣 |
| `src/world/` | 지역 맵(`regionMap.ts`: 지역 데이터 → 땅·길·소품·테두리 숲·출구 문, 다시 짓기), 지형 테마(`themes.ts`: 땅·물·빛·날림·소품 색 바꾸기), 땅 높이·연못(`terrain.ts`), 길찾기(`navGrid.ts`), 흩뿌리기(`layout.ts`). 그 땅의 소품 모델은 `src/voxel/models/landmarks.ts` |
| `src/voxel/` | 복셀 격자, 메시 생성, 모델(`models/`) |
| `src/audio/` | 소리(E5): 믹서·동시 재생 제한·거리 감쇠(`AudioEngine`, `limits`), 코드로 합성한 효과음(`sounds.ts`), 신화권별 합성 곡(`music.ts`, 방향은 `ART.md` 8장). 게임 사건 → 소리는 `systems/Sound.ts` |
| `src/art/` | 팔레트(`palette.ts`): 연출 언어 색(위험·회복·안내), 신화권·원천·하늘 공격 색, 위험색 규칙 `readsAsDanger` |
| `src/fx/`, `src/ui/` | 연출, 디자인 시스템(`theme.css`, `fonts/`), HUD·시작 화면·피해 숫자, 작은 지도(`Minimap`), 정보 화면(`GameMenu`는 틀, 탭은 `menu/`의 `statusTab`·`sourcesTab`·`relicsTab`·`mythTab`·`trialsTab`·`riftTab`·`mapTab`, 외형은 `WardrobePane`·`HeroPreview`, 게임에서 읽는 형식은 `menu/host.ts`), 균열 축복 고르기(`BlessingPicker`), 유물 설명 카드(`relicCard`, `RelicTooltip`), 일시 정지·설정(`PauseMenu`), 조사 붙이기(`josa`) |
| `tools/claude-mods/roadmap/` | 로드맵 패널 모드의 원본 (컨테이너가 바뀌면 다시 올림, 그 폴더 README) |
| `src/dev/` | 검증용 봇(`autoplay.ts`), 개발 패널(`DevPanel.ts`), 개발 지름길(`DevTools.ts`: `game.dev.equip('mjolnir')`·`dev.teleport`·`dev.promote` 등, 점검 스크립트도 이것을 쓴다), 충돌·길찾기 보기(`DebugOverlay.ts`), 지도 편집기(`RegionEditor.ts`, 편집 동작은 `regionEdit.ts`) |

## 작업 방식

- 마일스톤 작업은 `ROADMAP.md` 2장의 표(ID, 목표, 자동 검증, 직접 플레이 체크리스트, 완료 기준)를 따른다. 끝나면 완료 기준을 확인하고 문서에 기록한다.
- **로드맵 체크는 Claude가 진행할 때마다 직접 한다:** 작업 단위를 끝낼 때마다 `- [ ]`를 `- [x]`로, 이슈를 끝내면 `ROADMAP.md`의 해당 줄 ID에 ✅, 자동 검증을 통과하면 그 줄에 ✅, 사용자가 확인해 준 체크리스트는 `[x]`로 바꾸고, MCP `roadmap`으로 마일스톤 상태(할 일/진행 중/완료)를 맞춘다.
- **로드맵은 GitHub 이슈와 함께 간다:** 마일스톤 = 부모 이슈(라벨 `마일스톤`), 이슈(`E11-01`) = 하위 이슈, 작업 단위 = 하위 이슈 본문의 체크 상자. ID → 이슈 번호는 `scripts/roadmap-issues/issues.json`. 작업 단위를 끝내면 `ROADMAP.md`와 그 이슈 본문을 함께 체크하고(GitHub MCP `issue_write` update), 이슈를 끝내면 ✅와 함께 그 GitHub 이슈를 닫는다(`state: closed`, `state_reason: completed`). 마일스톤 이슈는 자동 검증·체크리스트를 본문에서 체크하고, 완료 기준을 넘으면 닫는다. 로드맵에 이슈를 새로 더하면 `node scripts/roadmap-issues/plan.mjs <스크래치 경로>/plan.json`으로 아직 없는 것만 뽑아 만들고(라벨이 새로 생기도록 부모 없이 만든 뒤 `sub_issue_write`로 붙인다) `issues.json`에 번호를 적는다.
- **사용자는 로드맵을 아티팩트로 본다** (https://claude.ai/artifact/VLnz4HHR5F7VMGG496TmqK). `ROADMAP.md`를 고칠 때마다 `node scripts/roadmap-page/build.mjs <스크래치 경로>/roadmap.html`로 페이지를 다시 만들어 같은 URL에 올린다.
- 로드맵 패널(모드)은 `ROADMAP.md`를 직접 읽어 계획 탭에 보여 준다. 문서를 고치면 패널도 바뀐다. 할 일 목록 항목 이름을 `E1 ...`처럼 마일스톤 ID로 시작하게 두면 계획 탭의 마일스톤에 상태(○ ▶ ✓)가 붙는다. 상태는 MCP `roadmap` 도구로 바꾼다.
- 코드 주석과 테스트 이름은 한국어. 주변 코드의 말투와 밀도를 따른다.
- 수치는 `src/data/*.json`에서 바꾸고, 바꾸면 `BALANCE.md`와 봇 결과(`PLAYTEST.md`)를 함께 고친다.
- 새 유물은 `relics.json`에 기존 종류(충전·터지는 때·하는 일)를 조합해 넣는다. 새로운 "하는 일"이 필요할 때만 `actions.ts`와 `schema.ts`의 ACTION_PARAMS에 더한다.
- 사람이 한 플레이 의견은 `PLAYTEST.md` 6장과 로드맵 해당 마일스톤에 반영한다.

## Git

- 브랜치 이름은 작업이 무엇인지 바로 알 수 있게 짓는다: `feature/<마일스톤>-<내용>` (예: `feature/e3-appearance`), 고치기는 `fix/<내용>`.
- **main 병합은 PR로 한다:** 브랜치를 푸시하고 PR을 만든 뒤 CI가 통과하면 GitHub MCP `merge_pull_request`(merge 방식)로 병합하고, 로컬 main을 `git pull`로 맞춘다. 저장소에 "Automatically delete head branches"가 켜져 있어 병합하면 원격 브랜치가 지워진다. (이 환경의 git은 원격 브랜치를 직접 지울 수 없다) 다음 마일스톤은 main에서 새 브랜치를 만든다.
- 한국어 문장에 이름을 넣을 때는 `src/ui/josa.ts`로 조사를 붙인다. "(으)로" 같은 표기를 쓰지 않는다.
- PR은 main에 병합할 때만 만든다. PR 본문은 한국어로, 무엇을 바꿨는지와 확인한 것만 짧게 쓴다.
- 커밋 메시지는 한국어, 마지막에 세션이 알려 주는 Co-Authored-By·Claude-Session 줄을 붙인다. 모델 이름은 코드·문서에 쓰지 않는다.
