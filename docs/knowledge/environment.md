# 환경과 제약

Claude가 일하는 곳은 클라우드 컨테이너(Claude Code on the web)다. 컨테이너는 세션마다 새로 만들어지고, 쓰지 않으면 거두어진다. **남겨야 할 것은 커밋하고 푸시한다.**

## git과 GitHub

| 할 일 | 되나 | 방법 / 우회 |
| --- | --- | --- |
| clone·fetch·push (새 브랜치 포함) | 됨 | `git push -u origin <브랜치>`. 네트워크 오류면 2·4·8·16초 간격으로 4번까지 다시 |
| 원격 브랜치 지우기 | **안 됨** (중간 프록시가 403으로 막음) | 병합을 PR로 하면 저장소 설정 "Automatically delete head branches"가 지운다. 그 밖에는 사용자에게 부탁 (https://github.com/sksskdf/game/branches) |
| `gh` CLI | 안 됨 (토큰이 무효) | GitHub MCP 도구(`mcp__github__*`)를 쓴다. 스키마가 안 보이면 ToolSearch로 불러온다 |
| 이슈 만들기·고치기·닫기 | 됨 | `issue_write`. 부모를 붙여 만들면(`parent_issue_number`) 없는 라벨이 생기지 않아 "label not found"로 거절된다 → 부모 없이 만들고 `sub_issue_write`로 붙인다 |
| 라벨 만들기 | 따로 도구 없음 | 이슈를 부모 없이 만들 때 붙인 라벨은 저절로 생긴다 |
| 이슈 지우기 | 도구 없음 | 사용자에게 부탁 (이슈 페이지의 Delete issue, 관리자만) |
| GitHub 마일스톤(Milestones) 만들기 | 도구 없음 | 마일스톤은 부모 이슈로 대신한다 |
| GitHub 프로젝트(Projects) 보기·고치기 | 도구 없음 | 사용자가 만들어 둔 프로젝트가 있다. 자동 추가·Item closed → Done 작업 흐름으로 이슈와 이어지게 사용자에게 안내 |
| PR 만들기·병합·CI 보기 | 됨 | `create_pull_request`, `merge_pull_request`, `pull_request_read`(get_check_runs). 기다릴 때는 `subscribe_pr_activity` |

## 웹 배포 (GitHub Pages)

- 저장소는 공개(2026-10-28)이고 이름은 `sksskdf/mythic-relics`다(예전 이름 `game`은 GitHub가 넘겨 준다).
- main에 올라오면 `.github/workflows/pages.yml`이 `npm run build`의 `dist`를 Pages에 올린다: https://sksskdf.github.io/mythic-relics/
- 처음 한 번은 저장소 Settings › Pages › Build and deployment › Source를 **GitHub Actions**로 둬야 한다(사용자만 할 수 있음). 안 되어 있으면 워크플로의 `configure-pages`에서 실패한다.
- vite의 `base`가 `./`라 하위 주소에서도 그대로 돈다. 휴대폰 확인은 Playwright의 `isMobile`·`hasTouch`(390×844)로 하위 주소를 열어 본다.

## 아티팩트

- 로드맵 페이지: https://claude.ai/artifact/VLnz4HHR5F7VMGG496TmqK. 다른 세션에서 올릴 때는 `url`을 넘긴다. 처음엔 `action: read`로 읽어야 올릴 수 있다.
- 지켜보기(watch) 등록은 늘 실패한다(mint_failed). 지켜보고 있다고 말하지 않는다.
- 아티팩트 지우기는 사용자가 고른 것만.

## 로드맵 패널 모드

- 원본: `tools/claude-mods/roadmap/` (설치법은 그 폴더 README). 컨테이너 안 자리(`~/.claude/dev-mods/…`)는 세션이 끝나면 사라진다.
- MCP `roadmap` 도구는 모드가 올라와 있을 때만 있다. 없으면 모드를 다시 올리거나, 그 세션은 패널 상태 맞추기를 건너뛰고 사용자에게 알린다.

## 브라우저와 렌더링

- 크롬: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`. Playwright는 설치하지 않는다(`playwright install` 금지).
- WebGL은 swiftshader 소프트웨어 렌더링이다. 초당 몇 프레임이라 **fps·체감 속도는 사용자에게 확인을 부탁한다.** 성능은 `scripts/bench.mjs`의 갱신 시간·그리기 호출·삼각형 수로 본다.
- Electron 확인: `ELECTRON_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader" ELECTRON_SHOT=test-results/electron.png xvfb-run -a node scripts/dev-electron.mjs`

## 네트워크

- 바깥으로 나가는 HTTPS는 프록시를 거친다. 막히면 `/root/.ccr/README.md`와 `curl -sS "$HTTPS_PROXY/__agentproxy/status"`를 본다. TLS 검사를 끄지 않는다.
- 위키 같은 웹 페이지를 직접 가져오기는 DNS에서 실패한 적이 있다 → WebSearch(extended)로 대신했다.

## 디스크

- 쓸 수 있는 양이 세션마다 정해져 있다. "no space left"면 `dist/`, `test-results/`, 캐시를 지운다.
