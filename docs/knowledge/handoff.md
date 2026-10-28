# 인수인계: 지금 상태와 다음 할 일

> 마지막으로 고친 날: 2026-10-28. 일을 한 덩어리 끝낼 때마다 고친다.

## 한 줄 요약

**3차 스프린트 진행 중: 지금은 E235 휴대폰 대응(세로 화면만, 떠다니는 조이스틱, 두 손가락 확대·축소, HUD·정보 화면 세로 배치, 사용자 결정 2026-10-28). 그 앞에 E23 순간의 크기를 끝냈다(E23-01~04).** 강해지는 순간과 장의 고비가 네 등급으로 보인다: 작은 알림(화면 아래 한 줄)·카드(오른쪽 작은 지도 아래)·큰 카드(그 신의 색 번쩍임, 하늘 기둥, 큰북, 가운데 큰 카드)·장면(느린 동작 → 검은 띠의 대화 장면 → 얻은 것 카드). 사건 → 등급 표는 `src/data/moments.ts`, 보이는 것은 `systems/Moments.ts`(일어난 차례대로, 카드·장 제목 띠가 보이는 동안 다음 장면은 기다림). 장면 넷: 첫 신화 고르기, 장 보스(`downKing`·`downChimera`), 장 넘어가기(`chapterNorth` 등), 엔딩. 곡 넷을 더했다(갈라진 하늘·보스·엔딩·성소). main은 GitHub Pages(https://sksskdf.github.io/mythic-relics/)에 올라간다(Settings › Pages는 GitHub Actions로 켰다). **E235 다음은 E24(에셋 v2, 장비 에셋 E24-06 더함).** 그 전 E22: 장 다섯·땅 세기·결계·첫 신화 고르기·목표 한 줄·마지막 무대와 엔딩, 봇 엔딩 66~76분. 남긴 것: 땅을 떠날 때의 시원함·종장 시간(E25-01). 봇의 2단계 시간 흔들림은 전설 결계를 닫힌 싸움으로 고쳐 풀었다(아래 봇 기준). 설계는 `TIMELINE.md`(6장에 E23 구현).

## 지금 상태

| 항목 | 상태 |
| --- | --- |
| 브랜치 | `feature/e235-mobile` (E235 휴대폰 대응, PR로 병합). E23은 PR #136, 전설 결계 고침은 PR #137, 하네스는 PR #134, Pages 배포는 PR #135 |
| 휴대폰 (E235) | 터치 기기면 html에 `is-touch`, 가로로 들면 돌려 달라는 안내와 멈춤(`RotateHint`). 세로 화면은 가로에 시야 높이 × 0.8(`resolution.ts`의 `visibleHeight`), 손가락 몸짓 `src/input/touch.ts`(톡·끌기·두 손가락), `TouchControls`(캔버스 → 몸짓, 조이스틱 그림), `PlayerInput.updateTouch`(톡 = 클릭, 조이스틱 = 주인공 앞 2.5m로 걷기, 놓으면 멈춤, 두 손가락 = 시야 높이). 배치 `src/ui/portrait.css`(비 4:5보다 좁을 때). 리뷰(game-reviewer)에서 나온 것을 고쳤다: 막힌 뒤 조이스틱 먹통(`HeroOrders.steer`), 세로 화면 카메라 픽셀 맞춤·near 면, 두 손가락 한계, 뗀 것을 놓친 손가락, 태블릿 가로 허용(기본안), 렌더 배율 1 이상, 적 톡 범위, iOS 소리. 점검: 스모크 마지막의 휴대폰 한 바퀴, `ui-sheet.mjs`의 `cut.json`(잘린 요소 0), `SHOT_SIZE=390x844 SHOT_TOUCH=1 shot.mjs` |
| 순간의 크기 (E23) | 표 `src/data/moments.ts`(사건 → 등급, 느린 동작 1.2초×0.25, 카드 기다림 3·4.5초, 띠 5초), 시스템 `systems/Moments.ts`(버스의 `moment`, `holding`이면 `Storyline`이 짧은 대화를 미룸, 장면은 `play(id, true)`), HUD `showGains(…, 'card'|'big')`·`gainsBusy`·`setHidden`(장면 중 투명하게, 직전 제목 카드는 장면 뒤 다시), 검은 띠 `.letterbox`, 하늘 기둥 `PowerUp.column`, 큰북 `drum`, 곡은 `SoundSystem.theme()`이 프레임마다(장면 곡 > 전설 > 보스 > 땅, 마지막 무대는 `sky`). 엔딩 중에 저장된 판은 불러오면 엔딩을 다시 보인다. 점검 `scripts/checklist-qa.mjs e23`, 개발 패널 「알림·카드·큰 카드·장면」·「곡」 |
| 웹 배포 | `.github/workflows/pages.yml`: main에 올라오면 빌드해 Pages로. 처음 배포는 Pages가 꺼져 있어 실패(사용자가 Settings › Pages › Source를 GitHub Actions로 켜야 함). 휴대폰 터치: 확대·글 선택 막음(`index.html`) |
| 하네스 | `.claude/settings.json`의 훅 넷(세션 시작 요약, Bash 명령 막기, PR 만들기·병합 규칙, 고친 뒤 알림), 스크립트는 `scripts/harness/`(규칙 `rules.mjs`, 명령 읽기 `shell.mjs`, 검사 도장 `check-stamp.mjs`, 모아 보기 `what-to-run.mjs`). 서브에이전트 셋(`game-reviewer`·`playtest-qa`·`balance-analyst`), 스킬 넷(`roadmap-sync`·`balance-pass`·`qa-pass`·`steward`). 설명은 `CLAUDE.md` 하네스, 역할은 `workflow.md`. 시험은 `tests/harness.test.mjs` |
| 로드맵 | E11~E23 완료. 지금 E235 휴대폰 대응(E23과 E24 사이, 작업 ID `E235-01`…), 그 뒤 E24~E25 (`ROADMAP.md` 2장) |
| 장 흐름 (E22) | 장 데이터 `chapters.json`·`chapters.ts`, 진행 `progress/Chapters.ts`(들어선 땅·이긴 보스, 저장 v10), 알림 `systems/Chapters.ts`(`chapterChanged`·`goalChanged`·`goalView`), 신화 고르기 `systems/MythChoice.ts`·`ui/MythPicker.ts`(데모에서는 `ClassProgress`의 `openByXp`가 꺼짐), 결계 `world/Barriers.ts`·`World.openLinks`·`refreshLinks`, 땅 세기 `Encounter.landPower`·`landScale`, 목표 한 줄·장 제목 띠 `ui/ChapterHud.ts`, 작은 지도 `Game.goalSpot`, 세계 지도 `world.goal()`·`nodes().locked`. 엔딩은 `Game.showEnding`. 개발 패널 「목표 건너뛰기」「장 건너뛰기」(`Game.skipGoal`). 데모에서는 어느 성소든 고른 신화의 전설을 연다. 마지막 무대 땅은 `scripts/gen-finale.mjs` |
| 세 축 (E21) | 신화: 경험치는 고른 신화만(`masteryShares`), 단계 ×1.35·생명 +25%(`PER_PROMOTION`), 수집 보너스 하나마다 피해 +4%·생명 +5(`PER_OPENED`), 데모 3단계(`levelCap`, 엔딩 뒤 4). 장비: `GearItem.tier`(땅 단계, `gear.json`의 `tiers`), 등급 배율, 땅 자리마다 드랍 표(`lands`). 유물: 기본 수치 셋(`relicStats`), 그 신화를 골랐을 때만 깨어남(`relicAwake`, 잠든 유물은 HUD 칸이 흐림), 효과 한 단계 위(`effectScale`), 데모 2단계(`DEMO_RELIC_STAGES`), 데모에서는 유물이 안 떨어짐. 재료: 신화권 재료·보스 재료 둘, 제작법은 장 보스 규칙(`forge.ts`). 원천: 장비 속성만, 카드에 「각성까지 N」. 엔딩 뒤 장치는 `Ending`(`game.reachEnding()`, 개발 패널 「엔딩 뒤로」). 저장 v9 |
| 신화 개성 (E18) | `ART.md` 9장 개성 표. 무기 동작 21개 모두 다름(`combat/styles.ts`, 새 아홉), 유물 행동 모습(`relics.json`의 `action.look`, 그림은 `skills/actionLooks.ts`), 궁극기 모양(`ultimate.style`, 물결·칼춤 모양 새로), 무기 실루엣. `tests/identity.test.ts`가 겹침을 막는다. 확인은 `scripts/motion-sheet.mjs`. 렌더 해상도 428(1.5배). 일반 장비 외형(`voxel/models/gearLooks.ts`)도 이때 만듦 |
| 균열 (E17) | 한계를 깸 = 신화권 다섯 보스를 위협 10단계에서 이김(`ThreatSystem.breakLimit`, 위협 99까지). `src/world/riftFloor.ts`(층 생성, 시드), `src/data/rift.ts`(배율·축복 20·성좌판), `src/progress/Rift.ts`(깊이·별·밝힌 별), `src/game/systems/Rift.ts`(들어가기·층 깨기·축복·다음 층 문·끝), `ui/BlessingPicker.ts`, 정보 화면 균열 탭(성좌판). 균열 무리는 다시 나타나지 않음. 저장 v8. 봇은 `--rift`(엔드게임 빌드 `game.dev.endgame()`) |
| 시련 (E16) | `src/data/trials.ts`(여덟·난이도·마일스톤·규칙), `src/progress/Trials.ts`(기록·보상·균열 배율), `src/game/systems/Trials.ts`(필드 성소에서 고른 신화 전설을 바로 엶, `legend.begin`), 정보 화면 시련 탭, 제약은 `Build`의 trial로 덮어씀. 저장 v7 |
| GitHub 이슈 | E12 #3~E18 #9·E20 #93~#96 닫음. E19 #83과 하위 #84~#90, E21 #98과 하위 #99~#106, E22 #107과 하위 #108~#113, E23 #114와 하위 #115~#118 닫음. E235 #138과 하위 #139~#144, E24 #119(E24-06 #145 더함)·E25 #125와 하위 이슈 (`scripts/roadmap-issues/issues.json`) |
| 로드맵 패널 | MCP `roadmap` #29~#37(E11~E19)·#39(E21)·#40(E22)·#41(E23) 완료, #44 E235 진행 중, #42 E24·#43 E25 할 일 |
| 로드맵 아티팩트 | https://claude.ai/artifact/VLnz4HHR5F7VMGG496TmqK |
| 기획 원본 | `DESIGN.md` v2.0. 지역 16곳 9.2, 대화 장면 9.5, 원천 6장, 위협 단계·편의 9.4 |
| 세계 (E15) | 마을 → 입구 들판 → 깊은 땅(정예 +20%p) → 보스의 땅. 지역 데이터의 `zone`·`elite`, 이웃은 서로 오감(검사), `nextHop`(다음 이웃)·`worldLayout`(지도 자리). 깊은 땅·보스의 땅은 `scripts/gen-regions.mjs`가 만들고(다시 돌리면 덮어씀), 땅 얼굴은 `themes.ts`의 `DEEP_THEMES` |
| 하나로 이어진 세계 (E19) | 떠다니는 원점: 지금 땅이 원점, 이웃 여섯 칸(빈 칸은 숲)을 옮겨 그림. 통로 가운데를 1m 넘으면 `World.cross`가 주인공·카메라·떨어진 것을 옮기고 무대·길찾기·적을 새 땅으로(암전 없음, 가던 길 이어 걸음). 갈 수 있는 곳 = 땅 네모 + 통로(`WalkArea`). 숲은 가장자리 6m만 빽빽(그림자는 맨 앞줄), 깊은 숲은 단순한 나무, 숲 6m·바닥 25m 네모로 나눠 화면 밖은 안 그림. 경계 8m는 이웃 얼굴과 물결 선으로 섞고, 통로 안 하늘빛도 섞음. 조각은 단계로 나눠 프레임마다 한 단계. 구조는 `architecture.md`, 설계는 `DESIGN.md` 9.2.2. 적(E19-04): 이웃 땅 무리를 미리 세워 두고(`Encounter.parked`), 넘어가면 깨우며 쫓던 적은 이어 쫓음. 이웃 성소도 그려 둠(`Chunk.sanctuary`). 남은 것: 날림(눈·꽃잎)은 넘어갈 때 바뀜, 마을 사람은 마을에 들어설 때 나타남(통로에서는 화면 밖), 지도(E19-05): 작은 지도 `setRegion(region, { neighbors, passages })`, 세계 지도 `world.nodes()`가 칸 자리·`world.me()`가 내 자리. 저장은 형식 그대로(지역 id + 지역 안 좌표 = 세계 자리) |
| 성장 곡선 | `scripts/power-curve.mjs`: 봇이 2분마다 남긴 저장을 불러 공격·방어 지수, 적 잡는 초, 버티는 대를 잰다. E20 기준선: 1:54 ×1 → 5:43 ×3.04 → 40:46 ×4.91. E21 뒤: 5:40 ×2.1 → 13:19 ×3.39 → 23:01 ×4.98 (봇은 40분 내내 미드가르드) |
| 손맛 점검 | `scripts/feel-qa.mjs`: 플레이어처럼 적을 눌러 싸우며 끊긴 휘두르기·걷기 깜박임·헛휘두르기·붙잡힘·못 끝냄을 잡는다. 기본 21신화 × 적 7, 고친 뒤 잡힌 것 0/147 |
| 지도·워프 | 정보 화면 지도 탭(`src/ui/menu/mapTab.ts`), 작은 지도를 누르면 열림. 성소 결계에 들어서면 "찾은 성소"(`conveniences.visited`), 성소 워프(엔딩 뒤 위협 2단계에 열림)로 그 성소에 감 |
| 대화 | `scenes.json`: 마을 사람 셋(`talkChief` 등, 누르면 걸어가 말 걸기), 신화 개방 21(`mythThor`…), 보스 다섯(`bossKing`…), `threatUp`, `forgeFirst`. 처음 보는 일은 한 번만(`Storyline`), 창이 열려 있거나 다른 장면 중이면 미룸, 신화 여럿이 함께 열리면 고른 신화 장면만(나머지는 그 신화를 처음 고를 때), 대화 중 세계 멈춤, 봇·`?relics`·`?noscenes`는 끔 |
| 중간 점검 (2026-10-27) | 리뷰 셋(전투·스킬, 장비·저장·진행, 세계·조작·UI)과 봇·스크린숏 QA. 고친 것은 `troubleshooting.md` 맨 아래 네 줄과 `PLAYTEST.md` 중간 점검 줄. 쓰러져 있는 동안 날아가던 유물 연출이 멈추던 것은 기술 부채 정리 때 고침(적을 비운 채 마저 움직임, 쓰러진 동안 회복으로 되살아나지 않게). 남긴 것: 지역을 여러 바퀴 돌면 형상이 1개 늘어남(394 → 395), 「타는 모래시계」 등 시련은 봇 기준만 있음. UI 점검은 `scripts/ui-sheet.mjs` |
| 봇 기준 | 장 흐름을 따라(`autoplay.chapters`) 첫 신화 8분, 2단계 17~28분(CI는 35분 안), 엔딩 59~77분(`--ending`), 쓰러짐 0~2. 봇은 성소로는 곧장 걷고, 보스는 둘레 적을 치운 뒤 친다(`troubleshooting.md`). 전설 결계가 닫히면 둘레 무리는 안의 주인공을 보지 못한다(2026-10-28, 그 전에는 성소 옆 무리가 몰려와 봇이 요툰헤임 전설에서 아홉 번까지 져 CI 35분을 가끔 넘김). 위협 단계·시련·균열 봇은 엔딩 뒤로 넘겨 돈다(`--threat`·`--trials`·`--rift`). 원천 빌드 넷은 `scripts/source-trial.mjs` |
| 이슈 체크 도구 | `node scripts/roadmap-issues/tick.mjs <스크래치>/tick.json <작업 단위 ID ...>` (넘긴 ID는 모두 체크되므로, 새로 더한 칸은 본문에서 되돌린다) |

## 다음 할 일

1. **E235 휴대폰 대응: 만들기는 끝(E235-01~06, PR #146 병합·Pages 배포), 사용자가 휴대폰으로 체크리스트 셋을 볼 차례** (이슈 sksskdf/mythic-relics#138). 첫 의견 「조이스틱 패드가 움직인다」는 원을 누른 자리에 고정해 고쳤다(`fix/joystick-fixed-base`). 병합해 Pages에 올라가면 사용자에게 휴대폰으로 해 보고 「엄지 하나로 걷고 싸우기가 편하다·어느 화면도 잘리거나 글자가 깨지지 않는다·두 손가락으로 당겨 보고 밀어 볼 수 있다」와 fps를 알려 달라고 한다. 의견이 오면 고치고 마일스톤을 닫는다
2. **E24 에셋 v2** (아트 기준 v2, 주인공 가독성, 땅 키트·적 키트(갈라진 하늘 땅 모습 포함), 등급별 연출·UI, 장비 아이콘과 입은 모습) → E25 데모 다듬기(떠날 때의 시원함·종장 시간, 처음 90분 통째로) (`ROADMAP.md` 2장, `TIMELINE.md` 8장)
3. 영웅 장비 고유 효과 열둘은 카드의 글뿐이고 돌지 않는다 (따로 할 일)
4. 기본안 확인(`decisions.md` 맨 아래, E21·E22·E23 기본안과 전설 결계): 사용자가 보면 고친다

## 사용자에게 받아야 할 것

- **Claude GitHub 앱이 이름이 바뀐 저장소(mythic-relics)에 닿는지:** 이 세션은 `sksskdf/game`으로 잡혀 있어 PR 알림이 오지 않았다 (https://github.com/apps/claude/installations/select_target)
- **휴대폰 체크리스트 셋과 fps (E235):** 엄지 하나로 걷고 싸우기가 편한지, 어느 화면도 잘리거나 글자가 깨지지 않는지, 두 손가락으로 당겨 보고 밀어 볼 수 있는지
- **태블릿 기본안 (E235):** 태블릿·터치 노트북은 가로로 두어도 막지 않고 컴퓨터 배치에 손가락 조작으로 했다 (`decisions.md` 맨 아래). 세로만 하게 할지
- 직접 해 본 의견이 있으면 (체크리스트는 받지 않는다)
- 이슈 #1 삭제 (Delete issue는 저장소 관리자만)
- GitHub 프로젝트에 이슈가 들어갔는지, "Item closed → Done" 작업 흐름이 켜졌는지

## 열린 질문 (그때 정함)

`ROADMAP.md` 5장 "정할 것"과 같다: 상시·추가 효과 나눔(E12-01), 장비 수치 범위·등급 확률(E13-01), 확대 픽셀 시안(E18-01), 결말의 큰 방향(보류), 게임 제목(2차 뒤), 기술 유지·외부 검증(2차 뒤, E10).
