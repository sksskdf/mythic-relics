# 코드 구조 요약

폴더별 내용은 `CLAUDE.md`의 "코드 지도"가 원본이다. 여기에는 **고칠 때 지켜야 할 원칙**과 **E11에서 바꿀 곳**을 둔다.

## 지켜 온 원칙

- **데이터가 먼저:** 유물·신·적·클래스 트리·지역은 `src/data/*.json`. 형식과 검사는 `schema.ts`·`regions.ts`이고, 빌드할 때 데이터 검사가 돈다. 수치는 JSON에서 고치고 `BALANCE.md`와 봇 결과를 함께 고친다.
- **유물 효과는 조립:** 충전(무엇을 하면 차나) × 터지는 때 × 하는 일. 새 "하는 일"이 필요할 때만 `src/skills/actions.ts`와 `schema.ts`의 ACTION_PARAMS에 더한다.
- **시스템끼리는 버스로만:** `src/game/systems/*`는 `events.ts`의 이벤트 버스로 주고받고, 공용 상태는 `context.ts`. 시스템이 서로를 직접 부르지 않는다.
- **모델은 코드로:** 복셀 격자 → 메시(`src/voxel/mesher.ts`, 같은 면을 크게 묶는 greedy 방식). 적은 몸 종류 여섯(giant·beast·humanoid·flyer·spirit·serpent)을 생성기로, 클래스 외형은 `gen.ts` 생성기로.
- **색에는 뜻이 있다:** `src/art/palette.ts`. 위험(적 공격 예고) 색은 적만 쓰고, 내 연출 색이 위험색처럼 보이면 `tests/art.test.ts`가 막는다 (`readsAsDanger`). UI 토큰(`theme.css`)과 팔레트 값이 같아야 한다.
- **UI는 디자인 시스템:** `theme.css`의 토큰만, 갈무리 픽셀 글꼴 10/12/15px와 그 배수만.
- **테스트 층:** 단위(`tests/*.test.ts`, vitest는 `tests/`만 봄), 스모크(`scripts/smoke.mjs`, 브라우저로 실제 화면), 봇(`scripts/playtest.mjs`), 적 시험(`enemy-trial.mjs`), 성능(`bench.mjs`), 모습 모음(`enemy-sheet.mjs`, `class-sheet.mjs`).
- **개발 도구도 같이:** 새 시스템을 만들면 개발 패널(`src/dev/DevPanel.ts`)에 시험 단추를 더하고, 봇(`src/dev/autoplay.ts`)이 그 시스템을 쓰게 한다.
- **저장은 옮기기 테스트로:** 지금 v3 (`src/save/SaveData.ts`, v1·v2도 읽음). 형식을 바꾸면 옛 판을 옮기는 함수와 테스트를 함께 만든다.

## E11에서 바꾼 곳 (끝)

| 곳 | 바꾼 뒤 |
| --- | --- |
| `src/game/Game.ts` | 957줄 → 870줄 안팎. 지역 이동은 `World`, 개발 지름길은 `src/dev/DevTools.ts`(`game.dev.*`), 시작 화면 뒤 장면은 `TitleBackdrop`. Game에는 `enterRegion`·`travelTo`·`regions`·`exitsLocked` 위임만 남김 |
| 빌드 상태 | `src/build/BuildState.ts`의 `computeBuild(inputs)`: 열린 신화(수집 보너스 `collected`)·올린 단계(×1.35^n)·고른 신화·장비(일반 장비 수치, 유물 기본 수치는 `Build`가 `relicStats`로 넣음)·원천 → 피해 배율·지속 효과(깨어난 유물만)·받는 피해·이동 속도·공격 리듬·최대 생명, 수치 합 `stats`(별을 밝힌 신화의 수치 포함). 게임 안에서는 `ctx.build`(`Build`, 부를 때마다 계산, `chosen`·`level`은 가볍게). `tests/build.test.ts`가 E21 공식을 지킨다 |
| 세계 (E15) | 지역 16곳: `RegionDef.zone`(entrance·deep·boss)·`elite`. `nextHop`(봇·지도의 다음 이웃), `worldLayout`(지도 자리). 대화 장면은 `Game.story(id)`가 처음 보는 일에만 열고, 대화 중에는 세계가 멈춘다 |
| `src/gear/` | `Loadout`(칸 7·가방·일반 장비 `gear`·유물 단계 `stages`·재료 `materials`), `roll.ts`(일반 장비 굴리기와 단계 `tier`·`landTier`·`landChances`, id는 `g:`로 시작), `mythRelic.ts`(신화마다 유물 하나와 부위·단계, 기본 수치 `relicStats`, 깨어남 `relicAwake`, 효과 배율 `effectScale`, 나머지 유물은 엔딩 뒤 재료), `materials.ts`(신화권 재료·보스 재료와 드랍), `forge.ts`(장 보스 규칙으로 만드는 제작법·제작·분해), `Pickups`, `DropTable`(엔딩 뒤 유물 드랍). 칸에는 유물 id와 장비 id가 섞여 들어가므로 유물만 다루는 곳은 `isRelicId`나 `loadout.relics`로 거른다 |
| `src/myth/` | `manifest.ts`(고른 신화·가호 판정, 옛 발현 규칙 `legacyManifest`는 옛 저장과 히든 신화만), `ClassProgress`(개방 단계 0~4·경험치, 단계 상한 `levelCap`(데모 3, 엔딩 뒤 4), 경험치 받는 신화 `masteryShares`, 큰 걸음 `PER_PROMOTION`·수집 보너스 `PER_OPENED`), `levelGains`, `alwaysText`(수치·수집 보너스·별 글) |
| `src/progress/Ending.ts` | 엔딩 뒤 장치를 여는 한 곳 (E21-06): 위협 단계·시련·균열·편의·신화 4단계·유물 3·4단계·유물 드랍. `game.reachEnding()`이 열고 저장에 남는다 |
| 원천·위협 단계 (E14) | 빌드 상태에 `sources`(장비의 합, E21-05에서 원천 숙련·공명을 없앰)·`awakening`(0~3). 각성 효과는 `powers.awakening`(`SourceAwakening`)이 기본 공격·처치·걸음·피격에서 돌고, 배율(기본 공격·모든 피해·공격/이동 속도·받는 피해)은 Game이 매 프레임 전투·이동에 곱한다. 위협 단계 배율은 `encounter.threat`·`eliteChance`로 새로 세우는 적에 건다 |
| 읽는 길 | 게임 시스템은 지금 신화·단계를 `ctx.build.chosen`·`ctx.build.level`로 읽는다. 장비 칸 자체를 다루는 곳(장착·저장·유물 화면)은 `powers.loadout`을 본다 |

