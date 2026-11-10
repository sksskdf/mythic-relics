# 코드 구조 요약

폴더별 내용은 `CLAUDE.md`의 "코드 지도"가 원본이다. 여기에는 **고칠 때 지켜야 할 원칙**과 **E11에서 바꿀 곳**을 둔다.

## 지켜 온 원칙

- **데이터가 먼저:** 유물·신·적·클래스 트리·지역은 `src/data/*.json`. 형식과 검사는 `schema/`·`regions.ts`이고, 빌드할 때 데이터 검사가 돈다. 수치는 JSON에서 고치고 `BALANCE.md`와 봇 결과를 함께 고친다.
- **유물 효과는 조립:** 충전(무엇을 하면 차나) × 터지는 때 × 하는 일. 새 "하는 일"이 필요할 때만 `src/skills/actions.ts`와 `schema/relics.ts`의 ACTION_PARAMS에 더한다.
- **시스템끼리는 버스로만:** `src/game/systems/*`는 `events.ts`의 이벤트 버스로 주고받고, 공용 상태는 `context.ts`. 시스템이 서로를 직접 부르지 않는다.
- **모델은 코드로:** 복셀 격자 → 메시(`src/voxel/mesher.ts`, 같은 면을 크게 묶는 greedy 방식). 적은 몸 종류 여섯(giant·beast·humanoid·flyer·spirit·serpent)을 생성기로, 클래스 외형은 `gen.ts` 생성기로.
- **색에는 뜻이 있다:** `src/art/palette.ts`. 위험(적 공격 예고) 색은 적만 쓰고, 내 연출 색이 위험색처럼 보이면 `tests/art.test.ts`가 막는다 (`readsAsDanger`). UI 토큰(`theme.css`)과 팔레트 값이 같아야 한다.
- **UI는 디자인 시스템:** `theme.css`의 토큰만, 갈무리 픽셀 글꼴 10/12/15px와 그 배수만.
- **테스트 층:** 단위(`tests/*.test.ts`, vitest는 `tests/`만 봄), 스모크(`scripts/smoke.mjs`, 브라우저로 실제 화면), 봇(`scripts/playtest.mjs`), 적 시험(`enemy-trial.mjs`), 성능(`bench.mjs`), 모습 모음(`enemy-sheet.mjs`, `class-sheet.mjs`).
- **개발 도구도 같이:** 새 시스템을 만들면 개발 패널(`src/dev/DevPanel.ts`)에 시험 단추를 더하고, 봇(`src/dev/autoplay.ts`)이 그 시스템을 쓰게 한다. 봇은 이동(`hero.moveTo`)만 내리고, 대상을 붙잡으며(3m), 처치 없이 60초 싸우면 그 적을 잠시 피해 가장 먼 무리로 간다(목표 적은 늘 침, E241). 먼 걸음에서는 `orders.tryRide()`로 탈것에 오르고 적에게 다가갈 때 내린다. `playtest.mjs`는 판마다 처치 끊김(`killGap`)을 남긴다.
- **저장은 옮기기 테스트로:** 지금 v17 (`src/save/SaveData.ts`, v1부터 모두 읽음). 형식을 바꾸면 옛 판을 옮기는 함수(`src/save/migrate/`)와 실제 모양 견본 테스트(`tests/save.test.ts`: 검사 통과·공격 지수 0.9~1.1배·깨운 신·장 진행·웨이포인트)를 함께 만든다. 개발판이 버전은 같고 모양만 옛것일 수 있으니 옛 키는 새 키가 없을 때만 읽는다(E305).

## E11에서 바꾼 곳 (끝)

| 곳 | 바꾼 뒤 |
| --- | --- |
| `src/game/Game.ts` | 957줄 → 870줄 안팎. 지역 이동은 `World`, 개발 지름길은 `src/dev/DevTools.ts`(`game.dev.*`), 시작 화면 뒤 장면은 `TitleBackdrop`. Game에는 `enterRegion`·`travelTo`·`regions`·`exitsLocked` 위임만 남김 |
| 빌드 상태 | `src/build/BuildState.ts`의 `computeBuild(inputs)`: 열린 신화(수집 보너스 `collected`)·올린 단계(×1.35^n)·고른 신화·장비(일반 장비 수치, 유물 기본 수치는 `Build`가 `relicStats`로 넣음)·원천 → 피해 배율·지속 효과(깨어난 유물만)·받는 피해·이동 속도·공격 리듬·최대 생명, 수치 합 `stats`(별을 밝힌 신화의 수치 포함). 게임 안에서는 `ctx.build`(`Build`, 부를 때마다 계산, `chosen`·`level`은 가볍게). `tests/build.test.ts`가 E21 공식을 지킨다 |
| 세계 (E15) | 지역 16곳(E239 북유럽 여섯으로 19곳, E241 고개로 20곳과 마지막 무대): `RegionDef.zone`(entrance·deep·boss)·`elite`. `nextHop`(봇·지도의 다음 이웃). 지도 자리는 세계 칸(`world.ts`의 CELLS, E239). 대화 장면은 `Game.story(id)`가 처음 보는 일에만 열고, 대화 중에는 세계가 멈춘다 |
| `src/gear/` | `Loadout`(칸 7·가방·일반 장비 `gear`·유물 단계 `stages`·재료 `materials`), `roll.ts`(일반 장비 굴리기와 단계 `tier`·`landTier`·`landChances`, id는 `g:`로 시작), `mythRelic.ts`(신화마다 유물 하나와 부위·단계, 기본 수치 `relicStats`, 깨어남 `relicAwake`, 효과 배율 `effectScale`, 나머지 유물은 엔딩 뒤 재료), `materials.ts`(신화권 재료·보스 재료와 드랍), `forge.ts`(장 보스 규칙으로 만드는 제작법·제작·분해), `Pickups`, `DropTable`(엔딩 뒤 유물 드랍). 칸에는 유물 id와 장비 id가 섞여 들어가므로 유물만 다루는 곳은 `isRelicId`나 `loadout.relics`로 거른다 |
| `src/myth/` | `manifest.ts`(고른 신화·가호 판정, 옛 발현 규칙 `legacyManifest`는 옛 저장과 히든 신화만), `ClassProgress`(개방 단계 0~4, 열기 `open`·승천 `ascend`, 단계 상한 `levelCap`(데모 2에서 장 정복마다 +1·끝 3, 엔딩 뒤 4), 큰 걸음 `PER_PROMOTION`·수집 보너스 `PER_OPENED`. 신화 경험치는 E305-03에서 없앰), `levelGains`, `alwaysText`(수치·수집 보너스·별 글) |
| `src/progress/Ending.ts` | 엔딩 뒤 장치를 여는 한 곳 (E21-06, E305-03에서 일곱으로): 남은 신화권 셋(결계·땅에 떨어지는 신화 유물)·깊이·끝없는 원정·맹세 다섯(숨 칸 끝 5)·자동 줍기(지난번 갈래)·신 4단계·유물 3·4단계. 읽는 곳은 모두 `ending.has(키)`, 첫 엔딩 큰 카드는 `endingLines()`. `game.reachEnding()`이 열고 저장에 남는다 |
| 원천·깊이 (E14, E305-03) | 빌드 상태에 `sources`(장비의 합, E21-05에서 원천 숙련·공명을 없앰)·`awakening`(0~3). 각성 효과는 `powers.awakening`(`SourceAwakening`)이 기본 공격·처치·걸음·피격에서 돌고, 배율(기본 공격·모든 피해·공격/이동 속도·받는 피해)은 Game이 매 프레임 전투·이동에 곱한다. 깊이 배율은 `encounter.threat`(옛 이름 그대로)·`eliteChance`로 새로 세우는 적에 건다. 깊이는 엔딩 뒤 귀환 카드에서 고르고(`ExpeditionSystem.returnNow(id, depth)` → `DepthSystem.choose`), 고르면 이미 세운 적도 다시 세운다. 한계를 깸은 깊이 10 원정의 장 보스·수호자 + 귀환: 이긴 일은 원정 기록 `expedition.deepWin`에 저장하고, `returnNow`가 지우기 전에 읽어 `expeditionReturned.deepWin`으로 넘긴다(다시 불러온 판도 같게) |
| 읽는 길 | 게임 시스템은 지금 신화·단계를 `ctx.build.chosen`·`ctx.build.level`로 읽는다. 장비 칸 자체를 다루는 곳(장착·저장·유물 화면)은 `powers.loadout`을 본다 |

