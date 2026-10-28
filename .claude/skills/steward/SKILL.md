---
name: steward
description: 이 저장소에서 PR을 만들고 CI·리뷰를 지켜 main에 병합하기까지의 규칙. PR을 만들 때, PR 알림(CI·리뷰·충돌)을 받았을 때, 병합할 때 쓴다.
---

# PR 지키기 (이 저장소의 규칙)

`CLAUDE.md` "Git"과 `docs/knowledge/workflow.md` "PR과 CI"가 원본이다. 여기는 PR 한 개를 처음부터 병합까지 끌고 가는 순서와 이 저장소에서 겪은 것만 적는다.

## PR을 만들기 전

1. `node scripts/harness/what-to-run.mjs`: 돌려 볼 점검, 아직 안 고친 문서
2. `game-reviewer` 서브에이전트로 리뷰 (마일스톤·큰 작업 단위). "막음"·"고쳐야 함"은 고치고, "작은 것"은 맞는 것만 함께 고친다
3. `docs/knowledge/handoff.md`를 고쳐 커밋하고 모두 푸시한다 (안 했으면 PR 훅이 막는다)

## PR 만들기

- main으로만, 제목·본문은 한국어. 본문은 바꾼 것과 확인한 것만 짧게, 끝에 세션이 알려 주는 PR 꼬리말
- 만든 뒤 `subscribe_pr_activity`, 안전용 `send_later` 한 번 (50분쯤 뒤). `sleep`으로 기다리지 않는다

## CI (`.github/workflows/ci.yml`)

- 단계: `npm run check`(타입 검사·빌드·단위 테스트·스모크) → 봇 1판 `node scripts/playtest.mjs 1 35 --gate`(장 흐름을 따라 35분 안에 2단계)
- 실패하면 `get_job_logs`와 `test-results` 아티팩트를 본다
  - 스모크 시간 초과: 소프트웨어 렌더링에서 게임 둘을 함께 띄우면 느리다. 앞 페이지를 닫고 새로 연다 (`docs/knowledge/troubleshooting.md`)
  - 봇이 35분을 넘김: 먼저 이 PR이 흐름·수치를 바꿨는지 본다. 바꿨으면 이 PR의 문제다 (로컬에서 `node scripts/playtest.mjs 2 40`로 재고 고친다). 바꾸지 않았는데 기준(2단계 24~27분) 안에서 운으로 넘긴 것으로 보이면 한 번만 다시 돌린다. 두 번째 실패는 진짜다
- 테스트를 건너뛰거나 지우거나 문턱을 올려 초록으로 만들지 않는다

## 리뷰와 충돌

- 리뷰 요청의 작은 것(이름, 테스트 하나, 함수 하나)은 고쳐 올린다. 큰 것(여러 파일, 저장 형식, 기획)은 제안을 답하고 사용자에게 묻는다
- main과 충돌하면 main을 병합해 푼다 (내 브랜치면 병합 커밋으로). `package-lock.json`은 손으로 고치지 않고 `npm install`로 다시 만든다

## 병합

- CI가 초록이면 `merge_pull_request` (`merge_method: merge`, `expectedHeadSha`는 지금 머리 커밋의 전체 SHA). 다른 방식은 훅이 막는다
- 병합 뒤: `git checkout main && git pull`, 걸어 둔 `send_later` 지우기, `unsubscribe_pr_activity`
- 원격 브랜치는 저장소 설정이 지운다 (이 환경의 git은 원격 브랜치를 지울 수 없다)
- 마일스톤 PR이면 `/roadmap-sync`로 마일스톤 이슈·패널·아티팩트를 맞추고, `docs/knowledge/history.md`에 한 줄
- 사용자에게는 병합했다는 것과 다음 할 일만 알린다