## 2차 스프린트 중간 점검에서 나눈 곳 (2026-10-27)

| 곳 | 나눈 뒤 |
| --- | --- |
| `src/ui/GameMenu.ts` | 1279줄 → 225줄. 틀(탭 줄·힌트·여닫기)만 남기고 탭은 `src/ui/menu/`: `statusTab`·`sourcesTab`·`trialsTab`·`riftTab`·`mapTab`는 함수(`renderX(ctx, body)`), 기억할 것이 있는 장비·신화 탭은 클래스(`RelicsTab`의 고른 칸·커서 올린 것, `MythTab`의 눌러 본 신화). 탭이 쓰는 것은 `TabContext`(host·힌트·다시 그리기·닫기), 게임에서 읽는 형식은 `menu/host.ts` |
| `src/game/Game.ts` | 1278줄 → 861줄. 정보 화면에 넘길 값과 할 일·능력치·설명 카드 상태는 `MenuData`, 대화 장면을 여는 때와 미루기·말 걸기는 `Storyline`, 공격 궤적·원거리 공격 모습은 `AttackFx`, 커서 아래 카드·이름표는 `HoverCards`. Game에는 `story`·`storyScenes`·`sourceRows` 위임이 남음 |

새 탭은 `src/ui/menu/`에 파일을 만들고 `GameMenu.render`에 한 줄을 더한다. 탭이 게임에서 읽을 것은 `menu/host.ts`의 형식에 더하고 `MenuData.host()`에서 채운다.

E12~E14에서 새 규칙을 넣을 때는 `BuildInputs`에 재료를 더하고 `computeBuild`에서 계산을 늘린다. 시스템이 장비·신화를 직접 읽어 따로 계산하지 않는다.

## 하나로 이어진 세계 (E19, 떠다니는 원점)