## 2차 스프린트 중간 점검에서 나눈 곳 (2026-10-27)

| 곳 | 나눈 뒤 |
| --- | --- |
| `src/ui/GameMenu.ts` | 1279줄 → 225줄. 틀(탭 줄·힌트·여닫기)만 남기고 탭은 `src/ui/menu/`: `statusTab`·`sourcesTab`·`oathsTab`·`endlessTab`·`mapTab`는 함수(`renderX(ctx, body)`), 기억할 것이 있는 장비·수련·신 탭은 클래스(`RelicsTab`의 고른 칸·커서 올린 것, `GodsTab`의 눌러 본 신·「자리 · 외형」·접힌 신들의 지도, 외형 보관함 `WardrobePane`은 `GodsTab`이 하나만 들고 따로 둔 칸에 그린다). 탭 일곱(E305-04)과 엔딩 뒤 끝없는 원정. 탭이 쓰는 것은 `TabContext`(host·힌트·다시 그리기·닫기), 게임에서 읽는 형식은 `menu/host.ts` |
| `src/game/Game.ts` | 1278줄 → 861줄. 정보 화면에 넘길 값과 할 일·능력치·설명 카드 상태는 `MenuData`, 대화 장면을 여는 때와 미루기·말 걸기는 `Storyline`, 공격 궤적·원거리 공격 모습은 `AttackFx`, 커서 아래 카드·이름표는 `HoverCards`. Game에는 `story`·`storyScenes`·`sourceRows` 위임이 남음 |

## E305-04에서 나눈 곳 (2026-10-30)

| 곳 | 나눈 뒤 |
| --- | --- |
| `src/game/Game.ts` | 1323줄 → 877줄. 조립과 메인 루프(`tick`·`update`·`advance`)만 남기고, 덩어리는 `src/game/` 아래 제 모듈로: 화면과 설정 `Viewport`(픽셀 렌더러·휠과 두 손가락 확대·축소·창 크기·일시 정지 메뉴의 설정), 창과 키보드 `WindowEvents`(`listenWindow`), 플레이 기록 `PlayLog`(`game.log`), HUD에 넣을 것 `HudFeed`(막대·칸·조작 안내·위아래 띠·목표 한 줄·목표의 자리 `goalSpot`·작은 지도), 정보 화면 배선 `MenuWiring`(정보 화면·일시 정지 메뉴·누르면 여는 탭·탭 표시·깨달음 알림, 정보 화면 값은 그 안의 `MenuData`), 장 넘어가기와 첫 엔딩 `ChapterFlow`(`reachEnding`), 유물 스킬의 세계 `skillContext.ts`(`heroSkills`), 시작 옵션 `options.ts`(`GameOptions`). 신 탭의 자리 보기·깨우는 신 한 줄은 `MenuData`, 목표 건너뛰기는 `DevTools.skipGoal`, 불러온 자리 맞추기·워프의 웨이포인트 검사·성소 켜기는 `World`(`settleLoaded`·`warpTo`·`lightWaypoint`) |
| 남긴 위임 | 스크립트·봇·개발 패널이 부르는 이름은 Game에 한 줄 위임으로 둔다: `log`·`sourceRows`·`screenPoint`·`goalSpot`·`skipGoal`·`reachEnding`·`placeMyth`·`unplaceMyth`·`returnCardOpen`·`oathCardOpen`·`hideCards`·`answerSwap`·`swapOpen`·`story`·`storyScenes`·`forgetScene`·`gameSpeed`·`barrierSpots`·`region(s)`·`enterRegion`·`travelTo`·`exitsLocked`. 스크립트가 private 필드(`ctx`·`relics`·`stage`·`playerInput`·`attackFx`·`damage`·`nav`·`tabSystem`·`chapterSystem`)도 손대니 이름을 바꾸지 않는다 |
| 지키는 것 | `tests/structure.test.ts`가 `Game.ts` 900줄 아래를 지킨다. 새 장치를 넣으며 늘면 한 덩어리를 제 모듈로 뗀다. 옮길 때 버스를 듣는 차례(같은 사건을 듣는 시스템보다 앞서거나 뒤서지 않게)와 DOM에 붙는 차례는 옛 자리 그대로 둔다 |

