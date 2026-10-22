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

## E11에서 바꿀 곳 (`REDESIGN.md` 8장)

| 곳 | 지금 | 바꾼 뒤 |
| --- | --- | --- |
| `src/game/Game.ts` | 957줄. 조립·루프·지역 이동(`enterRegion`·`travelTo`)·개발용 `dev*` 함수·시작 화면 키 아트가 한곳에 | 조립만 남김. 지역 이동 → `World` 쪽, `dev*` → `DevTools`, 키 아트 장면은 따로 |
| 유물 ↔ 클래스 | 유물 칸(`Loadout`)이 발현 판정까지 함. `manifested`·`loadout`을 직접 보는 파일 22개 | `gear/`(장비·유물·제작)와 `myth/`(개방·상시·추가 효과)로 나누고, 힘은 **빌드 상태** 하나에서 계산 (열린 신화 + 고른 신화 + 장비 + 원천 수치 → 능력치·효과 목록) |
| `RelicPowers`·`Damage` | 장착 유물을 직접 읽음 | 빌드 상태에서 값을 읽음. 같은 장착이면 지금과 같은 능력치가 나오는지 테스트 |

E11은 **기능을 그대로 둔다.** 겉으로 달라지는 것은 이름(클래스 → 신화 등)뿐이고, 테스트·스모크·봇이 E9와 같은 범위여야 한다 (기준은 [`baselines.md`](baselines.md)).

## E14에서 걷어낼 것

옛 순환(`src/progress/Cycle`, `systems/CycleSystem.ts`): 원천 결정·단련·윤회·별자리(→ E17 성좌판)·원천 숙련. 저장을 옮기며 제거한다.
