# 환경과 제약

Claude가 일하는 곳은 클라우드 컨테이너(Claude Code on the web)다. 컨테이너는 세션마다 새로 만들어지고, 쓰지 않으면 거두어진다. **남겨야 할 것은 커밋하고 푸시한다.**

- **저장소 자리 (2026-11-19 컨테이너):** `/home/user/mythic-relics`. 명령은 늘 이 폴더에서 돌린다. 옆의 `/home/user/game`은 버려진 옛 복사본이니 보지 않는다.
- **스크래치 폴더**(세션마다 다른 임시 폴더)는 사라질 수 있다. 다시 만들 수 없는 것은 두지 않는다.

## git과 GitHub

| 할 일 | 되나 | 방법 / 우회 |
| --- | --- | --- |
| clone·fetch | 됨 | |
| push (새 브랜치 포함) | **2026-11-19 현재 안 됨 (403)** | 이 세션에 연결된 GitHub 계정이 저장소 주인(`sksskdf`)의 것이 아니라 `sksskdf/mythic-relics`에 쓰기 권한이 없다. 사용자가 https://claude.ai/connect-github 에서 저장소 주인 계정으로 다시 연결하거나, 연결된 계정에 쓰기 권한을 주면 풀린다. 그때까지는 푸시를 시도하지 않고 커밋을 로컬에 쌓아 패치 묶음으로 보관한다(아래 「아티팩트」). 풀린 뒤에는 `git push -u origin <브랜치>`, 네트워크 오류면 2·4·8·16초 간격으로 4번까지 다시 |
| 원격 브랜치 지우기 | **안 됨** (중간 프록시가 403으로 막음) | 병합을 PR로 하면 저장소 설정 "Automatically delete head branches"가 지운다. 그 밖에는 사용자에게 부탁 (https://github.com/sksskdf/mythic-relics/branches) |
| `gh` CLI | 안 됨 (토큰이 무효) | GitHub MCP 도구(`mcp__github__*`)를 쓴다. 스키마가 안 보이면 ToolSearch로 불러온다 |
| GitHub MCP 도구의 계정 | 세션에 연결된 계정 그대로 | 어느 계정인지는 `get_me`로 본다. 공개 저장소라 읽기(이슈·PR·파일 보기)는 되지만, 쓰기(이슈 고치기·닫기, PR 만들기·병합)는 그 계정에 쓰기 권한이 있어야 한다. **2026-11-19 현재 push와 같은 까닭으로 쓰기가 모두 막혀 있다.** 아래 「됨」은 권한이 있을 때의 이야기다 |
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
- **Actions 결제 잠금 (2026-11-06부터):** 작업이 러너를 배정받지 못해 2초 만에 실패한다(CI·Pages 모두, 11-06 CI #354·Pages #17, 11-10 CI #355). 배포본은 11-03 판(`cb3bd52`, E241)에 멈춰 있다. 사용자가 계정의 Settings › Billing에서 풀어야 하고, 풀리면 main에 새 커밋이 올라올 때나 Pages 워크플로를 다시 돌릴 때 최신 판이 올라간다. 그동안 병합의 문은 로컬 `npm run check`이고(`decisions.md` 2026-11-19 「배포」), 휴대폰 판은 아래 아티팩트로 올린다.
- vite의 `base`가 `./`라 하위 주소에서도 그대로 돈다. 휴대폰 확인은 Playwright의 `isMobile`·`hasTouch`(390×844)로 하위 주소를 열어 본다.

## 아티팩트

- 로드맵 페이지: https://claude.ai/artifact/VLnz4HHR5F7VMGG496TmqK. 다른 세션에서 올릴 때는 `url`을 넘긴다. 처음엔 `action: read`로 읽어야 올릴 수 있다.
- **휴대폰 판 (게임 빌드, 비공개):** https://claude.ai/artifact/GuSvpwWqFbSypEvBxo65G2. Pages가 멈춰 있는 동안 사용자는 이 주소로 휴대폰에서 해 본다. 덩어리가 끝날 때마다 같은 주소에 다시 올린다(2026-11-19에 올라간 판은 `323e00e`).
  - 올리는 법: `npm run build` 뒤 스크래치의 `tools/make-play.mjs <dist 폴더> <스크래치>/play "<판 이름>"`으로 페이지를 다시 만든다. `dist/index.html`의 머리·몸 태그를 떼어 `play/mythic-relics.html`을 쓰고 `assets/*`를 옆에 복사한 뒤, 함께 올릴 파일 목록(경로와 형식)을 찍어 준다. 그 페이지를 `assets/*`(`files`)와 함께 위 `url`로 올린다.
  - 스크래치는 사라질 수 있다. 도구가 없으면 같은 일을 다시 짜면 된다: 페이지는 화면을 채우는 `<div id="app">`에 `assets`의 CSS 하나와 JS 모듈 하나를 거는 것이 전부이고, 글꼴은 `font/woff2`로 올린다.
  - **올리지 못한 커밋의 보관:** 푸시가 막혀 있는 동안은 같은 아티팩트의 `backup/unpushed.patch`에 패치 묶음을 올려 둔다(`git format-patch origin/claude/epic-babbage-e33i2f..HEAD --stdout > <스크래치>/play/backup/unpushed.patch`). 컨테이너가 바뀌면 새로 받은 브랜치 위에서 `git am`으로 되살린다.
- 지켜보기(watch) 등록은 늘 실패한다(mint_failed). 지켜보고 있다고 말하지 않는다.
- 아티팩트 지우기는 사용자가 고른 것만.

## 로드맵 패널 모드

- 원본: `tools/claude-mods/roadmap/` (설치법은 그 폴더 README). 컨테이너 안 자리(`~/.claude/dev-mods/…`)는 세션이 끝나면 사라진다.
- MCP `roadmap` 도구는 모드가 올라와 있을 때만 있다. 없으면 모드를 다시 올리거나, 그 세션은 패널 상태 맞추기를 건너뛰고 사용자에게 알린다.

## 브라우저와 렌더링

- 크롬: `/opt/pw-browsers/chromium`(늘 같은 이름의 고리, 2026-11-19 컨테이너에서는 `chromium-1243`을 가리킨다). 옛 `/opt/pw-browsers/chromium-1194/…` 자리는 없다. 점검 스크립트는 `scripts/lib/browser.mjs` 한 곳에서 이 자리를 읽고 `CHROMIUM_PATH`로 덮을 수 있다. Playwright는 설치하지 않는다(`playwright install` 금지).
- 새 브라우저는 프레임이 0.19초쯤으로 더 느리다(게임 시간은 프레임당 0.1초가 상한). 실제 클릭 하나에 게임 시간이 1초쯤 흐르니, 스모크와 점검 스크립트의 기대는 시간에 기대지 않게 쓴다(`troubleshooting.md`).
- WebGL은 swiftshader 소프트웨어 렌더링이다. 초당 몇 프레임이라 **fps·체감 속도는 사용자에게 확인을 부탁한다.** 성능은 `scripts/bench.mjs`의 갱신 시간·그리기 호출·삼각형 수로 본다.
- Electron 확인: `ELECTRON_ARGS="--use-angle=swiftshader --enable-unsafe-swiftshader" ELECTRON_SHOT=test-results/electron.png xvfb-run -a node scripts/dev-electron.mjs`
- 휴대폰 흉내 (E235): Playwright 새 페이지에 `viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true`를 주면 `(pointer: coarse)`가 맞아 터치 기기로 뜬다. 끌기·두 손가락은 `page.touchscreen`에 없어 캔버스에 `PointerEvent`(`pointerType: 'touch'`, `pointerId`별)를 직접 보낸다(`scripts/smoke.mjs`의 휴대폰 확인). 스크린숏은 `SHOT_SIZE=390x844 SHOT_TOUCH=1 node scripts/shot.mjs …`. 실제 휴대폰의 fps·손맛은 사용자 확인

## 네트워크

- 바깥으로 나가는 HTTPS는 프록시를 거친다. 막히면 `/root/.ccr/README.md`와 `curl -sS "$HTTPS_PROXY/__agentproxy/status"`를 본다. TLS 검사를 끄지 않는다.
- 위키 같은 웹 페이지를 직접 가져오기는 DNS에서 실패한 적이 있다 → WebSearch(extended)로 대신했다.

## 디스크

- 쓸 수 있는 양이 세션마다 정해져 있다. "no space left"면 `dist/`, `test-results/`, 캐시를 지운다.