새 탭은 `src/ui/menu/`에 파일을 만들고 `GameMenu.render`에 한 줄을 더한다. 탭이 게임에서 읽을 것은 `menu/host.ts`의 형식에 더하고 `MenuData.host()`에서 채운다.

E12~E14에서 새 규칙을 넣을 때는 `BuildInputs`에 재료를 더하고 `computeBuild`에서 계산을 늘린다. 시스템이 장비·신화를 직접 읽어 따로 계산하지 않는다.

## 원정 순환 (E301~E305·E306)

설계는 `DESIGN.md` 3~5장(층·신의 자리·합치기·귀환·맹세·장 정복), 시각표는 `TIMELINE.md` 4장, 지난 재편안의 모듈 계획은 `docs/knowledge/past/CYCLE.md` 8장. 실제로 만든 모듈:

| 곳 | 하는 일 | 성격 |
| --- | --- | --- |
| `src/build/layers.ts` | 빌드 층 목록 `[{id, kind: mul·add, value}]`: 승천·유물표·장비·맹세·수련·손의 신·명성·장 정복·불꽃 불씨. `layerProduct` = 곱 층의 곱 × (1 + 덧셈 층의 합). 상태 탭 「무엇으로 얼마나 강해졌나」가 같은 목록을 읽는다 | 순수 |
| `src/build/BuildState.ts` | `computeBuild`가 층 목록을 곱해 `Build`를 낸다. 판 번호 `version`은 빌드가 바뀔 때만 오른다 | 순수 |
| `src/myth/pantheon.ts` | 자리 셋 `Pantheon {hand, heart, breath[]}`, 숨 칸 수(`breathSlots`·`breathCount`), 몰기(`focusGod`·`partLevel`), 빈 칸 채우기(`autoFill`), 맹세를 건 동안의 자리(`oathPantheon`) | 순수 |
| `src/progress/Expedition.ts` | 원정 번호·명성·원천 불씨·기록·가보·출발점·새 불길 | 순수 + 저장 |
| `src/progress/Automation.ts` | `automationAt(returns, ending, pickups)`: 귀환 횟수 → 다시 찍기·가보 칸·출발점·자동 합치기·자동 줍기 | 순수 |
| `src/progress/Oaths.ts`·`src/data/oaths.ts` | 맹세 제약·지킴·기록·보상 | 순수 |
| `src/gear/merge.ts` | 셋 → 하나(`mergeGear`), 합칠 묶음(`mergeGroups`), 등급마다 원형 값 | 순수 |
| `src/skills/uniques.ts` | 고유 효과 열둘과 수련 큰 마디 셋의 상태·규칙. 세계에 손대는 일(피해·회복·연출)은 `systems/Uniques.ts` | 순수 + 버스 |
| `src/data/cycle.ts` | 명성 식·갈래·새 불길·귀환 문턱 표(`RETURN_MIN_LEVEL`, 읽는 함수 `returnMinLevel`)·귀환 신호(`RETURN_SIGNAL`)·자동화 문턱·장 정복 | 데이터 |
| `src/game/systems/Expedition.ts` | 원정이 무르익었나(귀환 문턱 판정 `minLevel`·`ripe`, 값은 `data/cycle.ts`의 `returnMinLevel`), 성소 화로 → 귀환 카드(화로를 떠나면 닫힘), 갈래·가보·녹임·출발, 자동 합치기, 다시 찍기 | 시스템 |
| `src/game/systems/Oaths.ts`·`src/ui/OathCard.ts` | 출발 카드(띄운 자리에서 걸어 나가면 맹세 없이 떠남), 지킴·깨짐 | 시스템·UI |
| `src/game/systems/Automation.ts` | 귀환할 때 새로 켜진 자동화를 카드로 | 시스템 |
| `src/ui/ReturnCard.ts`·`src/ui/SwapCard.ts` | 귀환 카드(고르는 카드 틀 `pickCard.css`), 두 갈래 카드 | UI |
| `src/ui/menu/godsTab.ts` | 자리 셋·유물표·외형(옛 신화·외형 탭을 합침) | UI |

- 계획에 있던 `systems/Pantheon.ts`·`systems/Merge.ts`는 만들지 않았다. 부품 얻기와 빈 칸 채우기는 `systems/Relics.ts`(`autoFill`)와 `systems/Wake.ts`, 두 갈래 카드는 `SwapCard`, 합치기는 장비 탭(`menu/relicsTab.ts`)과 `systems/Expedition.ts`의 자동 합치기가 맡는다. 마이그레이션도 버전마다 파일을 두지 않고 `migrate/legacy.ts`(v16 모양까지)와 `migrate/v17.ts` 둘이다.
- **버스 사건 (원정 순환에서 더하거나 바꾼 것):** `expeditionReturned {count, renown, mult, branch, deepWin}`(귀환, 자동화·깊이가 받음), `gearMerged {item}`, `oathEnded {id, win, seconds}`, `chapterConquered {region, conquered}`, `ultimateCast`(고유 효과가 받음), `depthChanged {level}`(옛 `threatChanged`), `endlessFloor`·`endlessEnded`(옛 균열), `mountGained`·`rode`(E241). 계획의 `momentumLevel`·`ascended`·`pantheonChanged`·`partGained`·`buildChanged`는 만들지 않고 옛 이름(`insightGained`·`promoted`·`mythLent`·`fragment`)과 판 번호를 그대로 썼다. 없앤 것: `gearSalvaged`, `legendStarted`·`legendFailed`, `riftFloor`·`riftEnded`, `threatChanged`.
- **성능 원칙:** ① 판 번호: `Build` 지문 대신 판 번호 하나. 장비·자리·원정·명성이 바뀔 때만 올리고 `passives()`는 판마다 한 번 만든다. ② 프레임마다 돌지 않음: 고유 효과·수련 큰 마디·자동 합치기는 버스 사건으로만 돈다. ③ 효과 수 상한: 숨 칸 넷이 함께 돌아도 같은 종류 효과는 풀(`src/fx/Shots.ts`·`Slashes.ts`·`Puffs.ts`)에서 꺼내 쓴다. ④ 땅에 남는 일반 장비는 24개까지(`Pickups`). ⑤ 기준: `bench.mjs --matrix`(데스크톱·휴대폰 × 미드가르드·올림포스 × 화질, `baselines.md`), 그리기 호출은 E18 기준 +30% 안, 갱신 시간은 같은 세션의 main 이하. 휴대폰 기본 화질은 낮음(E306 D22), 휴대폰 fps는 사용자에게 확인을 부탁한다. ⑥ 큰 파일 나누기: 데이터 검사는 `src/data/schema/`, `Game.ts`는 900줄 아래.

