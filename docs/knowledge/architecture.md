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
| 빌드 상태 | `src/build/BuildState.ts`의 `computeBuild(inputs)`: 열린 신화·고른 신화·장비·원천·순환 배율 → 피해 배율·지속 효과·받는 피해·이동 속도·공격 리듬·최대 생명, 상시 효과(메아리 목록 `echoes`, 수치 합 `stats`). 게임 안에서는 `ctx.build`(`Build`, 부를 때마다 계산, `chosen`·`level`은 가볍게). `tests/build.test.ts`가 1차 공식 × 상시 수치인지 지킨다 |
| `src/gear/` | `Loadout`(칸 7·가방·일반 장비 `gear`·유물 단계 `stages`·재료 `materials`·물려받은 수치 `inherited`), `roll.ts`(일반 장비 굴리기, id는 `g:`로 시작), `mythRelic.ts`(신화마다 유물 하나와 부위·단계, 나머지는 재료), `materials.ts`(재료와 드랍), `forge.ts`(규칙으로 만드는 제작법·제작·분해), `Pickups`, `DropTable`. 칸에는 유물 id와 장비 id가 섞여 들어가므로 유물만 다루는 곳은 `isRelicId`나 `loadout.relics`로 거른다 |
| `src/skills/MythEchoes.ts` | 상시 효과 메아리 (E12-03): 고르지 않은 열린 신화마다 패시브 부품이 가끔 한 번. 빌드 상태의 `echoes`를 `Relics`가 넘겨 준다 |
| `src/myth/` | `manifest.ts`(고른 신화·가호 판정, 옛 발현 규칙 `legacyManifest`는 옛 저장과 히든 신화만), `ClassProgress`(개방 단계 0~4·신화 숙련·원천 숙련, 숙련 나누기 `masteryShares`), `levelGains`. E12에서 영구 개방·상시·추가 효과가 들어올 자리 |
| 읽는 길 | 게임 시스템은 지금 신화·단계를 `ctx.build.chosen`·`ctx.build.level`로 읽는다. 장비 칸 자체를 다루는 곳(장착·저장·유물 화면)은 `powers.loadout`을 본다 |

E12~E14에서 새 규칙을 넣을 때는 `BuildInputs`에 재료를 더하고 `computeBuild`에서 계산을 늘린다. 시스템이 장비·신화를 직접 읽어 따로 계산하지 않는다.

## E14에서 걷어낼 것

옛 순환(`src/progress/Cycle`, `systems/CycleSystem.ts`): 원천 결정·단련·윤회·별자리(→ E17 성좌판)·원천 숙련. 저장을 옮기며 제거한다.
