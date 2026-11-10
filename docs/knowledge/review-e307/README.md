# E307-01 전체 리뷰의 근거 자료 (2026-11-10)

`REVIEW.md`(저장소 맨 위)가 요약과 권고안이고, 여기에는 그 근거를 원문에 가깝게 남긴다. main `c865151`(E306까지 병합) 기준이다. E307의 덩어리를 만들 때 해당 문서를 먼저 읽는다.

| 문서 | 내용 | 언제 읽나 |
| --- | --- | --- |
| [`code-review.md`](code-review.md) | 코드 리뷰에서 확인된 문제 49건(자리·어떻게 틀리나·재현·닿는 조건·고치는 방향), 구조 부채, 지킬 것 | 덩어리 0A·0C |
| [`qa.md`](qa.md) | 사람 눈 QA 여덟 건의 판정과 문제(90분 스크린숏 판, 휴대폰, 정보 화면, 손으로 해 본 셋, 체크리스트) | 덩어리 0A(휴대폰 손 QA 목록이 문이다)·1 |
| [`fact-check.md`](fact-check.md) | 분석 보고서의 핵심 주장 스무 개를 다시 확인한 결과, 보고서끼리 어긋난 곳, 빠진 것 | 분석 원문을 읽기 전에 |
| [`analysis-status.md`](analysis-status.md) | 마일스톤 실제 상태, 확인 대기 묶음, 낡은 문서 목록, 속도, 배포 | 문서 정리(0A), 로드맵 맞추기 |
| [`analysis-design-gap.md`](analysis-design-gap.md) | 기획 문서와 지금 게임의 차이, 시각표 원칙 판정, 설계가 사용자 의견과 충돌하는 곳 | 설계 문서를 다시 쓸 때 |
| [`analysis-balance.md`](analysis-balance.md) | 공격 지수의 층 분해, 재는 자의 흠, 톱니·보스 싸움·구간 길이의 원인과 손잡이 | 덩어리 0B·1 |
| [`analysis-items.md`](analysis-items.md) | 드랍이 정해지는 길과 실제 확률 표, 조합의 지금 모습, 고치는 길 | 덩어리 1(`gearDrop`)·2 |
| [`analysis-myth.md`](analysis-myth.md) | 신이 주는 것 전부, 「클래스 발현」이 남은 곳, 신마다 채울 수 있는 마디 수, 정해진 첫 길 | 덩어리 0A(의견 4)·3 |
| [`analysis-goals.md`](analysis-goals.md) | 목표 한 줄 전부, 처치 수로 막힌 문 전부와 걸리는 시간, 채울 재료, 안내 규칙 제안 | 덩어리 1 |
| [`proposal-a-bold.md`](proposal-a-bold.md)·[`proposal-b-lean.md`](proposal-b-lean.md)·[`proposal-c-player.md`](proposal-c-player.md) | 세 방향에서 따로 짠 개편안 원문 (채택된 것이 아니다. 뼈대는 「다」) | 권고안의 세부(흐름 표·시스템 표)가 필요할 때 |
| [`judging.md`](judging.md) | 세 관점의 심사(점수·접붙일 것·흠)와 권고안 초안에 대한 반박 검토 둘 | 권고안이 왜 그렇게 됐는지, 덩어리마다 걸리는 것 |

- 봇 결과와 스크린숏은 저장소에 남기지 않았다. 다시 만드는 명령은 `REVIEW.md` 9장.
- 문서 안의 「(11-05 보관본)」은 E306을 끝낼 때의 봇 결과, 「(손 QA 그림)」은 조종 서버로 찍은 그림이고 둘 다 저장소에 없다.
- 권고안이 채택되어 설계가 `DESIGN.md`·`TIMELINE.md`로 옮겨지면 이 폴더는 `past/`로 보낸다.