## 저장 사슬 v14~v17 (E302~E305)

v1~v12는 「v13 모양으로 올리기」 한 단계(`src/save/migrate/legacy.ts`)로 묶고, 그 뒤는 마일스톤마다 버전 하나씩 올렸다. 옛 버전을 처음 옮길 때 원본을 `…:vN.bak`(localStorage 키)에 한 번 남긴다. 옛 키는 새 키가 없을 때만 읽는다(개발판은 버전이 같고 모양만 옛것일 수 있다).

| 버전 | 마일스톤 | 옛 키 → 새 키 | 규칙 |
| --- | --- | --- | --- |
| v14 | E302 | `chosen: God[]` → `pantheon {hand, heart, breath[]}` | hand = heart = `chosen[0]`, breath = `chosen[0]`·`chosen[1..]`을 숨 칸 수까지. 옛 주신은 한 신에 몰기가 되어 힘이 거의 같다 |
| | | 칸·가방의 신화 유물 id → `relicsLit[]` | 칸을 비우고 유물표에 켬, 유물 단계 그대로 |
| v15 | E303 | `materials`의 신화권 재료 → `materials.prototype` | 옛 신화권 재료는 원형 셋씩(대장간 값 ×3과 맞춤), 재료 유물은 원형 27. 가방이 12칸을 넘으면 낮은 등급부터 원형으로 녹이고 첫 화면 카드로 알림 |
| v16 | E304 | `training {xp, taken}` → `expedition {count, …}` | 지금 판을 원정 하나로 본다. 원정 번호는 장 진행이 지나온 할 일 「귀환」으로 짐작(`estimateExpeditions`), 원정 기록이 있으면 적힌 수와 짐작 가운데 큰 쪽(E306 D18). 명성·불씨는 주지 않는다(신 단계가 그대로라 힘이 같다) |
| v17 | E305 | `trials` → `oaths`, `rift` → `endless`, `threat` → `depth`, `divine` → `heartGauge`, `conveniences` → `automation`(켠 성소는 `waypoints`), 탭 id `classes`·`looks` → `gods`·`trials` → `oaths` | 맹세는 짝인 시련을 깼으면 지킨 것으로(기록 480초), 시련 난이도의 모든 피해 몫과 밝힌 별(하나마다 20)은 명성으로 돌려준다(`migrate/v17.ts`). 엔딩을 봤으면 귀환 횟수를 3 이상으로 쳐 자동화를 유지. 없어진 할 일(`level`·`choose`)은 사실로 다시 판정. 새 키 `expedition.oathPending`·`deepWin`·`mount`는 없으면 거짓(탈것은 고개나 그리스 땅에 들어섰으면 참) |

- **견본 시험 (`tests/save.test.ts`):** v1·v9·v12·v13·v15·v16 실제 모양 견본을 최신으로 올린 뒤 (1) 검사 통과 (2) 공격 지수가 옮기기 전의 0.9~1.1배 (3) 깨운 신·장 진행·웨이포인트가 같음을 본다. 성좌판의 별을 가진 엔딩 뒤 저장은 별 하나마다 명성 20이라 정복 둘에서 공격 지수 ×1.56으로 이 띠 밖이다(`BALANCE.md` 11장, E307에서 다시 본다).
- **왕복 시험 (`tests/saveRoundTrip.test.ts`, E307 0B):** 꽉 찬 지금 버전 견본(`tests/fixtures/save-v17-full.json`)을 글 왕복(읽기 → 쓰기 → 읽기)과 게임 왕복(`tests/helpers/saveBench.ts`: 진짜 `Persistence`와 기록 클래스들로 불러오기 → 저장)으로 돌려 같음을 본다. 옛 견본 여섯도 옮긴 뒤 게임 왕복을 돈다. 모르는 키는 버리고(더 새 판이 쓴 칸을 옛 판이 저장하면 지운다), 왕복에서 바뀌는 칸(둘째 장신구 칸 → 첫째 칸, 깨달음보다 많은 마디, 숨 칸을 넘친 신, 원정 시간 반올림, 읽을 때 자르는 끝)은 「지금 동작」으로 못박아 두었다. 저장에 칸을 더하면 견본에도 값을 채운다(「꽉 차 있다」 시험이 알려 준다).
- **읽지 못한 저장 (`saveStorage.unread`, E307 0B):** 더 새 버전이 쓴 저장이나 깨진 글은 `parseSave`가 null이라 그 슬롯에서 새로 시작할 수 있다. 덮이기 전에 원본을 옆 키에 남긴다: 더 새 버전은 `…:unread-vN.bak`, 깨진 글은 `…:unread-broken.bak`(옮기기 백업 `…:vN.bak`과 겹치지 않는 이름. 같은 글은 한 번, 다른 원본은 `.2`~`.4`에, 먼저 남긴 것은 덮지 않는다). 슬롯을 읽을 때와 고를 때(`use`), 그리고 저장할 때 슬롯의 글이 이 실행이 쓴 것과 다르면(열어 둔 옛 탭) 남기므로 처음 화면을 거치지 않는 길도 지킨다. 처음 화면은 그 칸을 「읽지 못한 저장」으로 보인다(`TitleScreen`의 `UnreadSlot`). 되살리는 단추는 없다(`troubleshooting.md`).
- 형식을 바꾸면 옮기는 함수와 견본 시험을 함께 만든다(위 「지켜 온 원칙」).

