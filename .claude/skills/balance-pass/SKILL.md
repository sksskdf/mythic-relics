---
name: balance-pass
description: 게임 수치를 바꾸는 한 바퀴. 목표 띠를 정하고, src/data 수치를 바꾸고, 맞는 봇을 돌려 기준과 견주고, BALANCE.md·PLAYTEST.md·baselines.md를 고친다. 수치·성장 곡선·적 세기·드랍을 바꿀 때 쓴다. 인자: 무엇을 맞추려는지 (예: "제2장 적 잡는 초를 2초 안으로").
---

# 밸런스 한 바퀴

수치는 코드가 아니라 `src/data/*.json`·`src/data/*.ts`에서 바꾼다. 한 바퀴에 손잡이는 하나나 둘만 움직인다. 여럿을 함께 바꾸면 무엇이 효과였는지 모른다.

## 1. 목표를 숫자로

- 띠: `TIMELINE.md` 4장(목표 성장 곡선)·1.3, 마일스톤 완료 기준 `ROADMAP.md` 2장
- 지금: `docs/knowledge/baselines.md`, 최근 `test-results/*.json`
- 원인을 모르겠으면 `balance-analyst` 서브에이전트에게 결과 파일과 목표를 넘겨 제안을 받는다
- 이미 해 보고 되돌린 값은 `docs/knowledge/troubleshooting.md`·`decisions.md`에 있다 (예: 땅 피해 지수 0.6~0.65는 쓰러짐이 늘어 0.55)

## 2. 바꾸고 재기

1. 수치를 바꾼다. 고친 파일에 맞는 점검은 훅이 알려 주고, 모아 보려면 `node scripts/harness/what-to-run.mjs`
2. `npm run build` 뒤 맞는 점검을 **하나씩** 돌린다 (같은 포트를 쓰는 것이 있다)

| 바꾼 것 | 돌릴 것 | 기준 |
| --- | --- | --- |
| 장·땅 세기·경험치·장비 단계 | `node scripts/power-curve.mjs`, `node scripts/playtest.mjs 1 100 --ending` | 곡선 띠, 엔딩 60~80분, 쓰러짐 |
| 처음 30분 흐름 | `node scripts/playtest.mjs 2 40` | 첫 신화 8분쯤, 2단계 24~27분 (CI는 35분 안) |
| 신화·유물 | `node scripts/myth-trial.mjs` | 1분당 처치 중앙값 ±20% |
| 원천 각성 | `node scripts/source-trial.mjs` | 원천 넷 평균 ±25% |
| 적 | `node scripts/enemy-trial.mjs` | 역할별 피격·처치 시간, 지역 보스 다섯 |
| 깊이·균열 (엔딩 뒤), 맹세 | `node scripts/playtest.mjs 1 60 --depth=N` (깊이 하나에 고정은 `--depth-at=N`) / `--rift …` / `--oaths` | `CLAUDE.md` 명령 설명 |

3. 봇은 운에 따라 흔들린다. 판정이 걸린 숫자는 두 판 이상 돌리고 범위로 적는다
4. 띠를 넘지 못하면 1로 돌아간다. 세 바퀴를 넘기면 손잡이를 잘못 골랐을 수 있으니 식을 다시 따라간다

## 3. 기록

- `BALANCE.md`: 바꾼 수치와 까닭 (해당 절)
- `PLAYTEST.md` 7장: 마일스톤별 봇 결과 (돌린 명령, 판 수, 범위)
- `docs/knowledge/baselines.md`: 새 기준 수치
- 시도했다가 되돌린 것은 `docs/knowledge/troubleshooting.md`에 한 줄 (다음 세션이 같은 값을 다시 해 보지 않게)
- `set -o pipefail && npm run check` 뒤 커밋 (훅이 검사 도장을 본다)

사용자에게는 무엇을 바꿨고 숫자가 어떻게 움직였는지, 실제 체감은 직접 해 봐 달라는 것만 짧게 알린다.
