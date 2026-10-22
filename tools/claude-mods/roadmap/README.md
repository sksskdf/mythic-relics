# 로드맵 패널 (Claude Code 모드)

`ROADMAP.md`를 읽어 Claude Code 화면 옆 패널(계획 탭·할 일 탭)에 보여 주고, `/roadmap` 명령과 Claude가 부르는 `roadmap` 도구(MCP `roadmap`)를 더한다.

- 원래 자리는 세션 컨테이너의 `~/.claude/dev-mods/<세션>/roadmap/`이다. 컨테이너가 사라지면 함께 사라지므로 원본을 여기 둔다.
- 새 세션에서 쓰려면: `plugin-authoring` 스킬을 불러 핫 리로드를 켠 뒤, 이 폴더를 `~/.claude/dev-mods/<세션>/roadmap/`에 복사한다 (`.claude-plugin/types/`는 엔진이 다시 만든다).
- 할 일 목록 항목은 엔진 저장소(`$.store`)에 있어 세션을 옮기면 비어 있다. `E11 기획 반영과 코드 구조 정리`처럼 마일스톤 ID로 시작하는 이름으로 E11~E18을 다시 넣으면 계획 탭에 상태(○ ▶ ✓)가 붙는다.
- 시험: `claude plugin test <이 폴더>` (`hooks/roadmap.test.tsx`). 게임의 vitest는 `tests/`만 보므로 여기 테스트는 돌리지 않는다.