## 하나로 이어진 세계 (E19, 떠다니는 원점)

| 곳 | 하는 일 |
| --- | --- |
| `src/data/world.ts` | 칸·통로 계산. `regionLinks(regions, id)`(그 땅의 통로: 지역 안 좌표의 통로 네모, 넘어갈 때 옮길 `shift`, 축·방향·가운데), `walkRects`(땅 네모 + 통로), `crossingAt`(통로 가운데를 1m 넘었나) |
| `src/world/colliders.ts` | `WalkArea`(움직일 수 있는 네모들과 격자 반 폭 `reach`), `clampToArea`·`inArea`. 주인공(`HeroController.area`)·적(`GiantWorld.area`)·길찾기(`NavGrid`, 밖은 막힌 칸)가 같은 것을 쓴다. 끝없는 원정 층은 `squareArea` |
| `src/world/terrain.ts` | 땅 높이·땅 무늬·경계 물결(`edgeWave`)은 세계 좌표로 잰다: `setTerrainOrigin`, 이웃 조각은 `withTerrainFrame(원점, 땅 모양 Land, fn)` 안에서 짓는다 |
| `src/world/regionMap.ts` | `Chunk`(땅 하나 또는 빈 칸 숲), `chunkSteps`·`fillerSteps`(단계로 나눠 짓기), 숲 `buildForest`(가장자리·깊은 숲, 6m 네모마다 InstancedMesh, 깊은 숲은 `plain` 단순한 나무), 경계 섞기 `edgeMixer`·`cellTheme`. `RegionMap`은 지금 땅 조각을 쥐고 `adopt`로 이웃 조각을 넘겨받는다 |
| `src/game/Stage.ts` | 지금 땅 + 이웃 여섯을 그린다(`planNeighbors`, 프레임마다 한 단계 `buildNext`, 점검은 `flush`). `cross(to)`로 지금 땅을 바꾸고, `follow`에서 통로 안 하늘빛을 섞는다 |
| `src/game/Encounter.ts` | 지금 땅의 무리(`camps`·`boss`)와 이웃 땅에 남겨 둔 무리(`parked`, 땅 id별). `setNeighbors`(이웃 땅 배치와 칸 자리 차이)로 이웃 무리를 줄 세우고 `buildStep`으로 프레임마다 무리 하나(땅 조각을 짓지 않는 프레임에만, Game이 부름). `cross`는 모두 옮긴 뒤 앞 땅 무리를 남겨 두고 넘어간 땅 무리를 깨운다(쫓던 적·쓰러지는 적은 지금 땅 적으로 남음). 남겨 둔 거인은 `Giant.park`·`rest`(숨쉬기만), 옮길 때 `Giant.shift`(집·길·예고·던진 것까지) |
| `src/enemies/Giant.ts`의 줄 (E241) | 집에서 줄(`leashRange`) 넘게 나가면 `return`: 집으로 걸으며 `returnRegen`만큼 찬다. 다시 쫓는 것은 집에서 줄의 `LEASH_REENGAGE`(0.75) 안에서만(알아챔·맞음·포효 모두, `mayReengage`), 거리 두는 적의 물러서기는 집에서 (줄 − `BACKOFF_LEASH_MARGIN`)m까지만 |
| 지도 (E19-05, E307) | `Minimap.setRegion(region, { neighbors, passages })`: 이어진 세계면 반 폭 70m로 통로와 이웃 땅까지 흐리게, 세로 화면은 지금 땅 반 폭 + 6m로 당겨서(`minimapView`). 표시는 `MARKS`(속 + 어두운 테두리의 픽셀 그림)를 `stamp`로 찍고(자리는 `stampAt`: 목표와 「나」는 그림 밖이면 가장자리로 당긴다), 색·명암비 규칙은 `tests/minimap.test.ts`(명암비 셈은 `src/art/contrast.ts`). 세계 지도(`menu/mapTab.ts`)는 `world.nodes()`의 칸 자리(칸 한 변 = 1)·땅 너비와 `world.me()`(내 자리)를 그린다. 자리 셈은 DOM 없는 `menu/mapLayout.ts`: `layoutMap`이 탭 몸에서 잰 넓이에 판을 px로 놓고(세로로 긴 판은 북쪽이 위에 엔딩 전에는 줄기만(`nodes().later`), 가로 판은 화면 방향으로 45°), `placeLabels`가 이름을 차례(`labelRank`)대로 표시·다른 이름과 겹치지 않는, 제 표시에 붙은 자리에 놓는다(남의 표시에 더 가까운 자리는 고르지 않는다: 표시의 바깥 `markRim`에서 잰 `away`·`reads`). 땅마다 표시 위 44px 단추(`.menu-map__spot`)와 이름 단추(`.menu-map__label`)가 워프한다(판을 그린 뒤 0.5초 안의 누름은 설명만, `SETTLE_MS`). 창 크기가 바뀌면 `ResizeObserver`가 다시 그린다 |
| `src/game/World.ts` | `update`에서 `crossingAt`이면 `cross(link)`: 주인공·카메라·떨어진 것을 `shift`만큼 옮기고, 무대·길찾기·적을 새 땅으로, 그다음 가던 길을 다시 찾는다(`orders.shift`). 출구 밟기·암전은 끝없는 원정에만 남았다 |

## 장 흐름 (E22)