| 곳 | 하는 일 |
| --- | --- |
| `src/data/world.ts` | 칸·통로 계산. `regionLinks(regions, id)`(그 땅의 통로: 지역 안 좌표의 통로 네모, 넘어갈 때 옮길 `shift`, 축·방향·가운데), `walkRects`(땅 네모 + 통로), `crossingAt`(통로 가운데를 1m 넘었나) |
| `src/world/colliders.ts` | `WalkArea`(움직일 수 있는 네모들과 격자 반 폭 `reach`), `clampToArea`·`inArea`. 주인공(`HeroController.area`)·적(`GiantWorld.area`)·길찾기(`NavGrid`, 밖은 막힌 칸)가 같은 것을 쓴다. 균열 층은 `squareArea` |
| `src/world/terrain.ts` | 땅 높이·땅 무늬·경계 물결(`edgeWave`)은 세계 좌표로 잰다: `setTerrainOrigin`, 이웃 조각은 `withTerrainFrame(원점, 연못, fn)` 안에서 짓는다 |
| `src/world/regionMap.ts` | `Chunk`(땅 하나 또는 빈 칸 숲), `chunkSteps`·`fillerSteps`(단계로 나눠 짓기), 숲 `buildForest`(가장자리·깊은 숲, 6m 네모마다 InstancedMesh, 깊은 숲은 `plain` 단순한 나무), 경계 섞기 `edgeMixer`·`cellTheme`. `RegionMap`은 지금 땅 조각을 쥐고 `adopt`로 이웃 조각을 넘겨받는다 |
| `src/game/Stage.ts` | 지금 땅 + 이웃 여섯을 그린다(`planNeighbors`, 프레임마다 한 단계 `buildNext`, 점검은 `flush`). `cross(to)`로 지금 땅을 바꾸고, `follow`에서 통로 안 하늘빛을 섞는다 |
| `src/game/Encounter.ts` | 지금 땅의 무리(`camps`·`boss`)와 이웃 땅에 남겨 둔 무리(`parked`, 땅 id별). `setNeighbors`(이웃 땅 배치와 칸 자리 차이)로 이웃 무리를 줄 세우고 `buildStep`으로 프레임마다 무리 하나(땅 조각을 짓지 않는 프레임에만, Game이 부름). `cross`는 모두 옮긴 뒤 앞 땅 무리를 남겨 두고 넘어간 땅 무리를 깨운다(쫓던 적·쓰러지는 적은 지금 땅 적으로 남음). 남겨 둔 거인은 `Giant.park`·`rest`(숨쉬기만), 옮길 때 `Giant.shift`(집·길·예고·던진 것까지) |
| 지도 (E19-05) | `Minimap.setRegion(region, { neighbors, passages })`: 이어진 세계면 반 폭 70m로 통로와 이웃 땅까지 흐리게. 세계 지도(`menu/mapTab.ts`)는 `world.nodes()`의 칸 자리(칸 한 변 = 1)·땅 너비와 `world.me()`(내 자리)를 화면 방향으로 45° 돌려(`view`) 그린다. 이름은 겹치지 않는 자리(아래·위·왼쪽·오른쪽)를 골라 얹는다 |
| `src/game/World.ts` | `update`에서 `crossingAt`이면 `cross(link)`: 주인공·카메라·떨어진 것을 `shift`만큼 옮기고, 무대·길찾기·적을 새 땅으로, 그다음 가던 길을 다시 찾는다(`orders.shift`). 출구 밟기·암전은 균열에만 남았다 |

## 장 흐름 (E22)

| 곳 | 하는 일 |
| --- | --- |
| `src/data/chapters.json`·`chapters.ts` | 장 다섯: 제목·이름·땅 단계(`tier`)·열리는 땅과 적 지수(`lands`)·할 일(`steps`: enter·choose·level·boss·forge, 목표 한 줄 `goal`, 보스가 여는 신화권 `opens`). `landScale`(적 지수 → 생명·피해 배율), `chapterOf` |
| `src/progress/Chapters.ts` | `ChapterProgress`: 들어선 땅·이긴 보스(저장), 지금 장(`index`·`chapter`)·목표(`goal`)·열린 땅(`isOpen`)·땅 세기(`power`)·땅 단계(`tier`). 신화·유물은 `ChapterWorld`로 묻기만 한다 |
| `src/game/systems/Chapters.ts` | 땅 들어섬·보스 처치를 적고 `chapterChanged`·`goalChanged`를 보낸다. `goalView`(목표 한 줄과 채우는 막대) |
| `src/game/systems/MythChoice.ts` | 성소에서 신화 고르기(`offer`·`here`·`pick`, `ui/MythPicker`), 장 보스가 신화권을 엶(`openRealm`). 데모에서는 `ClassProgress`의 `openByXp`가 꺼져 경험치가 문턱에서 멈춘다 |
| `src/world/Barriers.ts`, `World.openLinks`·`refreshLinks` | 막힌 땅으로 가는 통로는 걸을 수 있는 곳에서 빼고 입구에 결계를 세운다. 장이 바뀌면 빛기둥과 함께 풀린다 |
| `Encounter.landPower` | 땅 id → 적 지수. 무리·보스·전설의 적에 위협 배율과 곱해 건다(`scaled`) |
| `ui/ChapterHud.ts` | 목표 한 줄(채우는 목표면 막대)과 장 제목 띠. 지도 탭은 `world.goal()`·`nodes().locked`, 작은 지도는 `Game.goalSpot()` |
| 엔딩 | 마지막 장이 끝나면(`chapterChanged`의 chapter가 null) 엔딩 장면 → `showEnding`(`reachEnding` + 띠·카드). 개발 패널 「목표 건너뛰기」·「장 건너뛰기」는 `Game.skipGoal` |

## E14에서 걷어낼 것

옛 순환(`src/progress/Cycle`, `systems/CycleSystem.ts`): 원천 결정·단련·윤회·별자리(→ E17 성좌판)·원천 숙련. 저장을 옮기며 제거한다.
