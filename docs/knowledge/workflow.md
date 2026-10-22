# 작업 흐름

규칙의 원본은 `CLAUDE.md`다. 여기서는 그 규칙을 **하는 순서**로 풀어 둔다.

## 로드맵의 네 곳

| 곳 | 무엇 | 맞추는 법 |
| --- | --- | --- |
| `ROADMAP.md` | 원본. 마일스톤 → 이슈(`E11-01`) → 작업 단위(`E11-01-1`) | 직접 고침 |
| GitHub 이슈 | 마일스톤 = 부모 이슈(라벨 `마일스톤`), 이슈 = 하위 이슈, 작업 단위 = 하위 이슈 본문의 체크 상자 | GitHub MCP `issue_write` (update: 본문 체크, closed: 닫기). 번호는 `scripts/roadmap-issues/issues.json` |
| 로드맵 아티팩트 | 사용자가 보는 페이지 | `node scripts/roadmap-page/build.mjs <스크래치>/roadmap.html` → Artifact publish, `url`에 https://claude.ai/artifact/VLnz4HHR5F7VMGG496TmqK |
| 로드맵 패널 | Claude Code 옆 패널. `ROADMAP.md`를 직접 읽음 | 마일스톤 상태만 MCP `roadmap` 도구로 (할 일 / 진행 중 / 완료) |

## 마일스톤을 시작할 때

1. `git checkout main && git pull`, `git checkout -b feature/<e번호>-<내용>`
2. MCP `roadmap`으로 그 마일스톤을 진행 중으로
3. `ROADMAP.md` 0.2 "지금 할 일"의 상태를 "진행 중"으로, 아티팩트 다시 올리기
4. 관련 문서를 먼저 읽는다 (`CLAUDE.md`의 문서 표)

## 작업 단위 하나를 끝낼 때

1. 코드 + 테스트 (규칙·수치는 단위 테스트, 화면·입력은 스모크, 흐름·밸런스는 봇, 데이터로 늘어나는 것은 범용 테스트)
2. 화면이 바뀌면 `scripts/shot.mjs`로 찍어 직접 본다
3. `set -o pipefail && npm run check` 통과
4. `ROADMAP.md`에서 `- [ ]` → `- [x]`
5. 그 GitHub 하위 이슈 본문의 같은 줄도 체크 (`issue_write` update, 본문 전체를 다시 보냄)
6. 커밋 (한국어, 끝에 세션이 알려 주는 Co-Authored-By·Claude-Session 줄) → 푸시
7. 아티팩트 다시 올리기 (`ROADMAP.md`를 고쳤으므로)
8. `docs/knowledge/handoff.md`의 "다음 할 일" 갱신

## 이슈 하나(`E11-01`)를 끝낼 때

1. 작업 단위가 모두 `[x]`
2. `ROADMAP.md` 표의 ID에 ✅ (`| E11-01 ✅ |`)
3. GitHub 하위 이슈 닫기: `state: closed`, `state_reason: completed`

## 마일스톤을 끝낼 때

1. 자동 검증을 돌리고 통과한 줄에 ✅ (마일스톤 이슈 본문의 자동 검증 체크 상자도)
2. 봇 결과를 `PLAYTEST.md` 7장에, 수치를 바꿨으면 `BALANCE.md`에
3. 직접 플레이 체크리스트는 사용자에게 부탁하고, 확인해 준 것만 `[x]` (로드맵과 마일스톤 이슈 둘 다)
4. 완료 기준을 넘으면: 마일스톤 이슈 닫기, MCP `roadmap` 완료, `ROADMAP.md` 0.2 갱신
5. PR을 만들고 CI가 통과하면 `merge_pull_request`(merge 방식)로 병합 → `git checkout main && git pull` (원격 브랜치는 병합하면 저절로 지워짐)
6. `docs/knowledge/history.md`에 한 줄, `baselines.md`에 새 기준 수치, `handoff.md` 갱신

## PR과 CI

- PR은 main에 병합할 때만 만든다. 본문은 한국어로 짧게: 바꾼 것, 확인한 것. 끝에 세션이 알려 주는 PR 꼬리말.
- 만든 뒤 `subscribe_pr_activity`로 지켜보고, CI 결과는 알림으로 온다. `sleep`으로 기다리지 않는다.
- CI(`.github/workflows/ci.yml`)는 `npm run check` + 봇 1판(25분 안 승급, `--gate`). 봇은 운에 따라 느릴 수 있다. 실패하면 `test-results` 아티팩트에서 원인을 본다.
- 병합 뒤 안전용 예약(`send_later`)을 걸어 뒀으면 지운다.

## 로드맵에 이슈를 새로 더할 때

1. `ROADMAP.md` 표와 작업 단위에 더한다
2. `node scripts/roadmap-issues/plan.mjs <스크래치>/plan.json`: `issues.json`에 없는 것만 계획에 나온다
3. **부모 없이** `issue_write` create (부모를 붙여 만들면 새 라벨이 생기지 않아 거절된다) → `sub_issue_write` add (`sub_issue_id`는 이슈 번호가 아니라 create 응답의 `id`)
4. `issues.json`에 번호를 적고 커밋

## 사용자와 일하는 방식

- 큰 방향(기획, 범위, 무엇을 지울지)은 사용자가 정한다. 선택지를 줄 때는 추천안을 첫째로 둔다. "추천대로"면 추천안으로 하고 무엇을 골랐는지 알린다.
- 답은 한국어, 결과·판단·확인할 것만. 최종 답과 문서는 어색한 번역 투 없이 다듬는다.
- 사용자는 로드맵을 아티팩트로 보고, 실제 속도·느낌은 자기 컴퓨터(Electron)에서 확인한다. 이 환경은 소프트웨어 렌더링이라 fps를 믿지 않는다.