| 곳 | 하는 일 |
| --- | --- |
| `src/data/chapters.json`·`chapters.ts` | 장 다섯: 제목·이름·땅 단계(`tier`)·열리는 땅과 적 지수(`lands`)·할 일(`steps`: enter·awaken·boss·forge·return·mount(E241: 그 땅의 고개지기를 만남, `ChapterWorld.mounted`), 목표 한 줄 `goal`. 성소 고르기 choose와 보스가 여는 신화권 `opens`는 E305-03에서 없앰). `landScale`(적 지수 → 생명·피해 배율), `chapterOf` |
| `src/progress/Chapters.ts` | `ChapterProgress`: 들어선 땅·이긴 보스(저장), 지금 장(`index`·`chapter`)·목표(`goal`)·열린 땅(`isOpen`)·땅 세기(`power`)·땅 단계(`tier`). 신화·유물은 `ChapterWorld`로 묻기만 한다 |
| `src/game/systems/Chapters.ts` | 땅 들어섬·보스 처치를 적고 `chapterChanged`·`goalChanged`를 보낸다. `goalView`(목표 한 줄과 채우는 막대) |
| `src/game/systems/Wake.ts` (옛 `Awakening`, 데이터 `src/data/wake.ts`, E305-04에서 원천 「각성」과 이름을 가름) | 신을 여는 길은 조각 셋 하나(E305-03: 그리스도 제우스를 깨움, 성소의 신화 고르기 `MythChoice` 없앰). 흔적의 형편은 순수 함수 `traceStateOf`(E241)가 정하고, 데모의 그리스 셋(`afterEnding`)은 엔딩 전에는 `later`라 무리·빛기둥·목표·봇 대상이 되지 않는다. 신을 하나 더 깨우려면 1 + 귀환 + 장 정복보다 적어야 한다(`mayWake`). 유물로 신이 열리는 것은 엔딩 뒤뿐(`Relics.unlock`), 점검용 실행(`?relics=`)은 `Game`이 끼고 시작한 신화 유물의 신을 연다 |
| 탈것 (E241) | `src/data/mount.ts`(`MOUNT`·`KEEPER`), `progress/Mount.ts`(얻었나, 저장 키 `mount`), `systems/Mount.ts`(`MountSystem`: 고개지기 2.5m 안이면 `give()` → 버스 `mountGained`·카드(장 진행이 듣고 목표·결계를 다시 셈), 타려는 걸음 `orders.wantRide`이면 `canRide()` = 얻음·살아 있음·`combat.calm`(맞은 지·싸운 지 3초)·묶이지 않음일 때 태우고 `rode`, 탄 산양·고개지기 곁 산양). 타는 규칙은 `HeroOrders.press`(15m 넘게 누르면 `wantRide`, 적을 누르면 내림)·`tryRide`(봇)·`steer(ground, far)`(조이스틱을 멀리 끎), 내리는 것은 `HeroController.update`(길이 끝나면, `holding`이면 그대로)·`stop`·`teleport`. 탄 동안 `PlayerCombat`은 싸우지 않고 `RelicSystem`은 `skills.enemies = []`로 유물을 재우며 `Damage.hitHero`는 유물의 끼어들기를 건너뜀(바람 각성 피하기는 그대로). 모델 `voxel/models/mount.ts`·`world/mountModel.ts`(`buildGoat`, 앉는 높이 `GOAT_SEAT`) |
| `src/world/Barriers.ts`, `World.openLinks`·`refreshLinks` | 막힌 땅으로 가는 통로는 걸을 수 있는 곳에서 빼고 입구에 결계를 세운다. 장이 바뀌면 빛기둥과 함께 풀린다 |
| `Encounter.landPower` | 땅 id → 적 지수. 무리·보스·수호자에 깊이 배율과 곱해 건다(`scaled`) |
| `ui/ChapterHud.ts` | 목표 한 줄(채우는 목표면 막대)과 장 제목 띠. 지도 탭은 `world.goal()`·`nodes().locked`, 작은 지도는 `HudFeed.goalSpot()`(게임에서는 `game.goalSpot()`) |
| 엔딩 | `ChapterFlow`: 마지막 장이 끝나면(`chapterChanged`의 chapter가 null) 엔딩 장면 → `showEnding`(`reachEnding` + 띠·카드). 개발 패널 「목표 건너뛰기」·「장 건너뛰기」는 `DevTools.skipGoal`(`game.skipGoal()`) |

## 순간의 크기 (E23)

| 곳 | 하는 일 |
| --- | --- |
| `src/data/moments.ts` | 사건 id → 등급(1 작은 알림·2 카드·3 큰 카드·4 장면), 느린 동작(1.2초 × 0.25)과 카드 뒤 기다림(2.6초) |
| `src/game/systems/Moments.ts` | 버스의 `moment`를 받아 등급대로 보인다. 1은 바로, 나머지는 온 차례대로 줄을 세운다. 장면 중·땅을 옮기는 암전 중·느린 동작 중에는 기다리고, 장면이 끝나면 그 순간의 카드와 `after`(장 제목 띠·엔딩 뒤 장치). `holding`이면 `Storyline`이 처음 보는 일의 짧은 대화를 미룬다. 장면은 `storyline.play(id, true)`로 연다 |
| 보내는 쪽 | `Progression`(신화 단계·신화 개방·보스 재료), `Relics`(벼리기·장비·고른 신화), `Wake`(신의 조각·깨어남), `Chapters`(장 보스·장 정복), `ChapterFlow`(장 넘어가기·엔딩)·`World`(성소 찾음), 엔딩 뒤 장치(`Depth`·`Oaths`·`Endless`) |
| HUD | `Hud.showGains(..., size)`: `card`는 오른쪽 위 작게, `big`은 가운데 크게. 장면 중 HUD는 투명하게만 숨긴다(띠 움직임이 다시 돌지 않게). 위아래 검은 띠는 `HudFeed`의 `.letterbox` |
| 곡 | `SoundSystem.theme()`이 프레임마다 고른다. 장면·고르기의 곡은 버스의 `music` |
| 빠르기 | `Feel.slow`·`timeScale`: `Game.update`에서 게임 시간만 느려진다. `Game.advance`(봇·점검의 감기)도 순간을 흘린다 |

## 휴대폰 (E235)

