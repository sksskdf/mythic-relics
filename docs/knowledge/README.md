# 지식 저장소

이 프로젝트를 다른 세션이 이어받을 때 필요한 것을 모아 둔 곳이다. 기획·수치의 원본은 저장소 맨 위의 문서(`DESIGN.md`, `REDESIGN.md`, `BALANCE.md` 등)이고, 여기에는 **그 문서들에 없는 것**을 둔다: 지금 어디까지 왔는지, 왜 그렇게 정했는지, 일하는 순서, 이 환경의 제약, 겪은 문제.

## 새 세션은 이 순서로 읽는다

1. `CLAUDE.md`: 규칙·명령·코드 지도 (세션이 자동으로 읽음)
2. [`handoff.md`](handoff.md): **지금 상태와 다음 할 일** (가장 먼저)
3. `ROADMAP.md`의 0.2 "지금 할 일"과 지금 마일스톤 구역
4. 하려는 일에 맞는 아래 문서

## 목록

| 문서 | 내용 | 언제 읽나 |
| --- | --- | --- |
| [`handoff.md`](handoff.md) | 지금 상태, 다음 할 일, 사용자에게 받아야 할 것, 열린 질문 | 세션을 시작할 때마다 |
| [`workflow.md`](workflow.md) | 작업 단위 하나 → 이슈 → 마일스톤을 끝내는 순서, 로드맵·이슈·아티팩트·패널 맞추기, 커밋·PR·CI | 작업을 시작하고 끝낼 때 |
| [`decisions.md`](decisions.md) | 사용자와 정한 것과 그 이유 (2차 스프린트 기획, 이름, 일하는 방식) | 기획을 건드리거나 "왜 이렇게 했지?" 싶을 때 |
| [`environment.md`](environment.md) | 클라우드 환경의 제약과 우회법 (브랜치 삭제, GitHub 도구, 아티팩트, 브라우저) | 무언가 막혔을 때 |
| [`architecture.md`](architecture.md) | 코드 구조의 원칙과 E11에서 바꿀 곳 | 코드를 고치기 전에 |
| [`baselines.md`](baselines.md) | 봇·적 시험·성능의 기준 수치 | 수치·모델·맵을 바꾼 뒤 비교할 때 |
| [`troubleshooting.md`](troubleshooting.md) | 겪은 문제와 해결 | 비슷한 증상이 보일 때 |
| [`history.md`](history.md) | 끝난 마일스톤 E1~E9와 보류한 E10 요약 | 예전 결정의 맥락이 필요할 때 |
| [`glossary.md`](glossary.md) | 용어와 옛 이름 → 새 이름 | 이름이 헷갈릴 때 |

## 고치는 규칙

- 일을 한 덩어리 끝낼 때마다 `handoff.md`를 고친다 (지금 상태·다음 할 일). 세션이 끊겨도 여기만 보면 이어진다.
- 사용자와 새로 정한 것은 `decisions.md`에 날짜와 함께 더한다. 기획 내용 자체는 `DESIGN.md`(E11 전에는 `REDESIGN.md`)에 쓰고 여기에는 결정과 이유만.
- 막혔다 풀린 문제는 `troubleshooting.md`, 환경 제약은 `environment.md`에 더한다.
- 마일스톤이 끝나면 `history.md`에 한 줄, `baselines.md`에 새 기준 수치.
