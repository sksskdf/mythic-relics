# 인수인계: 지금 상태와 다음 할 일

> 마지막으로 고친 날: 2026-10-22. 일을 한 덩어리 끝낼 때마다 고친다.

## 한 줄 요약

1차 스프린트(E1~E9)를 끝내고 E10(외부 검증)은 보류했다. 사용자와 2차 스프린트 기획(`REDESIGN.md`)을 모두 정했고, 로드맵 v3.0(E11~E18)을 쓰고 GitHub 이슈로 올렸다. **다음은 E11 시작이다. 사용자가 시작하라고 하면 들어간다.**

## 지금 상태

| 항목 | 상태 |
| --- | --- |
| main | 깨끗함. CI 통과. 마지막 병합: PR #62 (main 병합을 PR로 바꾸기) |
| 원격 브랜치 | `main`만 있음. 저장소에 "Automatically delete head branches"가 켜져 있음 |
| 로드맵 | `ROADMAP.md` v3.0, 지금 할 일만 (E11~E18). 끝난 E1~E9 기록은 git과 `history.md` |
| GitHub 이슈 | 마일스톤 이슈 #2~#9 (E11~E18), 하위 이슈 #10~#61 (작업 52개). 번호는 `scripts/roadmap-issues/issues.json`. 예전 이슈 #1은 "진행 안 함"으로 닫음 (삭제는 사용자에게 부탁함) |
| GitHub 프로젝트 | 사용자가 이미 만들어 둠. Claude의 GitHub 도구로는 볼 수도 고칠 수도 없다. 이슈가 들어갔는지 사용자가 확인하기로 함 |
| 로드맵 아티팩트 | https://claude.ai/artifact/VLnz4HHR5F7VMGG496TmqK (13판). `ROADMAP.md`를 고칠 때마다 다시 올린다 |
| 로드맵 패널 | MCP `roadmap` 할 일 #29~#36 = E11~E18 (모두 할 일). 모드 원본은 `tools/claude-mods/roadmap/` |
| 남긴 아티팩트 | Mythic Relics 디자인 시스템 (LbbGKzFoE1nPhiDLnwVRdm), 수집 항목 카탈로그 (CX4UpjitfafU8oT3XciVyX): 사용자가 남기기로 함. 원천·순환 설계안과 신화 클래스 도감은 지움 |

## 다음 할 일

1. **E11 기획 반영과 코드 구조 정리** ([#2](https://github.com/sksskdf/game/issues/2)): 사용자가 시작하라고 하면
   - main에서 `feature/e11-structure` 같은 브랜치를 만든다
   - MCP `roadmap`으로 E11을 진행 중으로 바꾼다
   - 작업 단위 순서는 `ROADMAP.md` E11 구역 (E11-01 문서 → E11-02 이름 → E11-03 `Game.ts` 나누기 → E11-04 빌드 상태 → E11-05 `gear/`·`myth/` → E11-06 회귀 확인)
   - 끝내는 순서는 [`workflow.md`](workflow.md)
2. 그다음 E12 → E18

## 사용자에게 받아야 할 것

- E7·E8·E9 직접 플레이 체크리스트 확인 (아직 안 받음)
- 이슈 #1 삭제 (Delete issue는 저장소 관리자만 할 수 있음)
- GitHub 프로젝트에 이슈 #2~#61이 들어갔는지, "Item closed → Done" 작업 흐름이 켜졌는지

## 열린 질문 (그때 정함)

`ROADMAP.md` 5장 "정할 것"과 같다: 상시·추가 효과 나눔(E12-01), 장비 수치 범위·등급 확률(E13-01), 확대 픽셀 시안(E18-01), 결말의 큰 방향(보류), 게임 제목(2차 뒤), 기술 유지·외부 검증(2차 뒤, E10).
