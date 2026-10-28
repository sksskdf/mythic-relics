---
name: roadmap-sync
description: 로드맵 네 곳(ROADMAP.md·GitHub 이슈·로드맵 아티팩트·MCP roadmap 패널)을 함께 맞춘다. 작업 단위를 끝냈을 때, 이슈·마일스톤을 끝냈을 때, 마일스톤을 시작할 때, 로드맵에 이슈를 새로 더할 때 쓴다. 인자: 끝낸 작업 단위·이슈 ID (예: E23-01-1 E23-01).
---

# 로드맵 맞추기

원본은 `ROADMAP.md`, 자세한 순서는 `docs/knowledge/workflow.md`. 네 곳 가운데 하나라도 빠뜨리면 사용자가 보는 화면이 어긋난다.

## 작업 단위를 끝냈을 때 (`E23-01-1`)

1. `node scripts/roadmap-issues/tick.mjs <스크래치>/tick.json E23-01-1 [더 …]`
   - `ROADMAP.md`의 `- [ ]`를 `- [x]`로 바꾸고, 그 하위 이슈의 새 본문을 파일에 쓴다
   - 넘긴 ID는 모두 체크된다. 새로 더한 칸은 본문에서 되돌린다
2. 파일의 `[{ number, body }]`마다 GitHub MCP `issue_write`(method `update`, `issue_number`, `body`)
3. 로드맵 아티팩트 다시 올리기 (아래)

## 이슈를 끝냈을 때 (`E23-01`)

1. 작업 단위가 모두 `[x]`인지 본다
2. `ROADMAP.md` 표의 ID에 ✅ (`| E23-01 ✅ |`), `tick.mjs <파일> E23-01`로 본문만 다시 만들어 `issue_write` update
3. 그 하위 이슈를 닫는다: `issue_write`에 `state: closed`, `state_reason: completed`

## 마일스톤을 시작할 때 / 끝냈을 때

- 시작: MCP `roadmap`으로 그 마일스톤을 진행 중으로, `ROADMAP.md` 0.2 "지금 할 일"을 "진행 중"으로
- 끝: 자동 검증 줄과 마일스톤 이슈 본문의 체크 상자에 ✅, 완료 기준을 넘으면 마일스톤 이슈를 닫고 MCP `roadmap` 완료, 다음 마일스톤을 진행 중으로, `ROADMAP.md` 0.2 갱신
- MCP `roadmap` 도구가 없으면 (모드가 내려가 있음) `tools/claude-mods/roadmap/README.md`대로 다시 올리거나, 건너뛰고 사용자에게 알린다

## 로드맵 아티팩트 (ROADMAP.md를 고칠 때마다)

1. `node scripts/roadmap-page/build.mjs <스크래치>/roadmap.html`
2. Artifact publish: `file_path`는 만든 파일, `url`은 https://claude.ai/artifact/VLnz4HHR5F7VMGG496TmqK
   - 이 세션에서 처음 올리면 먼저 `action: read`로 읽는다 (읽지 않고 올리면 거절된다)
   - `icon`은 넘기지 않는다 (이미 있다)

## 로드맵에 이슈를 새로 더할 때

1. `ROADMAP.md` 표와 작업 단위에 더한다
2. `node scripts/roadmap-issues/plan.mjs <스크래치>/plan.json`: `issues.json`에 없는 것만 나온다
3. **부모 없이** `issue_write` create (부모를 붙이면 새 라벨이 생기지 않아 거절된다) → `sub_issue_write` add (`sub_issue_id`는 create 응답의 `id`, 이슈 번호가 아니다)
4. `scripts/roadmap-issues/issues.json`에 번호를 적고 커밋

## 마지막으로

- `docs/knowledge/handoff.md`의 "지금 상태" 표(로드맵·GitHub 이슈·로드맵 패널 줄)와 "다음 할 일"을 고친다
- 사용자에게는 무엇을 체크·닫았는지 한두 줄로만 알린다