| 곳 | 하는 일 |
| --- | --- |
| `src/input/device.ts` | 터치 기기 알아보기(주 포인터가 손가락, `?touch`), 휴대폰을 가로로 들었나(`wantsPortrait`: 짧은 변 600px 미만만, 태블릿은 가로도 된다), 화면이 휴대폰 조작인가(`touchUi`: html의 `is-touch`) |
| `src/main.ts` | 터치 기기면 html에 `is-touch`, `RotateHint`(가로로 들면 안내), Game 옵션 `touch`·`suspended`(안내가 떠 있으면 `paused`, 그리지도 않는다) |
| `src/input/touch.ts` | 손가락 몸짓 상태 기계(DOM 없음, `tests/touch.test.ts`): 톡(짧게·거의 안 움직임, 그 프레임에 읽지 않으면 버림. 조이스틱을 쥔 손가락만 아니면 톡이라, 쥔 채 다른 손가락으로 누른 것과 겹쳐 누른 두 엄지도 톡이다), 끌기(누른 자리의 조이스틱, 원은 뗄 때까지 그 자리, 손잡이만 원 안에서. 혼자면 12px 넘게 끌릴 때 잡고, 따로 닿아(0.25초 밖) 제자리에서 쉬는 손가락 곁에서는 원 가장자리(48px) 넘게 끌릴 때 잡는다: 쥔 손이 화면에 닿아 있어도 걷고, 벌리고 오므리는 두 손가락은 그 전에 확대로 잠긴다), 두 손가락(E307: 닿는 것만으로는 확대가 아니다. 둘 다 12px 넘게 움직이고 사이 거리가 24px·8% 넘게 바뀌면 확대로 잠기고(`pinch`는 잠긴 순간부터의 배율, `pinchCount`는 잠긴 횟수), 조이스틱을 쥔 동안(두 손가락이 0.25초 안에 함께 닿은 때는 빼고)·40px보다 가까운 두 접점은 잠기지 않는다. 손가락 수가 바뀌면 풀리고 다시 잰다. 잠긴 뒤로는 다 뗄 때까지 걷기·톡 없음). 뗀 것을 놓쳐도 꼬이지 않게 처음 대는 손가락(`isPrimary`)·창이 가려짐(blur·visibilitychange·pagehide)에 손가락을 모두 잊는다(`reset`) |
| `src/input/TouchControls.ts` | 캔버스의 손가락 포인터 사건 → 몸짓, 조이스틱 원·손잡이 그리기. 톡은 `Input.frameEnd`에서 버린다(`PlayerInput.useTouch`). 마우스는 `Input`이 받고 손가락은 받지 않는다(`ignoreTouch`). 캔버스의 `touchstart`를 막아 아이폰 사파리의 길게 누르기 돋보기·글자 선택이 뜨지 않게 한다(포인터 사건은 그대로 온다, E307) |
| `PlayerInput.updateTouch` | 두 손가락 → 확대로 잠긴 동안만 `onZoom`(잠긴 때의 시야 ÷ 배율. 한계 안 시야 높이가 2% 넘게 바뀌거나 한계에 닿을 때만, 바꿨으면 떼면 설정에 저장), 톡 → `orders.press`(클릭과 같다, 적 몸통에서 28px 안이면 그 적. 조이스틱을 쥔 채 누른 톡이면 조이스틱을 쉬게 하고(`parked`), 그 지시를 마치거나 손잡이를 10px 넘게 움직이면 조이스틱이 이어받는다), 조이스틱 → 화면 방향을 땅 위 방향으로 바꿔 주인공 앞 2.5m로 `orders.steer`(이동 지시가 끊겼으면 쥔 채로도 다시 내린다), 놓으면 `orders.clear` + `hero.stop`. 대화가 막 끝난 0.5초(`DialogScene.settling` → `muted`)의 톡·클릭은 지시가 아니다(연타로 넘기던 톡이 곁의 마을 사람에게 다시 말을 걸지 않게, E307). 그동안이나 장면이 닫히는 중에 누른 마우스를 누른 채 있으면, 가라앉는 프레임에 누른 것으로 친다(`PlayerInput.update`의 `heard`: 누른 채 끌어 걷기가 뗐다 다시 누를 때까지 죽지 않게) |
| 페이지 확대 막기 | 두 번 눌러 확대는 `index.html`의 `* { touch-action: manipulation }`(캔버스는 `none`), 창·HUD 위 두 손가락 확대는 `main.ts`의 `gesture*` 막기. 0.3초 `touchend` 가드는 이어 누른 단추의 click을 지워 E307에서 걷었다. 글자 선택·돋보기는 `body`의 `user-select: none`·`-webkit-touch-callout: none`과 캔버스·대화 상자의 `touchstart` 막기 |
| 시야 설정 | `src/save/settings.ts`: 터치 기기는 시작할 때 잘못 저장된 시야를 한 번 기본값으로 되돌리고 표시(`viewReset`)를 남긴다(`loadOnTouch`, E307). 일시 정지 메뉴 설정의 「시야 · 되돌리기」는 `Viewport.change({ viewHeight })`로 저장하고 화면을 바로 맞춘다 |
| 화면 | 카메라·렌더 크기는 `visibleHeight`로 세로 화면을 늘린다(픽셀 맞춤은 실제 보이는 세로로, 카메라는 80m 뒤라 가장 넓게 봐도 near 면에 잘리지 않는다). 렌더 픽셀은 화면 픽셀보다 작게 하지 않는다(`computeRenderSize` 배율 1 이상). 배치는 `src/ui/portrait.css`(비 4:5보다 좁을 때, `:root`를 붙여 다른 스타일을 이긴다), 상태·장비 탭은 `menu.css`의 `max-width: 600px`(장비 탭은 설명 카드를 가방 바로 아래로) |

## 수련 (E236)

