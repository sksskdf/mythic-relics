---
name: qa-pass
description: 사람 눈으로 하는 QA 한 바퀴. 바뀐 것에 맞는 봇·손맛 점검·스크린숏을 돌려 직접 보고, 판정을 PLAYTEST.md 6.2·로드맵에 남긴다. 마일스톤을 끝낼 때, 화면·조작·전투를 바꿨을 때 쓴다. 인자: 볼 범위나 체크리스트 항목 id.
---

# QA 한 바퀴

직접 플레이 체크리스트는 사람 대신 Claude가 사람 눈으로 확인한다 (2026-10-27 결정). 봇 수치만으로 끝내지 않는다. 공격 동작이 빠르게 되풀이되는 버그를 봇이 못 잡은 적이 있다.

## 1. 범위 정하기

- `node scripts/harness/what-to-run.mjs`: 바뀐 파일에 맞는 점검
- 마일스톤이면 `ROADMAP.md` 2장의 자동 검증·직접 플레이 체크리스트·완료 기준

## 2. 돌리기

스크립트가 길게 돌거나 여럿이면 `playtest-qa` 서브에이전트에게 범위를 넘긴다 (결과 파일 내용이 메인 대화를 채우지 않게). 짧으면 직접 돌린다.

| 볼 것 | 스크립트 |
| --- | --- |
| 체크리스트 장면·수치 | `node scripts/checklist-qa.mjs <항목 id 앞부분>` → `test-results/checklist/` |
| 손맛 (끊긴 휘두르기·걷기 깜박임·헛휘두르기·붙잡힘) | `node scripts/feel-qa.mjs [신 id,...] [적 id,...]`, 엄격하게는 `--strict` |
| 정보 화면·HUD, 좁은 화면 | `node scripts/ui-sheet.mjs` (1280×720·960×540·390×844) |
| 동작·궁극기 겹침 | `node scripts/motion-sheet.mjs` |
| 적·신화 외형 | `node scripts/enemy-sheet.mjs`, `node scripts/class-sheet.mjs` |
| 원하는 상태 하나 | `node scripts/shot.mjs <파일.png> "<주소 뒤 값>" "<게임 안 코드>"` |
| 처음부터 흐름 | `node scripts/playtest.mjs 1 40`, 엔딩까지는 `node scripts/playtest.mjs 1 100 --ending` |

- 모두 `npm run build` 뒤에 돌린다 (빌드가 낡았으면 훅이 막는다). 하나씩 돌린다
- 그림은 Read로 **직접 열어 본다**. 보지 않은 그림으로 판정하지 않는다
- fps·체감 속도는 이 환경(소프트웨어 렌더링)에서 판정하지 않는다. 사용자 확인으로 남긴다

## 3. 판정과 기록

- 항목마다 예 / 반쯤 / 아니오와 근거 한 줄 (그림 파일 이름이나 수치)
- `PLAYTEST.md` 6.2 표에 남기고, 고칠 것은 고치거나 로드맵에 넘긴 곳을 적는다
- 체크리스트를 확인했으면 `ROADMAP.md`와 마일스톤 이슈 본문의 그 줄을 `[x]` (`/roadmap-sync`)
- 사용자에게는 "아니오"·"반쯤"과 사용자가 직접 봐야 할 것만 알린다