| 곳 | 하는 일 |
| --- | --- |
| `src/data/training.ts` | 갈래 넷(뿌리·힘·몸·손)과 마디 스물둘(자리·앞 마디·수치), 깨달음 문턱(`insightsAt`, 60 + 25 × (k − 1)), 데이터 검사(`checkTraining`) |
| `src/progress/Training.ts` | 모은 경험치·찍은 마디. `gain`(새 깨달음 수), `canTake`·`take`, `reset`(무료), `stats`(같은 종류끼리 더함), 저장 모양(`parseTraining`) |
| `Progression.gainXp` | 처치 경험치를 수련(기세)에 더하고, 깨달음을 얻으면 `insightGained` (신화 경험치는 E305-03에서 없앰). `train`·`untrain`은 찍고 되돌리며 최대 생명을 다시 맞춘다 |
| `Build.inputs` | 찍은 마디 수치를 맹세 보상과 같이 `bonus`로 더한다 (전투는 기존 수치 종류 그대로, 균열 축복은 E305-03에서 걷음) |
| `MenuWiring` | `insightGained` → 메뉴 단추 표시(`markTab('training')`)와 작은 알림(`insight`). 첫 깨달음은 수련 탭이 열리는 카드가 대신 알린다 |
| `src/progress/Tabs.ts` | 정보 화면 탭을 차례로 (E236-05): 차례로 여는 탭 여섯과 여는 때(`STEP_TAB_DEFS`, `tabsDue`), 연 탭(`TabUnlocks`, 저장 v11 `tabs`, 옛 저장은 모두 열림 `parseTabs`) |
| `systems/Tabs.ts` | `TabSystem`: 장비·신화·벼리기·`progressChanged`마다 지금 상태(`facts`)를 보고 열 때가 된 탭을 연다. 열면 카드(`tabOpened`, 등급 2, 같은 사건의 더 큰 순간 뒤에 서도록 한 박자 늦게)와 메뉴 단추 표시(여럿이면 차례의 첫 탭). 불러온 뒤에 켜고(`ready`), 점검용 실행(`allTabs`)·엔딩 뒤에는 모두 연다. 메뉴는 `host.tabOpen`으로 숨길 탭을 가린다 |
| `src/ui/menu/trainingTab.ts` | 깨달음·다음 점 막대·찍은 수치의 합·모두 되돌리기(한 번 더 눌러야), 트리(가로 %·세로 px, SVG 줄). 손가락은 처음 누르면 설명 |
| 땅 차례 | `ChapterProgress.isOpen`: 지금 장의 땅은 그 땅에 들어서는 할 일 바로 앞까지 했을 때 열린다. `goalChanged`에도 결계를 다시 맞춘다(`World.refreshLinks`) |

## 땅 높낮이 (E24-07)

| 곳 | 하는 일 |
| --- | --- |
| `regions.json`의 `terraces` | 계단식 땅: 꼭짓점·높이(0.5m 단위)·계단(아랫땅 발치 from → 윗면 to, 너비). 검사는 `regions.ts`의 `parseTerrace`(윗끝은 안, 발치는 밖) |
| `world/terrain.ts` | 땅 모양 `Land`(연못·계단식 땅)를 `setLand`로 넣는다(옛 `setPonds`). `heightAt` = 바탕 땅(기복·연못)과 계단식 땅 가운데 높은 것, 계단 위면 발치에서 윗면까지 고른 비탈. `baseHeightAt`은 계단식 땅을 뺀 바탕(바닥 판). `cliffColliders`: 높이가 0.4m 넘게 갈리는 변과 계단 옆을 0.5m마다 둥근 충돌로 막는다(계단이 지나는 곳은 트임). `rayToLand`: 화면 광선이 처음 닿는 땅(위에서부터 0.1m씩 내려가며 찾고 반으로 좁힘) |
| `buildTerraces` | 바닥 판 위에 0.5m 복셀 기둥으로 쌓는다(윗면은 바닥과 같은 땅 색·길, 옆면은 흙과 돌 켜). 계단은 0.25m 단의 돌계단 |
| `regionMap.chunkSteps` | 조각을 지을 때 계단식 땅을 쌓고 절벽 충돌을 더한다. 길찾기는 이 충돌을 피해 계단으로 돈다 |
| `PlayerInput.groundAt` | 계단식 땅이 있으면 `rayToLand`, 없으면 평면 하나 |
| 모양 규칙 | 변과 계단은 세계 축에 맞춘다: 쿼터뷰에서 화면의 사선이 되어 깨끗하고, 세계 대각선 변은 복셀이 톱니로 보인다 |
| 개울 `regions.json`의 `streams` | 꺾은선과 폭. `regionMap`이 돌 둑·물·깊은 물 세 겹 띠로 그리고(`ribbon`, 바닥 판 높이를 따른다), 물길을 0.5m마다 둥근 충돌로 막는다(`streamColliders`). 다리(`bridge` 소품) 자리만 트여 있고, 다리는 난간만 막는다(`bridgeRails`) |
| 길목 `voxel/models/roadMarks.ts` | 출구마다 가는 땅의 모습으로 선 문: 북유럽(눈 덮인 통나무 문·룬 돌)·그리스(대리석 기둥과 박공)·중국(푸른 기와 패루)·일본(도리이와 석등)·한국(홍살문)·마을(짚 지붕 어귀 문)·갈라진 하늘(무너진 아치). `regionMap.buildGate`가 가는 땅으로 고르고(모양은 조각끼리 함께 씀), 통로가 난 변에 나란히(세계 축) 세워 쿼터뷰에서 늘 비스듬한 정면이 보인다. 갈 곳의 색 빛기둥은 그대로 |
| 마을 소품 `voxel/models/village.ts` | 목책(3.9m 한 칸)·망루·족장의 긴 집·이층집·대장간(불 아가리 빛·굴뚝 연기, `makeForge`)·장터 노점·나무다리 |
| `scripts/gen-village.mjs` | 마을을 규칙으로 짓는다: 광장 1.5m·족장의 터 3m·계단 일곱·길, 개울(북 → 연못 → 남)과 다리 둘, 건물(긴 집·노점·우물·대장간·집 일곱), 둘레 22.5m 목책(길·개울 자리는 비움)과 망루 셋, 사람 자리. 문과 길 바깥 끝은 세계 통로 자리 그대로 |

## E14에서 걷어낼 것

옛 순환(`src/progress/Cycle`, `systems/CycleSystem.ts`): 원천 결정·단련·윤회·별자리(→ E17 성좌판)·원천 숙련. 저장을 옮기며 제거한다.
