# 하네스 바꿀 목록 (초안)

> 2026-11-19. 점검 셋(훅과 규칙 / 역할 / 검사 파이프라인)의 결과를 코드로 다시 확인해 쓴 초안이다.
> 저장소는 `/home/user/mythic-relics`. 아래 경로는 따로 적지 않으면 그 아래다.
> 구현은 한 사람이 한 번에, 따로 뜬 작업 폴더에서, 브라우저 없이 한다. 그 크기에 맞춰 잘랐다.

## 0. 한눈에

하네스의 몸통은 멀쩡한데 **걸려 있지 않다.** 이 컨테이너에서는 세션의 프로젝트 폴더가 저장소의 부모(`/home/user`)라 `.claude/settings.json`이 읽히지 않고, 훅 넷이 모두 꺼져 있다. 커밋 문·main 푸시 막기·낡은 빌드 검사·고친 뒤 알림·세션 요약이 지금은 프롬프트의 말로만 서 있고, 꺼진 것을 알려 주는 장치도 없다. 그래서 차례는 이렇다.

1. **문을 세션 설정에 기대지 않는 곳으로 옮긴다** (C1: 커밋·푸시 문을 git 훅으로). 옮기면 명령 글자를 읽어 판정하던 코드가 통째로 없어지고, 점검이 찾은 구멍 다섯이 함께 닫힌다.
2. **꺼진 것을 스스로 알린다** (C2·C3: 훅이 돈 흔적, 환경 진단 한 번, 세션 요약 고침).
3. **검사 한 바퀴를 한 곳에서 굴린다** (C4: 기다려 주는 잠금, 단계마다 걸린 시간, 안쪽 고리 명령, 스모크가 볼 수 없는 바꿈에는 스모크를 건너뜀).
4. **역할 나눔을 정의로 박는다** (C5: 작성자 정의를 새로, 리뷰어·QA·분석가 정의를 지금 방식에 맞게. 읽기 전용 역할의 git 쓰기는 C2의 명령 훅이 막는다).
5. **낡은 말을 고친다** (C6 규칙 지도, C7 휴대폰 판 도구를 저장소로, C8 스킬 넷과 안내 문서).

바꿀 것은 여덟(C1~C8)이고, 지우는 것이 더하는 것만큼 있다: 커밋 명령 읽기(`checksBeforeCommit`·`skipsCheck`·`hasCommit`), `check-stamp.mjs`, 스킬·에이전트·규칙에 여섯 번 겹쳐 적힌 띠 숫자, 「작업 단위마다 장부」 다섯 군데.

## 1. 다시 확인한 것 (점검 결과 가운데 이 목록이 기대는 것)

| 사실 | 확인한 방법 |
| --- | --- |
| 훅이 이 세션에서 돌지 않는다 | 이 세션의 Bash로 `playwright --version` → `Version 1.63.0`(막혀야 하는 명령). Bash 환경의 `CLAUDE_PROJECT_DIR`은 빈 값, `/home/user/.claude` 없음, 세션 기록 폴더는 `~/.claude/projects/-home-user` 하나. 런처 설정의 훅은 SessionStart·Stop 둘뿐 |
| 문이 꺼진 동안 코드가 「문서만」 커밋에 들어갔다 | `git show --stat 47aabe9`: 제목 끝이 「(문서만)」인데 src 21·tests 6·scripts 2파일 |
| `npm run check 2>&1 \| tail -3 && git commit` 꼴이 pipefail 없이 「검사 뒤 커밋」으로 읽힌다 | `checksBeforeCommit(…)`을 가져다 불러 `true` (`\| tee` 꼴도) |
| 조종 서버는 낡은 빌드·포트 검사에서 빠진다 | `usesBuild('drive')` → `false` (`const PORT = Number(arg(…))`를 정규식이 못 읽음). 절대 경로·`nohup` 앞머리는 `scriptRuns`가 `[]` |
| git의 pre-commit은 「커밋될 인덱스」를 정확히 본다 | 스크래치 저장소에서 `git add 문서`(코드는 더러움), `commit -a`, `commit -- 경로`, `git -C`, 딸린 작업 폴더(worktree) 다섯 꼴 모두 훅 안의 `git write-tree`가 커밋될 트리를 냈다. `HARNESS_SKIP_CHECK=1`은 훅까지 전해진다. 상대 경로 `core.hooksPath`는 worktree에서도 그 폴더 기준으로 풀린다 |
| pre-push는 올릴 줄을 stdin으로 받는다 | `refs/heads/main <sha> refs/heads/main <sha>` 꼴. 지우기는 `(delete) 000… refs/heads/x …`, `--dry-run`에도 돈다 |
| 이 컨테이너의 git 설정은 `core.hooksPath`를 덮지 않는다 | `git config --show-origin --get-all core.hooksPath` 빈 값, `GIT_CONFIG_*`는 주소 바꿔 쓰기와 credential뿐 |
| 훅 입력에 `agent_id`·`agent_type`이 있다 | 깔린 CLI(2.1.328)의 훅 입력 형식 글: 「Present only when the hook fires from within a subagent」 |
| 같은 점검을 다른 작업 폴더 둘에서 함께 돌리면 **뒤에 뜬 쪽이 앞쪽 빌드를 본다** (새로 찾음) | `scripts/smoke.mjs:20-29`·`scripts/playtest.mjs:70-78`의 `waitForServer`는 주소가 답하는지만 본다. 뒤에 뜬 `vite preview --strictPort`는 죽고(출력은 버림) 스크립트는 앞쪽 서버에 붙어 그대로 간다. 지금은 포트 검사 훅도 꺼져 있다 |
| 임시 스크립트를 저장소 `scripts/`에 잠깐 두는 버릇이 도장을 날린다 (새로 찾음) | `docs/knowledge/troubleshooting.md:57`이 그렇게 하라고 적는다. 추적하지 않는 파일도 지문에 들어가(`repo.mjs:33`의 `git add -A`) 검사 도중 생기면 6분짜리 검사가 도장 없이 끝난다 |
| 브라우저 감싸개의 렌더러 손잡이 | `/opt/pw-browsers/chromium`(감싸개 스크립트) 30·148~156줄: 스크립트의 `--use-gl=angle`·`--use-angle=swiftshader`를 떼어 내고, `CHROMIUM_WEBGL_RENDERER=swiftshader-llvm-fast`·`lavapipe-patched`를 받는다. 재 보지는 못했다(브라우저를 띄우지 않기로 함) |

점검 결과에서 **받지 않은 것**과 까닭은 4장에 있다.

## 2. 구현하는 사람에게

- **작업 폴더:** 넘겨받은 따로 뜬 폴더에서만 고친다. `/home/user/mythic-relics`는 다른 갈래가 쓰고 있다.
- **차례:** C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8. `scripts/harness/repo.mjs`·`hook-bash.mjs`·`shell.mjs`·`package.json`·시험 파일을 여럿이 차례로 고치므로 순서를 바꾸지 않는다.
- **한 번에 다 못 하겠으면 이 차례로 덜어 낸다:** C4의 스모크 건너뛰기(6번, `smokeTree`, 시험 3·4) → C7 → C6의 새 규칙 셋. 덜어 낸 것은 보고에 적는다. C1, C2의 1·3·4번, C3, C5는 덜어 내지 않는다. C8의 글은 실제로 구현한 것만 말하게 맞춘다.
- **시험은 임시 저장소에서만.** git을 쓰는 시험은 `tests/helpers/tempRepo.mjs`(C1에서 만듦)로 임시 폴더에 저장소를 세워 돌린다. 진짜 저장소의 `.git`에는 아무것도 쓰지 않는다: 구현 중에 `node scripts/harness/install.mjs`·`npm run check`·`npm ci`를 돌리지 않는다(딸린 작업 폴더는 `.git/config`를 함께 쓴다).
- **임시 저장소의 커밋:** 이 컨테이너의 전역 설정이 서명을 켜 두었다. 시험의 git은 늘 `-c commit.gpgsign=false -c user.name=t -c user.email=t@t`를 붙이고, 환경에서 `GIT_DIR`·`GIT_INDEX_FILE`·`GIT_WORK_TREE`를 뺀 채 부른다(시험이 git 훅이나 리베이스 안에서 돌아도 임시 저장소만 보게). 윈도우에서는 sh 훅이 달리 돌 수 있으니 git 훅을 실제로 태우는 시험은 `it.skipIf(process.platform === 'win32')`.
- **훅의 약속 (바꾸지 않는다):** Claude 훅은 늘 0으로 끝난다. 막을 때만 JSON을 내고, 스스로 틀리면 아무것도 내지 않는다. 막는 글은 `[하네스] `로 시작하고 까닭과 푸는 법을 함께 적는다. git 훅은 「판정이 막음」일 때만 막고 그 밖의 오류는 통과시킨다.
- **건드리지 않는 것:** `src/` 전부, `scripts/smoke.mjs`, 게임 문서(DESIGN·BALANCE·TIMELINE·PLAYTEST 등), `docs/knowledge/handoff.md`·`decisions.md`, `.claude/workflows/`. `CLAUDE.md`는 「하네스」 절과 「기술과 명령」의 하네스 도구 줄만(C8에 줄마다 적었다).
- 주석·시험 이름·문서는 자연스러운 한국어. 모델 이름을 쓰지 않는다.
- **이 문서의 표기:** 넣을 글을 `…` 안에 적은 곳에서 그 안의 `` \` ``는 그냥 백틱이고, 표 안의 `\|`는 그냥 `|`다(역슬래시는 넣지 않는다). `<값>`·`N`·`HH:MM`은 그때의 값으로 바꿔 찍는 자리다.

### 훅의 입력과 출력 (모아 적음)

| 훅 | 입력 | 출력 |
| --- | --- | --- |
| PreToolUse · Bash (`hook-bash.mjs`) | stdin JSON: `session_id`, `cwd`, `tool_name: "Bash"`, `tool_input.command`, 서브에이전트 안이면 `agent_id`·`agent_type` | 통과면 아무것도 없음. 막으면 `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[하네스] …"}}`. 끝 값은 늘 0 |
| PostToolUse · Edit\|Write (`hook-edit.mjs`) | `session_id`, `agent_id`(있으면), `tool_name`, `tool_input.file_path`·`new_string`\|`content`·`old_string`, `tool_response.type` | 알릴 것이 있으면 `{"hookSpecificOutput":{"hookEventName":"PostToolUse","additionalContext":"[하네스] 경로:\n- …"}}` |
| SessionStart (`hook-session.mjs`) | `source` (`startup`·`resume`·`compact`) | `{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}` |
| git pre-commit (`git-hooks/pre-commit` → `gate.mjs commit`) | stdin 없음. 폴더는 그 작업 폴더의 뿌리, `GIT_INDEX_FILE`은 git이 넘긴 「커밋될 인덱스」 | 통과 0, 막음 1 (까닭은 stderr) |
| git pre-push (`git-hooks/pre-push` → `gate.mjs push`) | 인자: 원격 이름·주소. stdin: 줄마다 `<로컬 ref> <로컬 sha> <원격 ref> <원격 sha>` | 통과 0, 막음 1 (까닭은 stderr) |

---

## 3. 바꿀 것

### C1. 커밋 문과 main 푸시 문을 git 훅으로 옮긴다 `[fix]`

**왜.** 겪은 일 6·8과 점검의 가장 큰 발견. 지금 문은 Claude 훅에만 있어 세션 설정이 안 읽히면 통째로 꺼지고(1장 첫 두 줄), 켜져 있어도 명령 글자를 읽어 판정하느라 구멍이 난다: 파이프 뒤 커밋이 「검사 뒤 커밋」으로 통과, 문서만 올리는데 남이 고치던 코드 때문에 막힘, 다른 저장소의 커밋까지 막음, `if…then git commit`·`command git commit` 꼴은 못 봄, 지문 계산 둘이 겹치면 한쪽이 반드시 실패. git 훅은 「무엇이 커밋되나」를 git에게서 직접 받으므로 이 다섯이 한꺼번에 없어진다.

**새 파일.**

`scripts/harness/git-hooks/pre-commit` (실행 권한 755로 올린다. `git ls-files -s`에 `100755`로 보여야 한다)

```sh
#!/bin/sh
# 하네스: 커밋 문. 판정은 scripts/harness/gate.mjs가 하고, 막을 때만 3으로 끝난다.
# 그 밖의 끝 값(스크립트가 없다, node가 없다, 스스로 틀렸다)은 통과시킨다: 훅이 틀려 일을 막지 않게.
gate="$(dirname "$0")/../gate.mjs"
[ -f "$gate" ] || exit 0
node "$gate" commit
[ $? -eq 3 ] && exit 1
exit 0
```

`scripts/harness/git-hooks/pre-push`는 같은 꼴에 `node "$gate" push "$@"` (stdin은 그대로 흘러간다).

`scripts/harness/gate.mjs` (node 내장 모듈만 쓴다: 의존성이 없는 새 컨테이너에서도 돈다)

- `commitVerdict({ staged, head, stamp, skip })` (순수 함수, 시험이 직접 부른다)
  - `staged === head` → 통과 (코드가 HEAD와 같다 = 문서만 든 커밋)
  - `stamp?.tree === staged` → 통과 (검사를 통과한 바로 그 코드)
  - `skip` → 통과 (`HARNESS_SKIP_CHECK=1`)
  - 그 밖 → 막음
- `pushVerdict(lines)`: 원격 ref(셋째 낱말)가 `refs/heads/main`인 줄이 하나라도 있으면 막음 (올리기·지우기 모두)
- `commit` 모드: 폴더는 `process.cwd()`(진짜 저장소 자리 `ROOT`가 아니다. 그래야 worktree와 시험의 임시 저장소에서 맞다). `staged = codeTree(git write-tree)`, `head = HEAD가 있으면 codeTree('HEAD'), 없으면 빈 트리`, `stamp = readStamp(cwd)`, `skip = process.env.HARNESS_SKIP_CHECK === '1'`. 지문 읽기가 던지면 150ms 뒤 한 번 더 하고, 또 던지면 막는다(판정을 못 낸 채 통과시키지 않는다. 지금 훅의 약속 그대로다).
- 끝 값: 통과 0, 막음 3.

막는 글 (stderr, 그대로 쓴다):

```
[하네스] 커밋을 막았다: 이 코드는 `npm run check`를 통과한 적이 없다.
  고치는 동안은 `npm run quick`, 커밋 앞에는 `npm run check`를 통과시킨다 (통과하면 도장이 찍힌다).
  문서(*.md·docs/·.claude/)만 든 커밋은 막지 않는다. --no-verify로 넘기지 않는다.
  사용자가 검사 없이 커밋하라고 했을 때만 `HARNESS_SKIP_CHECK=1 git commit …`.
```

도장이 있고 도장의 트리가 저장소에 남아 있으면(`git cat-file -e <도장 트리>`) `git diff-tree -r --name-only <staged> <도장 트리>`로 다른 파일을 뽑아, 열두 개 이하일 때는 위 글 대신 이 글을 낸다:

```
[하네스] 커밋을 막았다: 검사를 통과한 코드와 커밋하려는 코드가 다르다.
  다른 파일: src/a.ts, tests/b.test.ts 외 2개
  검사한 그대로 올린다 (빠뜨린 파일을 `git add`). 검사 뒤에 고쳤거나 지웠으면 `npm run check`를 다시 통과시킨다.
  남이 고치던 코드가 섞여 있으면 올리지 말고 총괄에게 알린다 (같은 폴더에서 둘이 코드를 고치면 도장이 맞지 않는다).
```

그 밖의 글: 건너뛸 때 `[하네스] 검사 없이 커밋한다 (HARNESS_SKIP_CHECK=1).`, 지문을 못 읽을 때 `[하네스] 커밋을 막았다: 코드 지문을 읽지 못했다 (<오류 첫 줄>). 한 번 더 해 보고, 그래도면 \`node scripts/harness/doctor.mjs\`.`, 푸시 `[하네스] 푸시를 막았다: main에는 바로 올리지 않는다. 브랜치를 올리고 PR로 병합한다 (CLAUDE.md Git).`

`scripts/harness/install.mjs`: `installGitHooks(cwd = process.cwd(), env = process.env)`와 그것을 부르는 한 줄짜리 CLI. 무엇이 틀려도 0으로 끝난다.

- git 작업 폴더가 아니면 아무것도 하지 않는다.
- `env.CLAUDECODE !== '1' && env.HARNESS_HOOKS !== '1'`이면 아무것도 하지 않는다 (사용자 컴퓨터와 CI에는 걸지 않는다. 이 세션의 Bash에는 `CLAUDECODE=1`이 있다).
- `git config --get core.hooksPath`가 비었으면 `scripts/harness/git-hooks`(상대 경로)로 걸고 훅 파일에 실행 권한을 준 뒤 `[하네스] git 훅을 걸었다 (커밋·푸시 문). 환경 진단: node scripts/harness/doctor.mjs` 한 줄. 이미 그 값(또는 `/scripts/harness/git-hooks`로 끝나는 절대 경로)이면 조용히 끝. 다른 값이면 건드리지 않고 `[하네스] core.hooksPath가 이미 <값>이다. 하네스 git 훅을 걸지 않았다.`
- 돌려주는 값: `'installed' | 'already' | 'other' | 'skipped'` (시험과 doctor가 쓴다).
- `package.json`에 `"prepare": "node scripts/harness/install.mjs"` (새 컨테이너의 `npm ci`에서 저절로 걸린다. C4의 검사 시작과 C3의 세션 훅도 같은 함수를 부른다).

**`scripts/harness/repo.mjs` 고침.**

- `ROOT`는 스크립트 자리에서만 읽는다 (`process.env.CLAUDE_PROJECT_DIR ??`를 뺀다). 프로젝트 폴더가 부모여도 맞는 저장소를 본다.
- `gitDir`은 `git rev-parse --absolute-git-dir`.
- 임시 인덱스 이름에 `process.pid`를 붙인다. `workTree(cwd)`는 캐시 인덱스(`harness-index`)를 `harness-index.<pid>`로 복사해 쓰고, 끝나면 `renameSync`로 캐시에 되돌려 놓는다(실패해도 `finally`에서 임시 파일과 `.lock`을 지운다). `commitTree`는 `codeTree(treeish, cwd)`로 이름을 바꾸고 커밋·트리 어느 쪽이든 받는다(`harness-index-head.<pid>`).
- `checkState`는 그대로 둔다(doctor·what-to-run이 쓴다).

**`hook-bash.mjs`·`shell.mjs`에서 지우는 것.** 커밋 판정 블록(지금 34~49줄)과 `checksBeforeCommit`·`skipsCheck`·`hasCommit`. `leadingDir`은 낡은 빌드 검사가 쓰니 남긴다. `tests/harness.test.mjs`에서 그 셋의 시험을 지우고, 「이 저장소에서 코드 지문을 읽는다」 시험은 임시 저장소에서 읽게 바꾼다(단위 시험이 진짜 `.git`에 인덱스를 쓰면 함께 도는 검사와 부딪힌다).

**알고 넣는 것 (총괄이 알아야 할 달라지는 점).** 지금 훅은 「작업 폴더 전체가 도장과 같은가」를 봐서, 검사 뒤 제 파일만 골라 올려도 통과했다(골라 올린 부분만으로는 검사한 적이 없는데도). 새 문은 「커밋될 코드가 도장과 같은가」를 본다. 그래서 ① 문서만 올리는 커밋은 코드가 더러워도 늘 통과하고 ② 검사 뒤 새 파일을 빠뜨린 커밋은 막히며 ③ 같은 폴더에서 둘이 코드를 고치는 동안에는 어느 쪽도 코드를 올리지 못한다(지금도 도장을 못 받으니 실제로는 같다. 함께 도는 작성자는 작업 폴더를 따로 쓴다). 훅은 저장소 안에 있어 판과 함께 간다: 훅 폴더가 없는 옛 커밋을 꺼내 놓은 작업 폴더에서는 문이 없다(git은 없는 훅을 조용히 지나친다). 병합 커밋(`git merge`가 스스로 만드는 것)·체리픽·`git am`은 지금처럼 문을 거치지 않는다.

**시험** (`tests/harnessGate.test.mjs`, 임시 저장소. 도우미 `tests/helpers/tempRepo.mjs`: 저장소 세우기·파일 쓰기·서명 끈 커밋·`core.hooksPath`를 이 저장소의 `scripts/harness/git-hooks` 절대 경로로 걸기)

1. `commitVerdict`·`pushVerdict` 네 갈래와 push 줄 꼴(main, `HEAD:refs/heads/main`에 해당하는 줄, 지우기, 다른 브랜치).
2. 실제 `git commit`으로: 코드가 더러운 채 문서만 `git add` → 통과 / 코드를 올리는데 도장 없음 → 실패하고 stderr에 `npm run check` / 도장을 그 코드로 찍은 뒤 → 통과 / 검사 뒤 생긴 새 파일을 빼고 올림 → 실패하고 그 파일 이름이 보임.
3. `git commit -a`, `git commit -m x -- 경로`, `git -C <폴더> commit` 꼴도 같은 판정.
4. `HARNESS_SKIP_CHECK=1 git commit` → 통과하고 stderr 한 줄.
5. 딸린 작업 폴더(worktree)에서는 그 폴더의 도장을 본다.
6. 실제 `git push`(임시 맨몸 원격): main으로 → 실패, 브랜치로 → 통과, `:main` 지우기 → 실패.
7. gate가 스스로 틀리면 커밋이 통과한다: 임시 폴더에 감싸개(`git-hooks/pre-commit`)를 복사하고 그 옆에 던지기만 하는 `gate.mjs`를 둔 뒤 `core.hooksPath`를 그리로 걸어 본다(진짜 gate에 시험용 옆문을 두지 않는다). `gate.mjs`가 아예 없을 때도 통과한다.
8. 지문 계산 여덟을 한꺼번에 돌려도 하나도 실패하지 않는다 (자식 프로세스 여덟이 같은 임시 저장소의 `workTree`를 부른다).
9. `installGitHooks`: `CLAUDECODE=1`이면 걸고 `'installed'`, 다시 부르면 `'already'`, 다른 값이 있으면 건드리지 않고 `'other'`, 환경 변수가 없으면 `'skipped'`.

---

### C2. 명령 훅을 고친다: 흔적 남기기, 읽기 전용 역할, 틀린 읽기 `[fix]`

**왜.** 겪은 일 1·5·9. 훅이 여드레 넘게 꺼져 있었는데 「틀리면 통과」 설계라 아무도 몰랐다. 조종 서버·절대 경로·`nohup` 꼴은 낡은 빌드 검사를 빠져나간다. `playwright --version`은 막고 `npx playwright-core install`은 통과시킨다. 읽기 전용 역할은 말로만 막는다.

**`hook-bash.mjs`의 새 차례** (C1에서 커밋 판정이 빠진 뒤)

1. `markAlive(input)`: `input.session_id`가 있을 때 공용 git 폴더의 `harness/alive.json`에 `{ at, session, projectDir: process.env.CLAUDE_PROJECT_DIR ?? null }`를 쓴다(try로 감싼다. 0.1ms). 공용 git 폴더는 git을 부르지 않고 찾는다: `ROOT/.git`이 폴더면 그것, 파일이면(딸린 작업 폴더) 그 안의 `gitdir:` 경로와 그 폴더의 `commondir` 파일을 따라간다. 시험의 입력에는 `session_id`를 넣지 않아 진짜 저장소에 흔적이 남지 않게 한다.
2. 일찍 끝내기: 명령에 `git`·`playwright`·`node`·`npm`·`pnpm`·`npx`·`xvfb-run` 낱말이 없으면 여기서 끝낸다. `branch()`(git 한 번)는 명령에 `push`가 있을 때만 부른다.
3. 브라우저 설치: `installsBrowser(command)`. 한 토막 안에서 `playwright`·`playwright-core`·`…/playwright-core/cli.js`로 끝나는 낱말이 **앞에**, `install`·`install-deps`가 **뒤에** 있을 때만 참이다. `npx playwright install`, `npx -y playwright-core install chromium`, `pnpm exec playwright install`, `node node_modules/playwright-core/cli.js install`, `npx playwright install-deps`는 막고, `playwright --version`, `npm install playwright-core`(꾸러미 설치), `grep playwright package.json`은 통과.
   글: `[하네스] playwright install은 하지 않는다. 브라우저는 깔려 있다: 못 찾으면 \`node scripts/harness/doctor.mjs\`로 자리를 보고 CHROMIUM_PATH로 준다 (docs/knowledge/environment.md).`
4. 읽기 전용 역할: `input.agent_type`의 마지막 `:` 뒤가 `READ_ONLY`(`game-reviewer`·`playtest-qa`·`balance-analyst`)에 있으면 `gitWrite(command)`를 본다. git 토막의 하위 명령이 `add·am·apply·checkout·cherry-pick·clean·commit·merge·mv·pull·push·rebase·reset·restore·revert·rm·stash·switch` 가운데 하나면 막는다. `status·diff·log·show·fetch·worktree·branch·rev-parse` 등은 그대로 둔다(QA가 견줄 빌드를 뜨려고 `git worktree add`를 쓸 수 있다). 파일 쓰기는 막지 않는다(QA는 `test-results/`와 스크래치에 써야 한다).
   글: `[하네스] 읽기만 하는 역할(<agent_type>)이다: \`git <하위 명령>\`은 저장소 상태를 바꾼다. 볼 때는 git show·diff·log·status를 쓰고, 고칠 것은 보고에 적는다 (고치는 것은 game-builder).`
   `agent_type`이 없으면(주 세션, 옛 CLI) 아무것도 하지 않는다.
5. 푸시: `pushProblem`은 그대로 둔다 (친절한 앞 층. main 푸시의 문은 C1의 pre-push다).
6. 훅 건너뛰기: `skipsVerify(command)`. `git commit`에 `--no-verify`나 `n`이 든 짧은 옵션 묶음(`-n`, `-nm`), `git push`·`git merge`에 `--no-verify`. (`git push -n`은 미리 해 보기라 막지 않는다.)
   글: `[하네스] git 훅을 건너뛰지 않는다 (--no-verify). 커밋 문은 \`npm run check\`의 도장을 본다. 사용자가 검사 없이 커밋하라고 했을 때만 \`HARNESS_SKIP_CHECK=1 git commit …\`.`
   (문을 git 훅으로 옮기며 생긴 옆문을 닫는 한 줄이다. 새 규칙이 아니라 지금 문의 세기를 지키는 것이다.)
7. 낡은 빌드·포트: 지금 그대로 두되 읽기를 고친다(아래).

**`shell.mjs`·`repo.mjs` 고침.**

- `segments`: 토막 앞의 `then·do·else·elif·{·!·time·command·exec·nohup·setsid·builtin`을 벗기고, 낱말 끝의 `&`를 뗀다 (`if …; then git push --force …; fi`, `git push -f origin x&`를 읽는다).
- `scriptRuns`: 스크립트 낱말은 `scripts/<이름>.mjs`로 **끝나면** 받고(절대 경로, `./`), 그 앞 낱말 가운데 `node`가 있으면 된다(`nohup`·`time`·`env X=1`·`xvfb-run -a`·`timeout 600` 뒤 어디든). 절대 경로면 그 경로의 저장소 뿌리를 돌려줘 낡은 빌드를 그 폴더에서 견준다.
- `usesBuild(script)`: 포트 숫자가 아니라 그 스크립트(나 그것이 부르는 스크립트)가 `'vite', 'preview'`를 띄우는지로 읽는다. `scriptPorts`는 그대로다(조종 서버는 포트가 인자라 포트 검사만 건너뛴다).
- `hooksAlive(now = Date.now(), cwd = ROOT)` → `{ seen, minutes, projectDir }`. 공용 git 폴더(`git rev-parse --git-common-dir`)의 `alive.json`을 읽는다. 딸린 작업 폴더에서 검사를 돌려도 같은 흔적을 본다. C3·C4가 쓴다.

**시험** (`tests/harnessHooks.test.mjs`: 훅 스크립트를 자식 프로세스로 돌려 stdin JSON → stdout을 본다. 한 번에 35ms쯤)

1. 브라우저 설치 꼴 다섯은 막고 넷은 통과 (위 3의 목록 그대로).
2. `agent_type: 'playtest-qa'` + `git add -A` / `git stash` / `cd x && git commit -m y` → 막음. 같은 역할의 `git diff`·`git worktree add …`·`node scripts/drive.mjs …`·`echo x > test-results/a.txt` → 통과. `agent_type: 'game-builder'`나 없음 + `git add -A` → 통과. `'mythic-relics:game-reviewer'`처럼 앞에 이름이 붙어도 막음.
3. `git commit --no-verify -m x`, `git commit -nm x` → 막음. `git commit --amend --no-edit`, `git push -n origin x` → 통과.
4. `git commit -m x`는 무엇이든 통과한다 (판정은 이제 git 훅의 몫).
5. `if true; then git push --force origin x; fi`, `git push -f origin x&` → 막음.
6. 빈 stdin·깨진 JSON·`tool_input` 없음 → 출력 없음, 끝 값 0.
7. `scripts/*.mjs` 가운데 `vite preview`를 띄우는 것은 모두 `usesBuild`가 참이다 (파일을 훑는 시험. 조종 서버가 다시 빠지지 않게).
8. `scriptRuns`: 절대 경로, `nohup node scripts/shot.mjs a.png &`, `time node scripts/feel-qa.mjs`, `node scripts/drive.mjs --port=4341`을 읽는다. `node scripts/harness/what-to-run.mjs`는 여전히 `[]`.
9. `READ_ONLY`가 `.claude/agents/*.md` 가운데 `tools:`에 Edit·Write가 없는 정의의 이름과 같다 (읽기 전용 정의를 더하면 목록도 고치게).

---

### C3. 환경 진단 한 번과 세션 요약 `[add]`

**왜.** 겪은 일 1·3. 컨테이너가 바뀐 날 저장소 자리·브라우저·의존성·옛 복사본을 손으로 하나씩 찾았고, 훅이 꺼진 것은 이번 점검에서야 드러났다. 세션 요약은 첫 파일 이름을 잘라 내고(`LAYTEST.md`), 인수인계를 12,000자 통째로 넣는다.

**`scripts/harness/doctor.mjs`** (읽기만. 1초 안. 끝 값은 늘 0). `diagnose({ quick })`가 `[{ key, ok, text }]`를 돌려주고, CLI는 줄마다 `ok`면 두 칸 들여쓰기, 아니면 `! `를 앞에 붙여 찍는다.

| 줄 | 보는 것 | 걸릴 때의 글 |
| --- | --- | --- |
| 저장소 | `ROOT`, 브랜치, `unpushed()` | `올리지 않은 커밋 N개: 컨테이너가 거두어지면 사라진다. 푸시하거나, 막혀 있으면 \`node scripts/play-page/build.mjs <폴더>\`가 패치 묶음을 만든다.` |
| Claude 훅 | `CLAUDECODE=1`일 때만 판단. `hooksAlive()`가 30분 안이면 `돈다 (N분 전)` | `이 세션에서 돈 흔적이 없다. .claude/settings.json은 세션의 프로젝트 폴더가 이 저장소일 때만 읽힌다 (저장소가 둘 붙은 세션은 부모 폴더가 프로젝트 폴더가 된다). 고친 뒤 알림·세션 요약·읽기 전용 역할 막기가 꺼져 있다. 커밋·푸시 문은 git 훅이 지킨다. 푸는 법: docs/knowledge/environment.md 「훅이 실리지 않을 때」.` 흔적은 있는데 `projectDir`이 `ROOT`가 아니면 `돈다 (프로젝트 폴더는 <값>)` |
| git 훅 | `core.hooksPath`와 훅 파일의 실행 권한. `CLAUDECODE=1`일 때만 판단한다(사용자 컴퓨터와 CI에는 걸지 않는 것이 맞다) | `걸려 있지 않다 → \`node scripts/harness/install.mjs\`` (다른 값이면 그 값을 보인다) |
| 의존성 | `node_modules`, `playwright-core`의 판 | `의존성이 없다 → \`npm ci\` (사용자 컴퓨터에서는 pnpm)` |
| 브라우저 | `scripts/lib/browser.mjs`의 `BROWSER`와 그것이 가리키는 실제 폴더 | `브라우저를 찾지 못했다 (찾아본 곳: …). CHROMIUM_PATH로 자리를 주거나 scripts/lib/browser.mjs의 후보에 더한다. playwright install은 하지 않는다.` (`browser.mjs`가 후보 목록 `CANDIDATES`도 내보내게 한다) |
| 옛 복사본 | `ROOT`의 이웃 폴더 가운데 `package.json`의 `name`이 같은 것 | `옆에 같은 저장소의 다른 복사본이 있다: <경로> (HEAD <짧은 해시>). 그쪽 CLAUDE.md·스킬·에이전트 정의가 세션에 함께 실릴 수 있다. 보지 않는다. 세션에서 떼는 것은 사용자 몫이다.` |
| 빌드 | `staleBuild()` | `dist가 <파일>보다 오래됐다 → 점검 앞에 \`npm run build\`` |
| 검사 도장 | `checkState()`, 도장의 때와 걸린 시간(C4) | `코드가 바뀐 뒤 아직 \`npm run check\`를 통과하지 않았다` |
| 남은 서버 (`quick`이면 건너뜀) | 점검 스크립트들의 포트와 4310 | `포트 N에 미리보기 서버가 떠 있다. 돌고 있는 점검이 없으면 \`pkill -f "[v]ite preview --port N"\`` |

**`hook-session.mjs` 고침.**

- `git status --short`는 `trimEnd`로 읽는다(앞 빈칸이 지워지면 첫 파일 이름이 잘린다). 파일 이름 뽑기는 `statusFiles(text)`로 떼어 시험한다.
- 인수인계는 `handoffDigest(md)`로 줄여 넣는다: 「한 줄 요약」은 첫 문단만(900자에서 자르고 `…`), 「다음 할 일」은 번호 줄마다 220자, 「사용자에게 받아야 할 것」은 맨 위 불릿만 160자씩(딸린 줄은 뺀다). 끝에 `(줄인 것이다. 온전한 글과 상태 표는 docs/knowledge/handoff.md)`. 합쳐 4,000자를 넘지 않는다.
- 「## 저장소」에 올리지 않은 커밋 수를 더하고, 그 아래 「## 환경 (걸리는 것만. 전체는 `node scripts/harness/doctor.mjs`)」에 `diagnose({ quick: true })`의 걸린 줄만 넣는다. 걸린 것이 없으면 그 절을 내지 않는다.
- 맨 앞에서 `installGitHooks(ROOT)`를 부른다(try로 감싼다).
- 「## 하네스」의 두 줄을 고친다: `- 커밋·푸시 문은 git 훅이 지키고, 낡은 빌드·포트 충돌·읽기 전용 역할의 git 쓰기는 명령 훅이 막는다. 고치는 동안은 \`npm run quick\`, 커밋 앞에는 \`npm run check\`. 바뀐 것에 맞는 점검: \`node scripts/harness/what-to-run.mjs HEAD\``, `- 역할: game-builder(갈래를 만들고 고침), game-reviewer(읽기만), playtest-qa(봇·손 QA, 읽기만), balance-analyst(수치 분석, 읽기만). 스킬: /roadmap-sync, /balance-pass, /qa-pass, steward`.

**시험** (`tests/harnessHooks.test.mjs`에 더함)

1. `statusFiles(' M PLAYTEST.md\n?? a.png\nR  x -> y')` → `['PLAYTEST.md', 'a.png', 'x -> y']` (첫 줄의 첫 글자가 잘리지 않는다).
2. `handoffDigest`: 문단 셋짜리 「한 줄 요약」에서 첫 문단만 남고, 3,000자짜리 번호 줄이 220자로 잘리고, 딸린 불릿이 빠지고, 전체가 4,000자 아래다.
3. `diagnose`를 사실을 꾸며 넣어(함수 인자로 받게 짠다: `{ env, alive, hooksPath, browser, siblings, stale }`) 줄마다 걸림·안 걸림을 본다. `CLAUDECODE`가 없으면 Claude 훅 줄을 판단하지 않는다.
4. `hook-session.mjs`를 자식 프로세스로 돌리면 깨지지 않는 JSON이 나오고 `additionalContext`가 6,000자 아래다.

---

### C4. 검사 한 바퀴를 한 곳에서: 기다림, 걸린 시간, 안쪽 고리, 스모크 건너뛰기 `[speed]`

**왜.** 겪은 일 5·6. `npm run check` 6분 23초 가운데 스모크가 6분 4초인데, 스모크가 볼 수 없는 것(시험·하네스·점검 스크립트)만 바뀐 커밋도 스모크를 통째로 돈다. 고치는 동안 쓸 이름 붙은 짧은 검사가 없다. 검사 둘이 겹치면 포트 4173에서 부딪히거나 **남의 빌드를 스모크한다**(1장). 도장을 못 찍고 끝나도 무엇이 바뀌었는지 말해 주지 않고, 도장 찍기가 틀리면 아무 말이 없다.

**`package.json`.**

```json
"quick": "tsc --noEmit && vitest run",
"check": "node scripts/harness/check.mjs",
```

`build`·`test`·`smoke`는 그대로다. `scripts/harness/check-stamp.mjs`는 지운다(시작·통과는 `check.mjs`가, 상태는 doctor가 한다).

**`scripts/harness/check.mjs`.** `runCheck({ cwd, steps, env, log, wait })`를 내보내고 CLI는 기본값으로 부른다. 기본 단계는 `빌드: npm run build` → `단위: npm test` → `스모크: npm run smoke`(윈도우에서는 `shell: true`). 자식은 `stdio: 'inherit'`, 환경에 `VITE_CONFIG_NATIVE_IGNORE_WARNING=true`를 더한다(검사 기록 184줄 가운데 90줄이 같은 vite 경고다). 시험은 모듈을 가져다 `steps`에 가짜 명령을 넣어 부른다. CLI에는 단계를 바꾸는 옆문을 두지 않는다(환경 변수 하나로 아무것도 돌리지 않고 도장을 받는 길이 생긴다). 도장은 그 작업 폴더의 git 폴더에, 잠금은 공용 git 폴더에 둔다.

1. `installGitHooks(cwd, env)` (try).
2. `env.CLAUDECODE === '1'`이고 `hooksAlive()`가 30분 안이 아니면 한 줄: `[하네스] 이 세션에서는 Claude 훅(고친 뒤 알림·세션 요약)이 돌고 있지 않다. 커밋·푸시 문은 git 훅이 지킨다. 까닭: node scripts/harness/doctor.mjs`
3. **잠금.** `<git 공용 폴더>/harness/check.lock`(`git rev-parse --git-common-dir`: 딸린 작업 폴더들이 함께 본다)을 `flag: 'wx'`로 만든다. 내용은 `{ pid, at, cwd }`. 이미 있으면 그 pid가 살아 있는지 보고(`process.kill(pid, 0)`), 죽었으면 지우고 다시 잡는다. 살아 있으면 `[하네스] 다른 검사가 돌고 있어 기다린다 (pid N, HH:MM 시작, <폴더>).`를 한 번 찍고 5초마다 다시 본다(5분마다 `아직 기다린다` 한 줄). 45분을 넘기면 `[하네스] 다른 검사를 45분 기다렸지만 끝나지 않았다 (pid N). 멈춘 검사면 끄고 다시 돌린다.`를 찍고 끝 값 1로 끝난다. 끝날 때(`exit`·SIGINT·SIGTERM)에 제 잠금만 지우고, 신호를 받으면 돌던 단계의 자식도 끈다. `process.kill(pid, 0)`이 권한 오류(EPERM)를 내면 살아 있는 것으로 친다. git 저장소가 아니면 잠금 없이 간다.
4. **시작 지문.** `begin = workTree(cwd)`, `smokeNow = smokeTree(begin, cwd)`. 추적하지 않는 파일(`git ls-files --others --exclude-standard`) 가운데 `src/`·`tests/`·`scripts/`·`electron/`·`.github/` 밖의 것이 있으면 한 줄: `[하네스] 추적하지 않는 파일이 지문에 들어간다: a.png, tmp.mjs. 커밋할 것이 아니면 지금 지운다 (검사 뒤에 지우면 도장이 맞지 않는다. 점검 산출물은 test-results/, 임시 스크립트는 scripts/.scratch/).`
5. **단계.** 차례로 돌리고 걸린 초를 잰다. 실패하면 `[하네스] 검사 실패: <단계> (N초). 도장을 찍지 않았다.`를 찍고 그 끝 값으로 끝난다.
6. **스모크 건너뛰기.** `!env.CI && env.HARNESS_FULL !== '1' && stamp?.smokeTree === smokeNow`일 때만 스모크를 건너뛰고 찍는다: `[하네스] 스모크를 건너뛴다: 스모크가 보는 것(src·index.html·설정·의존성·scripts/smoke.mjs)이 마지막 통과(HH:MM) 때와 같다. 늘 돌리려면 HARNESS_FULL=1.`
7. **통과.** `workTree(cwd)`를 다시 재 `begin`과 같으면 도장 `{ tree, smokeTree, at, seconds: { build, test, smoke }, smoke: 'ran' | 'skipped' }`을 쓰고 `[하네스] 검사 통과 6분 23초 (빌드 6 · 단위 12 · 스모크 364). 도장을 찍었다: 이 코드 그대로 커밋할 수 있다.` 다르면 `git diff-tree -r --name-only`로 바뀐 파일을 여섯 개까지 보인다: `[하네스] 검사하는 동안 코드가 바뀌어 도장을 찍지 않았다: stray-shot.png, src/a.ts. 다른 에이전트가 같은 폴더에서 고치고 있거나 점검이 저장소 안에 파일을 남겼다. 커밋하려면 다시 검사한다.` (끝 값은 지금처럼 0이다. 커밋은 git 훅이 막는다.)
8. 지문·도장 쪽이 던지면 `[하네스] 도장을 찍지 못했다: <까닭>`을 찍고 단계의 끝 값으로 끝난다(검사 자체는 막지 않는다. git이 없는 곳 포함).

**`repo.mjs`에 더함.** `smokeTree(codeTreeId, cwd)`: 임시 인덱스에 그 트리를 읽고 `SMOKE_BLIND = ['tests', '.github', 'electron', 'scripts']`를 뺀 뒤, `SMOKE_KEEP = ['scripts/smoke.mjs', 'scripts/lib/browser.mjs']`를 `git ls-tree`로 찾아 `git update-index --add --cacheinfo`로 되돌려 넣고 `write-tree`.

**커밋 문이 약해지지 않는 까닭.** 도장이 찍히는 조건은 그대로 「이 코드 트리로 타입 검사·빌드·단위 테스트가 통과했다」이고, 스모크는 「이 트리에서 스모크가 읽을 수 있는 부분이, 스모크가 실제로 돌아 통과한 트리의 그 부분과 글자 그대로 같다」일 때만 건너뛴다. 스모크는 `dist`(= src·index.html·vite.config.ts·tsconfig.json·package.json·package-lock.json에서 나옴)와 제 스크립트·`scripts/lib/browser.mjs`·`src/data/scenes.json`만 읽는다. 목록이 낡는 것은 시험 3이 지킨다. CI는 늘 다 돈다.

**함께.**

- `.gitignore`에 `scripts/.scratch/` 한 줄. node_modules를 찾아야 하는 임시 스크립트를 둘 자리다(git이 보지 않으니 지문에 들지 않는다). `docs/knowledge/troubleshooting.md:57`의 「저장소 `scripts/` 안에 잠깐 두고(`.` 이름)」를 「`scripts/.scratch/`에 두고」로 고친다.
- `.github/workflows/ci.yml`: `on.push`를 `branches: [main]`으로 좁히고 `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`를 더한다(지금은 PR 브랜치에 올릴 때마다 검사와 봇 판이 두 번 돈다. 결제 잠금이 풀리면 분이 곱절로 든다).

**시험** (`tests/harnessCheck.test.mjs`, 임시 저장소와 가짜 단계)

1. 가짜 단계 셋이 통과하면 도장에 `tree`·`smokeTree`·`seconds`가 적히고 끝 값 0. 둘째 단계가 7로 끝나면 끝 값 7, 도장 없음, 셋째는 돌지 않는다.
2. 단계가 도는 동안 파일이 생기면 도장을 찍지 않고 그 파일 이름을 찍는다.
3. `smokeTree`: `tests/x.test.ts`·`scripts/harness/a.mjs`·`scripts/playtest.mjs`·`.github/x.yml`을 바꿔도 같고, `src/a.ts`·`index.html`·`package.json`·`scripts/smoke.mjs`·`scripts/lib/browser.mjs`를 바꾸면 달라진다. 그리고 진짜 `scripts/smoke.mjs`를 읽어 상대 경로 `import`와 `readFileSync('…')`의 글자 경로가 모두 `SMOKE_KEEP`이거나 `SMOKE_BLIND` 밖인지 본다.
4. 스모크 건너뛰기: 통과한 뒤 `tests/`만 바꾸고 다시 돌리면 스모크 단계가 돌지 않고 도장의 `smoke`가 `'skipped'`. `src/`를 바꾸면 돈다. `CI=true`나 `HARNESS_FULL=1`이면 늘 돈다. 옛 꼴 도장(`smokeTree` 없음)이면 돈다.
5. 잠금: 살아 있는 pid의 잠금이 있으면 기다렸다가(`wait.everyMs`를 20ms로) 그 프로세스가 끝난 뒤 돈다. 죽은 pid의 잠금은 바로 넘겨받는다. 끝나면 잠금 파일이 없다. `maxMs`를 넘기면 1로 끝난다.
6. `package.json`의 `check`가 `check.mjs`를 가리키고 `quick`·`prepare`가 있다.

---

### C5. 역할을 정의로 박는다 `[add]`

**왜.** 사용자가 물은 것(작성자·리뷰어·QA로 나눠 하는가)의 답이 하네스에 없다. 가장 많이 세우는 역할인 작성자·고치는 사람은 정의가 없어 규칙이 워크플로 스크립트마다 손으로 다시 적히고(그 스크립트는 컨테이너와 함께 사라지는 곳에 있다), 리뷰어·QA 정의는 옛 방식(브랜치 전체를 읽음, 390×844, 무조건 빌드, 긴 점검은 줄여 돌림)을 말한다. 문서의 역할 표는 「만들기 = 메인 세션」이다.

**새 파일 `.claude/agents/game-builder.md`** (`tools:` 줄을 두지 않는다: 도구를 모두 물려받는다)

```markdown
---
name: game-builder
description: 갈래 하나(사양의 한 절이나 리뷰 지적 묶음)를 구현하거나 고치고, 전체 검사를 통과시켜 커밋한다. 총괄이 맡긴 파일 안에서만 일하고, 제 일을 스스로 통과시키지 않는다(판정은 game-reviewer와 playtest-qa가 한다).
---

너는 이 게임의 작성자다. 총괄(주 세션)이 갈래 하나를 맡기면 그것만 만들어 넘긴다. 리뷰 지적을 넘겨받았으면 고치는 사람이다.

## 넘겨받는 것

갈래 이름, 기준 사양 절, 맡은 파일, 끝난 기준, 작업 폴더, 커밋 꼬리 두 줄. 고침이면 지적 목록. 빠진 것이 있으면 짐작하지 말고 그 사실을 보고에 적는다.

## 일하는 곳

- 넘겨받은 작업 폴더에서만 일한다. 명령은 `cd <그 폴더> &&`로 시작한다. 옆에 같은 저장소의 옛 복사본이 있어도 보지 않는다(`node scripts/harness/doctor.mjs`가 알려 준다).
- 함께 도는 작성자가 있으면 작업 폴더를 따로 쓴다. 같은 폴더에서 둘이 코드를 고치면 어느 쪽도 검사 도장을 받지 못한다.
- 임시 파일은 스크래치 폴더에, node_modules가 필요한 임시 스크립트는 `scripts/.scratch/`에 두고 끝나면 지운다. 점검 산출물은 `test-results/` 아래에만 둔다.

## 차례

1. 사양 절과 맡은 파일을 읽는다. 사양의 줄 번호는 낡았을 수 있으니 이름으로 찾는다. 사양과 코드가 다르면 코드를 먼저 확인하고, 따를 수 없는 곳은 고치지 말고 까닭을 돌려준다.
2. 고치고 시험을 함께 넣는다(규칙·수치는 단위 테스트, 화면·입력은 스모크). 고치는 동안은 `npm run quick`.
3. `npm run check > test-results/check-<갈래>.log 2>&1; echo "끝 $?" >> test-results/check-<갈래>.log`로 전체 검사를 돌리고 끝을 기다린다. 다른 검사가 돌고 있으면 스스로 기다린다. 제 바꿈이 깨는 단위 테스트와 스모크 줄은 이 갈래가 고친다.
4. `git status --short`로 제 바꿈만 있는지 보고 검사한 그대로 커밋한다. 커밋 문(git 훅)은 검사를 통과한 코드만 받는다. 남의 파일이 섞여 있으면 올리지 말고 멈춰 알린다. 문서만 든 커밋은 검사 없이 된다.
5. 커밋 메시지는 한국어 한 줄 제목과 필요한 만큼의 본문, 맨 끝에 넘겨받은 꼬리 두 줄.

## 고치는 사람일 때

지적마다 코드를 읽어 실제로 틀리는지 먼저 확인한다. 틀린 지적은 받지 않고 까닭을 적는다. 맞는 것은 그 틀림을 잡는 시험과 함께 고친다. 작은 것(nit)은 맞는 것만 함께 고친다.

## 하지 않는 것

- 푸시, 브랜치 만들기, `git stash`·`reset`·`rebase`·`commit --amend` (총괄이 시켰을 때만).
- `HARNESS_SKIP_CHECK`와 `--no-verify`. 시험을 지우거나 건너뛰게 하거나 문턱을 올려 통과시키기.
- 맡은 파일 밖을 고치기(제 바꿈이 깨뜨린 시험·스모크 줄은 고치고 보고에 적는다).
- 제 일이 됐다고 스스로 판정하기. 화면·손맛·수치의 판정은 리뷰어와 QA의 몫이다.
- 장부(ROADMAP.md 체크, GitHub 이슈, 아티팩트)와 `docs/knowledge/handoff.md`. 총괄이 덩어리 끝에 한 번 맞춘다. 적을 것은 보고의 「넘길 것」에 남긴다.

## 보고 (한국어)

- 커밋: 짧은 해시와 제목 (차례대로)
- 검사: 끝줄(시험 수, 스모크를 돌았는지 건너뛰었는지, 걸린 시간)
- 건드린 파일
- 사양과 달리 한 곳과 까닭 (없으면 「없음」)
- 받지 않은 지적과 까닭 (고침일 때)
- 넘길 것: 뒤 갈래와 문서에 적을 것
- 막힌 것 (없으면 「없음」)
```

**`.claude/agents/game-reviewer.md` 고침.**

- 설명 줄: 「PR을 만들기 전, 또는 큰 작업 단위를 끝낸 뒤」 → 「갈래 하나의 커밋이나 넘겨받은 범위를」.
- 「먼저 읽을 것」의 둘째 줄을 바꾼다: `넘겨받은 범위: \`git show <커밋>\`이나 \`git diff <앞>..<뒤>\`. 범위를 넘겨받지 않았을 때만 \`git diff origin/main...HEAD\`와 \`git diff HEAD\``.
- 새 절 「넘겨받는 것」: 기준 사양 절, 보는 눈(관점 하나), 작성자가 사양과 달리 했다고 보고한 곳. 「보는 눈이 주어지면 그 눈으로만 깊게 본다. 다른 눈은 다른 리뷰어가 맡는다.」
- 저장 줄의 시험에 `tests/saveRoundTrip.test.ts`를 더한다.
- 「`npm run check`나 봇은 돌리지 않는다」 문단: `브라우저를 띄우는 것은 돌리지 않는다. \`npm run quick\`이나 \`npx vitest run tests/<파일>\`로 좁게 확인해도 된다.` 뒤에 `읽기만 한다: 저장소 파일을 쓰지 않고 git의 상태를 바꾸는 명령(add·commit·stash·checkout·restore·reset 등)을 쓰지 않는다(명령 훅이 막는다). 임시 파일은 스크래치 폴더에.`
- 등급을 한 벌로: `막음(must) / 고쳐야 함(should) / 작은 것(nit)`. 뜻을 한 줄씩 적는다: must = 틀린 결과·저장 깨짐·판을 못 끝냄·재는 값이 틀림·핵심 원칙 위반, should = 사양과 다르거나 시험이 못 잡음, nit = 다듬기. 「지적은 실제로 틀리는 길(어떤 입력·상태에서 무엇이 틀리나)을 적을 수 있는 것만 낸다. 취향은 내지 않는다.」
- 보고 첫 줄: `본 판: <HEAD 짧은 해시>, 읽은 범위`.

**`.claude/agents/playtest-qa.md` 고침.**

- 「순서」 2를 다시 쓴다: `빌드는 넘겨받은 말을 따른다. 「지어져 있다」면 다시 짓지 않고, 다른 에이전트가 같은 폴더에서 코드를 고치는 동안에는 짓지 않는다(남이 고치던 것이 섞인 판을 보게 된다). 말이 없으면 \`npm run build\`를 한 번 한다.` / `오래 걸리는 점검은 기록 파일로 보내 뒤에서 돌리고 끝을 기다린다(\`… > test-results/<이름>.log 2>&1; echo "끝 $?" >> …\`). 판 수·분을 줄여 돌리는 것은 넘겨받은 범위가 허락할 때만이고, 줄였으면 그렇게 적는다. 재는 점은 줄이지 않는다.` / `점검 스크립트는 스크립트마다 포트가 달라 서로 다른 것은 함께 돌 수 있지만, 같은 스크립트 둘과 playtest·myth-trial·source-trial(한 포트)은 하나씩 돌린다. 다른 포트의 프로세스는 건드리지 않고, 끝나면 제가 띄운 것이 남지 않았는지 본다.`
- 「순서」 6을 다시 쓴다: `손 QA는 조종 서버로 393×852와 393×659 둘을 본다: \`node scripts/drive.mjs --size=393x852 --touch --port=<넘겨받은 값> --ctl=<넘겨받은 값> --out=test-results/<이름> &\`. 걸음은 파일로 적어 \`curl -s localhost:<ctl> -d @<스크래치>/걸음.json\`으로 넣는다(걸음 종류는 파일 머리 주석, 여러 손가락과 단추가 얽힌 것은 \`fingers\`). 끝나면 \`{"quit":true}\`로 제 것만 끈다.`
- 새 줄(순서 4 뒤): `재는 점을 맡았으면: \`npm run build && node scripts/power-curve.mjs 100 --runs=3 --out=test-results/<이름>.json\` 뒤 \`node scripts/timeline-check.mjs --curve test-results/<이름>.json\`. 값은 \`docs/knowledge/baselines.md\` 맨 위 표의 꼴로 보고한다. 띠 안인지보다 앞 점과의 차이와 까닭을 적는다.`
- 「사람 눈으로 볼 것」의 `390×844 포함` → `393×852·393×659`. fps 줄의 「사용자 확인 필요」 → `「실제 기기에서만 알 수 있는 것」으로 남긴다`.
- 보고 형식: 첫 줄에 `본 판: HEAD <짧은 해시>, 작업 폴더가 깨끗한지(\`git status --short\` 줄 수), dist를 지은 때`. 수치 줄의 예시 숫자(11.9~16.1분, 35분)를 뺀다. 「문제」 줄에 `막는 문제(must)·고칠 것(should)·다듬기(nit)로 나눈다. 덩어리의 문은 막는 문제 0이다.` 마지막 줄 「사용자에게 물을 것」 → `실제 기기에서만 알 수 있는 것 (총괄이 handoff의 「사용자에게 받아야 할 것」에 옮긴다. 답을 기다리지 않는다)`.
- 맨 끝: `읽기만 한다: 저장소 파일은 고치지 않고(쓰는 곳은 test-results/와 스크래치 폴더뿐이다) git의 상태를 바꾸는 명령을 쓰지 않는다(명령 훅이 막는다). PLAYTEST.md에 적을 내용은 보고에 넣으면 총괄이 옮긴다.`

**`.claude/agents/balance-analyst.md` 고침.** 설명 줄 앞머리를 「목표 띠를 벗어났을 때, 또는 재는 점 사이의 차이를 설명해야 할 때」로 넓힌다. 「먼저 읽을 것」의 목표 줄을 `지금 기준은 \`docs/knowledge/handoff.md\`가 가리키는 사양의 「봇과 재는 자」·「덩어리의 문」 절, 같은 판 기준선은 \`docs/knowledge/baselines.md\` 맨 위 표`로 바꾸고 결과 줄에 `test-results/baseline-*.json`(`power-curve --runs=3 --out`)을 더한다. 마지막 줄 「메인 세션이 `/balance-pass`로 적용한다」 → 「총괄이나 game-builder가 적용한다」. 읽기만 한다는 줄을 리뷰어와 같은 말로.

**`docs/knowledge/workflow.md`의 「역할 나누기 (하네스)」 절을 바꿔 쓴다.**

```markdown
## 역할 나누기 (하네스)

만드는 사람과 판정하는 사람을 나눈다. 총괄(주 세션)이 갈래마다 에이전트를 세운다: 작성자 → 리뷰어(관점 둘) → 고치는 사람 → QA.

| 역할 | 누가 | 하는 일 | 하지 않는 것 (지키는 장치) |
| --- | --- | --- | --- |
| 총괄 | 주 세션 | 사양, 갈래 나누기, 에이전트 세우기, 합치기와 병합, 결정 기록, 장부(덩어리 끝에 한 번) | |
| 작성자·고치는 사람 | `game-builder` | 갈래 하나를 만들고 전체 검사를 통과시켜 커밋. 리뷰 지적은 맞는지 확인하고 고침 | 제 일의 판정, 푸시, 장부 (커밋·푸시 문은 git 훅) |
| 리뷰어 | `game-reviewer` | 커밋을 따로 읽고 막음·고쳐야 함·작은 것으로 보고 | 고치기 (도구 목록에 Edit·Write 없음, git 쓰기는 명령 훅) |
| QA | `playtest-qa` (`/qa-pass`) | 봇 판과 조종 서버(393×852·393×659)로 사람 눈 판정. 덩어리의 문은 막는 문제 0 | 고치기 (같음) |
| 밸런스 분석 | `balance-analyst` (`/balance-pass`) | 띠를 벗어났거나 재는 점 사이가 달라진 까닭과 바꿀 수치 | 고치기 (같음) |

`npm run check`는 한 번에 하나만 돌고 뒤에 온 것은 기다린다. 다른 점검은 스크립트마다 포트가 달라 서로 다른 것은 함께 돌 수 있다(같은 스크립트 둘은 안 된다. 겹치면 명령 훅이 막는다). 함께 도는 작성자는 작업 폴더를 따로 쓴다.
```

**시험.** C2의 시험 9(읽기 전용 목록 = `tools:`에 Edit·Write가 없는 정의)에 한 줄을 더한다: `.claude/agents/*.md`마다 머리말의 `name`이 파일 이름과 같고 `description`이 있다. 정의의 글은 사람 눈으로 본다(어색한 번역 투가 없는지 한 번 읽는다).

---

### C6. 규칙 지도와 알림을 지금 방식에 맞춘다 `[fix]`

**왜.** 규칙이 지난 결정과 반대로 말한다(겪은 일 7·8): 로드맵은 「네 곳을 함께」(결정은 덩어리 끝에 한 번), UI는 「390×844」(문은 393×852·393×659), 「사용자에게 확인을 부탁」(기다리지 않는다). 0A·0C가 고치는 곳(휴대폰 입력, 전투·원정 시스템, 재는 도구)에는 규칙이 없다. 알림의 「한 번」이 세션 단위라 갈래마다 새로 세우는 작성자는 첫 사람만 본다.

**`scripts/harness/rules.mjs`.**

| 규칙 | 바꿈 |
| --- | --- |
| `growth` | 정규식의 `gear` → `gear\|gearData`. 둘째 `run`의 괄호를 `(실패는 엔딩에 못 닿음·처치 없이 300초·오류. 시각표는 node scripts/timeline-check.mjs)`로. 띠 숫자를 뺀다 |
| `classes` | `files`에 `^CLASSES\.md$`를 더하고 `run: ['npx vitest run tests/classTree.test.ts (표와 classes.json이 같은지)']` |
| `feel` | 그대로 |
| `ui` | `run`을 `node scripts/ui-sheet.mjs (cut.json 0이 기준. 393×852·393×659에서 잘리거나 덮이는지)`로 |
| `perf`·`music` | `note`의 「fps는 사용자에게 확인을 부탁한다」「곡·효과음은 사용자에게 들어 봐 달라고 한다」 두 구절만 바꾼다: 「fps(소리)는 이 환경에서 판정하지 않는다. 실제 기기에서만 알 수 있는 것은 handoff의 「사용자에게 받아야 할 것」에 적고 기다리지 않는다」. `perf`의 뒤 문장(갱신 시간은 같은 세션의 main 빌드와 견준다)은 그대로 |
| `save` | `note`의 시험에 `tests/saveRoundTrip.test.ts`를 더한다 |
| `bot` | `files`에 `src/dev/(botRules\|bossWatch)\.ts`를 더하고 `run`의 괄호에서 「CI는 35분 안」을 뺀다 |
| `roadmap` | `note`를 `장부(GitHub 이슈·로드맵 아티팩트·패널)는 덩어리가 끝날 때 한 번 맞춘다 (/roadmap-sync). 그 사이에는 ROADMAP.md만 고친다.` |
| 새 `touch` | `files: /^src\/input\/\|^src\/game\/systems\/PlayerInput\.ts$\|^src\/game\/HoverCards\.ts$/`, `run: ['npm run build && node scripts/drive.mjs --size=393x852 --touch (393x659도. 여러 손가락과 단추가 얽힌 것은 fingers 걸음으로)']`, `docs: ['PLAYTEST.md 6.2']`, `note: '휴대폰 입력은 봇과 스모크가 다 잡지 못한다. 조종 서버로 직접 눌러 본다.'` |
| 새 `expedition` | `files: /^src\/game\/systems\/(Damage\|HeroLife\|Expedition\|Oaths\|Depth\|Endless\|Automation\|Mount)\.ts$\|^src\/game\/Sanctuary\.ts$/`, `run: ['npm run build && node scripts/playtest.mjs 1 100 --ending --gate (엔딩에 못 닿음·처치 없이 300초가 실패)', '엔딩 뒤 장치(깊이·끝없는 원정·맹세)에 닿았으면 --depth=3 / --endless --relics=mjolnir / --oaths 한 판씩']`, `docs: ['PLAYTEST.md 7장']`, `note: '엔딩 뒤 규칙은 손대지 않는 것이 규율이다. 닿았으면 보고에 적는다.'` |
| 새 `ruler` | `files: /^scripts\/(power-curve\|timeline-check)\.mjs$\|^scripts\/lib\/curve\.mjs$/`, `run: ['npx vitest run tests/curve.test.mjs', 'npm run build && node scripts/power-curve.mjs 100 --runs=3 --out=test-results/<이름>.json 뒤 node scripts/timeline-check.mjs --curve test-results/<이름>.json']`, `docs: ['docs/knowledge/baselines.md']`, `note: '재는 도구를 고치면 같은 판 기준선을 다시 잰다. 도구와 게임을 한 번에 바꾸면 달라진 값의 까닭을 가를 수 없다.'` |

`rulesFor('src/game/systems/PlayerInput.ts')`는 이제 `['feel', 'touch']`다(있던 시험은 `HeroOrders.ts`를 보니 그대로 통과한다).

**`scripts/harness/hook-edit.mjs`.** 본 규칙을 적는 파일의 열쇠를 `session_id`에서 `session_id + '-' + (agent_id ?? 'main')`으로 바꾼다. 에이전트마다 규칙마다 한 번이다.

**`scripts/harness/what-to-run.mjs`.** 머리 주석과 맨 끝 줄을 고친다: `갈래 하나만 보려면 기준에 HEAD를 준다 (커밋하지 않은 것만).` / `점검은 스크립트마다 포트가 달라 서로 다른 것은 함께 돌 수 있다. 같은 스크립트 둘은 하나씩. 화면은 스크린숏을 직접 본다.` / 기준이 `origin/main`일 때만 덧붙인다: `덩어리를 닫을 때: 휴대폰 판 다시 올리기(node scripts/play-page/build.mjs <폴더>), 장부 한 번 맞추기(/roadmap-sync).` 도장 줄은 `검사 도장: 지금 코드로 통과` / `…아직 통과하지 않음 (커밋 문이 막는다)`.

**시험** (`tests/harness.test.mjs`와 `tests/harnessHooks.test.mjs`)

1. `rulesFor`: `src/input/touch.ts` → `['touch']`, `src/game/systems/Damage.ts` → `['expedition']`, `scripts/lib/curve.mjs` → `['ruler']`, `src/data/gearData.ts` → `['growth']`, `CLASSES.md` → `['classes']`, `src/dev/botRules.ts` → `['bot']`. `src/game/systems/Wake.ts`는 여전히 `['growth']`만.
2. 배선: 규칙의 `run`에 나오는 `scripts/<이름>.mjs`와 `tests/<이름>`이 모두 있는 파일이다. `docs`의 첫 낱말이 있는 파일이다. `.claude/settings.json`의 훅 명령이 가리키는 `scripts/harness/*.mjs`가 모두 있다. 규칙 글에 「사용자에게 확인을 부탁」이 없다.
3. `hook-edit.mjs`를 자식 프로세스로 두 번(같은 `session_id`, 다른 `agent_id`, `TMPDIR`은 임시 폴더) 돌리면 둘 다 `ui` 규칙을 알리고, 같은 `agent_id`로 한 번 더 돌리면 알리지 않는다.

---

### C7. 휴대폰 판 페이지와 패치 보관을 저장소의 도구로 `[add]`

**왜.** 겪은 일 3·4. Pages가 멈춘 동안 사용자가 게임을 해 보는 유일한 길인데, 페이지를 만드는 `make-play.mjs`가 사라질 수 있는 스크래치 폴더에만 있다(`docs/knowledge/environment.md:36-37`이 「없으면 다시 짜면 된다」고 적는다). 판 이름은 손으로 넘기고, 빌드가 낡았는지 보지 않으며, 못 올린 커밋의 패치는 손으로 친 명령으로 만든다.

**`scripts/play-page/build.mjs`** (`scripts/roadmap-page/build.mjs`의 짝. 브라우저도 포트도 쓰지 않는다). 원본은 `<스크래치>/tools/make-play.mjs`: 그 페이지 조각과 스타일을 그대로 옮긴다.

- 쓰는 법: `node scripts/play-page/build.mjs <나갈 폴더> [판 이름]`. `dist`는 저장소의 `dist/`.
- `buildPlayPage({ root, dist, out, label })`를 내보낸다(시험이 부른다).
  1. `staleBuild(root)`가 걸리면 멈춘다: `dist가 <파일>보다 오래됐다. \`npm run build\` 뒤에 다시 돌린다.`
  2. `dist/index.html`에서 `./assets/….js`와 `./assets/….css`를 읽는다. 못 찾으면 무엇을 못 찾았는지 말하고 멈춘다(지금은 `null[1]`로 죽는다).
  3. `<out>/assets/`를 비우고 `dist/assets/*`를 복사한다. `<out>/mythic-relics.html`에 머리 없는 페이지 조각을 쓴다(`<title>`, 스타일, `<!-- 판: … -->`, `<div id="app">`, CSS 링크, 모듈 스크립트).
  4. 판 이름을 주지 않으면 `<HEAD 짧은 해시>[+고침] <날짜 시각>`.
  5. 올리지 않은 커밋: 기준은 `@{u}`, 없으면 `origin/main`. `git rev-list --count <기준>..HEAD`가 0보다 크면 `git format-patch <기준>..HEAD --stdout`을 `<out>/backup/unpushed.patch`에 쓴다. 0이면 그 파일을 지운다.
  6. `<out>/files.json`에 Artifact의 `files`에 그대로 넘길 지도를 쓴다: `{ "assets/<이름>": { "from": "<절대 경로>", "contentType": "…" }, … }`. 형식은 `.js` → `text/javascript`, `.css` → `text/css`, `.woff2` → `font/woff2`, 그 밖은 `from`만. 패치가 있으면 `"backup/unpushed.patch": { "from": …, "contentType": "text/plain" }`.
- 찍는 글: 페이지 경로, 자산 수, 판 이름, 패치(커밋 N개 또는 「올리지 않은 커밋 없음: 아티팩트에 옛 패치가 남아 있으면 files에 `"backup/unpushed.patch": null`」), 그리고 `올리기: Artifact publish — file_path는 위 페이지, files는 files.json의 내용, url은 docs/knowledge/environment.md의 휴대폰 판 주소. 되살릴 때: git am < unpushed.patch`.

**시험** (`tests/playPage.test.mjs`, 임시 폴더)

1. 꾸민 `dist`(index.html, `assets/index-abc.js`, `assets/index-def.css`, `assets/G.woff2`)로 만들면 페이지에 `assets/index-abc.js`·`assets/index-def.css`가 `./` 없이 들어 있고 `<div id="app">`과 판 이름 주석이 있으며, `files.json`의 세 파일에 형식이 맞게 붙는다.
2. `dist`가 `src`보다 낡으면 멈추고 글에 `npm run build`가 있다. index.html에 스크립트가 없으면 까닭을 말하며 멈춘다.
3. 임시 저장소(맨몸 원격 포함)에서 올리지 않은 커밋이 하나면 `backup/unpushed.patch`가 생기고 `files.json`에 들어가며, 다 올린 뒤 다시 만들면 그 파일이 없어진다.

---

### C8. 스킬 넷과 안내 문서를 지금 사정에 맞춘다 `[fix]`

**왜.** 겪은 일 3·7·8. 스킬과 문서가 2026-11-19 결정들과 어긋난다: 장부는 「작업 단위마다」, 병합은 「CI가 초록이면」, 크기는 「390×844」, 띠 숫자는 사양이 걷은 값이 여섯 군데에 겹쳐 적혀 있다. `CLAUDE.md` 「하네스」 절은 C1~C7 뒤에 틀린 말이 된다.

**`.claude/skills/roadmap-sync/SKILL.md`.**

- 설명 줄과 머리: 「작업 단위를 끝냈을 때」를 빼고 **「덩어리가 끝날 때 한 번 맞춘다(2026-11-19 결정). 그동안 끝낸 ID를 모아 한꺼번에 넘긴다. 그 사이에는 `ROADMAP.md`만 고친다.」**
- 「작업 단위를 끝냈을 때」 절 제목을 「덩어리를 닫을 때: 끝낸 작업 단위들」로 바꾸고 1번에 `ID를 여럿 넘긴다`를 적는다. 「로드맵 아티팩트 (ROADMAP.md를 고칠 때마다)」 → 「(덩어리를 닫을 때)」.
- 새 절 「도구가 끊겼을 때」: `MCP roadmap이 없으면 패널은 건너뛴다. GitHub 도구가 실패하면(「invalid session」, 권한) 한 번 다시 해 보고, 그래도 안 되면 ROADMAP.md와 아티팩트만 맞춘 뒤 밀린 ID를 handoff.md의 상태 표에 적는다. 다음 덩어리를 닫을 때 함께 넘긴다.`
- 맨 위 문장 「네 곳 가운데 하나라도 빠뜨리면 사용자가 보는 화면이 어긋난다」는 지운다.

**`.claude/skills/steward/SKILL.md`.**

- 「PR을 만들기 전」 2: 「"막음"·"고쳐야 함"」 → 「막음(must)·고쳐야 함(should)」.
- 새 절 「문」(「CI」 절 앞): `CI가 돌면 CI가 문이다. 작업이 러너를 받지 못해 몇 초 만에 실패하면(Actions 결제 잠금) 문은 로컬이다: 머리 커밋의 코드가 검사 도장과 같고(\`node scripts/harness/doctor.mjs\`의 「검사 도장」 줄), PLAYTEST.md 6.2의 손 QA에 막는 문제가 0일 때 병합한다. 이때는 구독과 예약을 걸지 않는다. 어느 문으로 병합했는지 PR 본문에 한 줄 적는다.`
- 「CI」 절의 숫자(35분, 24~27분)를 빼고 `문턱은 .github/workflows/ci.yml에 있다`로 가리킨다.
- 「리뷰와 충돌」의 「사용자에게 묻는다」 → 「총괄이 정하고 decisions.md에 적는다」.
- 「병합」: 「CI가 초록이면」 → 「문을 넘으면」. 병합 뒤 줄에 `덩어리 PR이면 휴대폰 판을 다시 올린다: npm run build && node scripts/play-page/build.mjs <스크래치>/play (올리는 법과 주소는 docs/knowledge/environment.md)`.
- 새 절 「막힐 때」: `푸시가 거절되거나 GitHub 도구가 실패하면 한 번 다시 해 본다. 그래도 안 되면 커밋을 로컬에 쌓고 \`node scripts/play-page/build.mjs\`가 만드는 패치 묶음을 휴대폰 판 아티팩트에 함께 올린 뒤 handoff.md에 적는다. 풀리면 브랜치 푸시 → PR → 밀린 장부 차례다.`

**`.claude/skills/qa-pass/SKILL.md`.**

- 표의 `ui-sheet` 줄: 크기를 `(기본 다섯: 1280×720·960×540·390×844·393×852·393×659, cut.json 0이 기준)`. 조종 서버 줄: `--size=393x852 --touch`(393x659도), `--port`·`--ctl`을 달리 주면 여럿.
- 「모두 `npm run build` 뒤에 돌린다 … 하나씩 돌린다」 → `빌드가 낡았으면 명령 훅이 막는다(훅이 꺼진 세션은 doctor가 알려 준다). 서로 다른 스크립트는 함께 돌 수 있고 같은 스크립트 둘은 하나씩. 손 QA의 문은 393×852·393×659에서 막는 문제 0이다.`
- 3절의 「체크리스트를 확인했으면 … `[x]` (`/roadmap-sync`)」 → `판정은 PLAYTEST.md 6.2에 남긴다. 장부는 덩어리를 닫을 때 한 번 맞춘다.` 마지막 줄 「사용자가 직접 봐야 할 것」 → 「실제 기기에서만 알 수 있는 것(handoff에 적고 기다리지 않는다)」.

**`.claude/skills/balance-pass/SKILL.md`.**

- 1절의 띠 줄을 `지금 기준은 docs/knowledge/handoff.md가 가리키는 사양의 「봇과 재는 자」·「덩어리의 문」 절이다. 판정은 node scripts/timeline-check.mjs의 출력이 한다. 숫자를 여기에 옮겨 적지 않는다.`로.
- 표의 첫 두 줄의 기준 칸에서 숫자(65~75분, ±15%, 9.3~12.5분, 11.9~16.1분, 35분)를 빼고 `timeline-check의 실패 조건과 띠 표시`로. 표 맨 위에 한 줄을 더한다: `| 같은 판 기준선 (덩어리마다 재는 점) | node scripts/power-curve.mjs 100 --runs=3 --out=test-results/<이름>.json 뒤 node scripts/timeline-check.mjs --curve <그 파일> | 앞 점과의 차이와 까닭. 값은 docs/knowledge/baselines.md 맨 위 표 |`
- 2절의 「하나씩 돌린다 (같은 포트를 쓰는 것이 있다)」 → `playtest·myth-trial·source-trial은 한 포트라 하나씩`.
- 3절 마지막 줄 → `고치는 동안은 npm run quick, 커밋 앞에는 npm run check (커밋 문이 도장을 본다)`. 맨 끝의 「실제 체감은 직접 해 봐 달라는 것만」 → 「숫자가 어떻게 움직였는지만 짧게 알린다」.

**`CLAUDE.md`.** 「하네스」 절의 머리 문장과 표를 아래로 바꾼다.

```markdown
규칙을 기억에 맡기지 않고 git 훅·Claude 훅·서브에이전트·스킬로 지킨다. 무언가 막히면 까닭이 `[하네스]`로 돌아온다. Claude 훅(`.claude/settings.json`)은 세션의 프로젝트 폴더가 이 저장소일 때만 실린다. 실리지 않아도 커밋·푸시 문은 git 훅이 지키고, 실리는지는 `node scripts/harness/doctor.mjs`가 알려 준다.

| 무엇 | 하는 일 |
| --- | --- |
| 커밋 문 (git 훅) | `git commit`마다 커밋될 코드의 지문을 본다(`scripts/harness/git-hooks/pre-commit` → `gate.mjs`). 문서(*.md·`docs/`·`.claude/`)만 든 커밋이거나 `npm run check`가 통과해 도장이 찍힌 바로 그 코드일 때만 통과한다. 검사한 그대로 올린다(빠뜨린 파일이 있으면 이름을 알려 준다). `npm ci`와 `npm run check`가 훅을 다시 건다(`install.mjs`, Claude 세션에서만). 사용자가 검사 없이 커밋하라고 했을 때만 `HARNESS_SKIP_CHECK=1 git commit …` |
| 푸시 문 (git 훅) | main으로 바로 올리는 푸시를 막는다(`pre-push`) |
| 검사 한 바퀴 | `npm run check`(`scripts/harness/check.mjs`): 다른 검사가 돌면 기다리고, 빌드·단위 테스트·스모크를 차례로 돌려 단계마다 걸린 시간을 찍고, 통과하면 도장을 찍는다(`.git/harness/`). 스모크가 읽는 것(src·index.html·설정·의존성·`scripts/smoke.mjs`)이 마지막 통과 때와 같으면 스모크를 건너뛴다(늘 돌리려면 `HARNESS_FULL=1`, CI는 늘 다 돈다) |
| 명령 훅 | 강제 푸시, `playwright install`, git 훅 건너뛰기(`--no-verify`), 빌드(`dist`)가 `src`보다 낡았는데 점검 스크립트 돌리기(`npm run build &&`를 앞에), 같은 포트를 쓰는 점검이 이미 돌 때, 읽기만 하는 역할(리뷰어·QA·분석가)의 git 쓰기를 막는다 |
| PR 훅 | main으로 가는 PR은 커밋을 다 올렸고 `handoff.md`를 고쳤고 한국어일 때만, 병합은 merge 방식만 |
| 고친 뒤 알림 | 파일을 고치면 맞는 점검·함께 고칠 문서를 에이전트마다 한 번 알리고(규칙은 `scripts/harness/rules.mjs`), 새로 쓴 글의 글자 그대로 쓴 색·흐려지는 글꼴 크기·"(으)로" 표기·영어 주석·모델 이름을 짚는다 |
| 세션 시작 | `handoff.md`를 줄인 요약, 브랜치·커밋하지 않은 파일·올리지 않은 커밋, 환경에서 걸리는 것을 넣는다 (대화를 줄인 뒤에도) |
| `node scripts/harness/doctor.mjs` | 환경 진단 한 번: 저장소 자리, Claude 훅이 이 세션에서 도는지, git 훅, 의존성, 브라우저 자리, 옆의 옛 복사본, 낡은 빌드, 검사 도장, 남은 서버. 컨테이너가 바뀌었거나 무언가 이상하면 먼저 돌린다 |
| `node scripts/harness/what-to-run.mjs [기준]` | 기준(기본 main)과 견줘 바뀐 파일에 맞는 점검·아직 안 고친 문서를 모아 보인다. 갈래 하나만 보려면 `HEAD` |
| `node scripts/play-page/build.mjs <폴더>` | 휴대폰 판 아티팩트에 올릴 페이지와 파일 목록, 올리지 못한 커밋의 패치 묶음을 만든다 (올리는 법은 `docs/knowledge/environment.md`) |
| 서브에이전트 (`.claude/agents/`) | `game-builder`: 갈래 하나를 만들거나 고쳐 검사 뒤 커밋(제 일을 판정하지 않는다). `game-reviewer`: 커밋을 따로 읽는 리뷰(읽기만). `playtest-qa`: 봇과 조종 서버로 사람 눈 판정(읽기만). `balance-analyst`: 띠를 벗어났거나 재는 점 사이가 달라진 까닭과 바꿀 수치(읽기만) |
| 스킬 (`.claude/skills/`) | `/roadmap-sync`(덩어리 끝에 장부 한 번), `/balance-pass`(수치 한 바퀴), `/qa-pass`(QA 한 바퀴), `steward`(PR을 만들고 병합까지, CI가 잠겼을 때의 문) |

규칙을 바꾸면 시험도 고친다: `tests/harness.test.mjs`(명령 읽기·규칙), `tests/harnessGate.test.mjs`(커밋·푸시 문), `tests/harnessHooks.test.mjs`(훅 진입점·배선), `tests/harnessCheck.test.mjs`(검사 한 바퀴). 개인 설정은 `.claude/settings.local.json`(git에 안 올라감).
```

「기술과 명령」에서는 이 줄들만 고친다.

- `npm run check` 줄: `…스모크(마지막에 휴대폰 390×844 한 바퀴). **커밋 전에 반드시 통과시킨다**(커밋 문이 도장을 본다). 고치는 동안은 \`npm run quick\`(타입 검사 + 단위 테스트, 20초쯤). 검사는 한 번에 하나만 돌고 뒤에 온 것은 기다린다. 같은 검사와 봇 1판이 GitHub Actions(…)에서도 돈다.`
- 새 줄(그 아래): `node scripts/harness/doctor.mjs`: 환경 진단 (하네스 절).
- 웹 배포 줄의 끝: 「(만드는 법은 `docs/knowledge/environment.md`)」 → 「(`npm run build && node scripts/play-page/build.mjs <스크래치>/play`, 올리는 법은 `docs/knowledge/environment.md`)」.
- 브라우저 실행 경로 줄의 끝에: 「못 찾으면 `node scripts/harness/doctor.mjs`가 찾아본 곳을 알려 준다.」

**`docs/knowledge/environment.md`.**

- 「아티팩트」 절의 「올리는 법」과 그 아래 「스크래치는 사라질 수 있다. 도구가 없으면 다시 짜면 된다」 두 불릿을 하나로: `올리는 법: \`npm run build && node scripts/play-page/build.mjs <스크래치>/play\`. 페이지(\`mythic-relics.html\`)와 자산을 만들고 \`files.json\`에 함께 올릴 파일 목록을 쓴다. 그 페이지를 \`files.json\`의 내용(\`files\`)과 함께 위 \`url\`로 올린다.` 「올리지 못한 커밋의 보관」 불릿의 손 명령을 `같은 스크립트가 올리지 않은 커밋이 있으면 \`backup/unpushed.patch\`를 만들어 파일 목록에 넣는다`로.
- 새 절 「훅이 실리지 않을 때」(「브라우저와 렌더링」 앞):

```markdown
## 훅이 실리지 않을 때

- `.claude/settings.json`의 Claude 훅은 세션의 프로젝트 폴더가 이 저장소일 때만 읽힌다. 세션에 저장소가 둘 붙으면(2026-11-19 컨테이너: 옛 이름 `game`과 `mythic-relics`) 프로젝트 폴더가 부모(`/home/user`)가 되어 훅 넷이 모두 꺼진다. 꺼진 것은 `node scripts/harness/doctor.mjs`의 「Claude 훅」 줄과 `npm run check`의 첫 줄이 알려 준다.
- 꺼져 있어도 커밋·푸시 문은 git 훅이 지킨다(`core.hooksPath`, `npm ci`와 `npm run check`가 다시 건다). 꺼지는 것은 고친 뒤 알림, 세션 요약, 낡은 빌드·포트 검사, 읽기 전용 역할의 git 쓰기 막기다.
- 푸는 법: 세션(환경)의 저장소 목록에서 옛 이름 저장소를 떼고 새 세션을 연다(사용자 몫). 그때까지 옛 복사본은 보지 않는다.
```

- 「브라우저와 렌더링」의 크롬 줄 끝에: 「못 찾으면 doctor가 찾아본 곳을 알려 준다.」

**`docs/knowledge/workflow.md`** (역할 절은 C5).

- 「작업 단위 하나를 끝낼 때」: 2의 「파일을 고치면 훅이 … 알린다」 뒤에 「(훅이 꺼진 세션은 `node scripts/harness/what-to-run.mjs HEAD`)」. 3을 `고치는 동안 \`npm run quick\`, 커밋 앞에 \`npm run check\` (통과하면 도장이 찍히고, 도장 없는 코드는 커밋 문이 막는다)`. 4를 `ROADMAP.md에서 - [ ] → - [x] (GitHub 이슈·아티팩트·패널은 덩어리를 닫을 때 한 번: /roadmap-sync)`로 바꾸고 5·7을 지운 뒤 번호를 당긴다.
- 「PR과 CI」 절 맨 위에 한 줄: `문이 CI인지 로컬인지(Actions 결제 잠금)는 steward 스킬의 「문」 절이 정한다.`

**시험.** C6의 배선 시험이 규칙·설정이 가리키는 파일을 본다. 문서의 글은 사람 눈으로 본다: 고친 줄마다 어색한 번역 투가 없는지, 모델 이름이 없는지.

---

## 4. 하지 않을 것과 까닭

| 하지 않는 것 | 까닭 |
| --- | --- |
| 점검 스크립트 열넷의 미리보기 서버를 도우미 한 곳(`scripts/lib/preview.mjs`: 제가 띄운 서버인지 확인, 빈 포트, `dist` 복사본)으로 모으기 | 값어치는 크다(1장의 「남의 빌드를 본다」를 뿌리에서 없애고 포트 규칙을 지울 수 있다). 그러나 스크립트 열셋을 브라우저 없이 고쳐야 하고, 그 가운데 봇·곡선 스크립트는 지금 재는 점이 걸려 있으며 `smoke.mjs`는 다른 갈래가 고치는 중이다. 재는 점이 걸리지 않은 때 브라우저로 확인할 수 있는 갈래로 한다(총괄에게). 이번에는 검사 잠금(C4)과 훅의 읽기 고침(C2)으로 막는다 |
| `scripts/smoke.mjs`의 시간에 기대는 곳 고치기, `--only=`로 나누기 | 다른 갈래가 고치는 파일이다. 고칠 곳은 총괄에게 넘긴다(5장) |
| 브라우저 렌더러 손잡이(`CHROMIUM_WEBGL_RENDERER`) 켜기 | 6분 스모크를 가장 크게 줄일 수 있는 후보지만 브라우저를 띄워 재야 하고, 손 QA가 스크린숏으로 판정하니 그림이 같은지 먼저 봐야 한다. 총괄에게 |
| PR 훅 넓히기 (`gh pr merge`, `push_files`·`create_or_update_file`, CI 대신 로컬 도장을 PR의 문으로) | 그 길로 난 사고가 없고 `gh`는 토큰이 무효다. 「로컬이 문」은 steward의 글로 둔다. 사고가 나면 훅으로 올린다 |
| 병합·체리픽·리베이스·`git am`에 문 달기 | 지금도 없고 사고가 없다. `git am`은 패치 묶음을 되살리는 길이라 막으면 안 된다 |
| 읽기 전용 역할의 파일 쓰기를 훅으로 막기 (`>`·`sed -i`·`node -e`) | 글자 읽기로는 빠짐없이 가릴 수 없고, QA는 `test-results/`와 스크래치에 써야 한다. git 쓰기만 막고 보고 첫 줄의 「본 판」으로 드러나게 한다 |
| 에이전트 정의 머리말의 `hooks:`로 읽기 전용을 지키기 | 프로젝트 설정이 안 읽히는 세션에서도 먹을 수 있는 길이지만, 이 판의 CLI에서 실제로 도는지 확인하지 못했다(에이전트를 세워 봐야 안다). 확인되지 않은 설정을 올리지 않는다. 총괄에게 |
| 부모 폴더(`/home/user/.claude/settings.json`)에 훅을 거는 설정 만들기 | 저장소 밖의 세션 설정을 바꾸는 일이라 사용자의 승인이 있어야 한다. 저장소 쪽 준비(스크립트 자리에서 뿌리를 읽기)만 해 둔다 |
| 옛 복사본 `/home/user/game`을 지우거나 세션에서 떼기 | 총괄·사용자 몫이다. doctor가 알리기만 한다 |
| `CLASSES.md`를 코드 지문에 넣기 | 「문서는 빼되 하나만 도로 넣는」 인덱스 조작이 지문 계산 두 곳에 들어간다. 규칙 알림(C6)이 그 시험 하나를 돌리라고 알리고, 깨진 표는 다음 검사와 CI가 잡는다 |
| Bash 훅을 설정의 `if`로 좁히기 | 호출마다 35ms를 아끼는 대신 「훅이 돈다」는 흔적(C2)을 잃는다. 훅 안에서 일찍 끝내는 것으로 충분하다 |
| vitest 워커·isolate 손보기, 타입 검사와 단위 테스트 함께 돌리기 | 합쳐 17초, 검사의 4%다. 파일 사이 상태가 새는 위험이 더 크다 |
| 점검 스크립트들의 차례를 세우는 큐 | 포트가 겹치는 것은 같은 스크립트 둘과 세 묶음뿐이고 겹치면 훅이 막는다. 기다려 주는 것은 가장 자주 겹치는 `npm run check` 하나면 된다 |
| doctor에 네트워크 검사(`git ls-remote`, 푸시 미리 해 보기) | 프록시에 기대 느리고, 푸시가 막힌 것은 푸시할 때 스스로 크게 드러난다 |
| `dist`에 지은 판을 적어 두기 (`build.json`) | QA 보고 첫 줄의 「본 판」(HEAD·깨끗한지·dist 지은 때)이면 된다 |
| 페이지를 올리기 전에 열어 보는 도구(`peek.mjs`) 옮기기 | 브라우저를 띄우는 도구이고 덩어리마다 한 번 쓴다. 같은 `dist`를 손 QA가 조종 서버로 이미 본다. 페이지 조각은 시험이 지킨다 |
| 사용자 컴퓨터와 CI에 git 훅 걸기 | 사용자의 손 커밋을 6분짜리 검사로 막게 된다. `CLAUDECODE=1`인 세션에만 건다 |
| `docs/knowledge/handoff.md`의 「한 줄 요약」 절 다듬기, `CLAUDE.md`의 하네스 밖 줄 | 다른 갈래가 고치는 문서다. 세션 훅이 넣는 길이만 줄이고(C3) 글은 총괄에게 |
| 저장된 워크플로(`.claude/workflows/`) | 총괄이 직접 쓴다 (5장에 있으면 좋은 것만) |

점검 결과 가운데 달리 한 것: 「`git add`는 제 파일만(-A 금지)」은 받지 않았다(새 커밋 문에서는 검사한 그대로 다 올려야 하므로 반대다. 작성자 정의는 「제 바꿈만 있는지 보고 검사한 그대로」로 썼다). 「파이프가 있으면 pipefail이 있을 때만 검사 뒤 커밋으로 읽기」는 고치지 않고 그 읽기를 통째로 지웠다(C1). 「검사 잠금을 `check-stamp begin`이 부모 프로세스로 쥐기」는 검사 한 바퀴를 굴리는 스크립트가 제 pid로 쥐게 했다(C4).

## 5. 총괄에게

**지금 바로 (구현을 합치기 전에도)**

1. **지금은 커밋 문이 없다.** 훅이 꺼져 있어 「검사 뒤 커밋」은 에이전트의 말로만 지켜진다(`47aabe9`). 합쳐질 때까지 갈래의 보고에서 검사 끝줄과 커밋 해시를 직접 맞춰 본다.
2. **검사 둘, 같은 점검 둘을 겹치지 않는다.** 다른 작업 폴더에서 `npm run check` 둘이 겹치면 뒤쪽이 앞쪽의 빌드를 스모크하고 도장을 찍을 수 있다. 봇·곡선도 같다. 0C의 가운데 셋을 함께 돌린다면 검사와 재는 점은 한 줄로 세운다. C4가 들어가면 검사는 스스로 기다린다(봇은 여전히 하나씩).

**합칠 때**

3. 구현은 `scripts/harness/*`와 `package.json`을 바꾸므로 합치는 순간 돌고 있던 검사는 도장을 못 받는다. **검사가 하나도 돌지 않을 때** 합치고, 합친 뒤 `node scripts/harness/install.mjs`(git 훅 걸기) → `node scripts/harness/doctor.mjs` → `npm run check` 한 번(새 검사 한 바퀴의 첫 실전)을 차례로 돌린다.
4. 합친 뒤부터 달라지는 것 셋을 갈래 프롬프트에 반영한다: 커밋은 검사한 그대로 다 올린다(문서 커밋은 언제든 된다), 고치는 동안은 `npm run quick`, 임시 스크립트는 `scripts/.scratch/`.

**세션과 환경 (사용자 몫이 섞여 있다)**

5. **Claude 훅을 다시 살리는 길.** 세션의 저장소 목록에서 옛 이름 `sksskdf/game`을 떼고 새 세션을 열면 프로젝트 폴더가 저장소로 돌아와 훅 넷과 세션 요약이 살아난다(옛 `CLAUDE.md`와 스킬 네 벌이 겹쳐 실리는 것도 함께 없어진다). 사용자에게 받아야 할 것에 한 줄 올린다. 살아났는지는 doctor의 「Claude 훅」 줄로 본다.
6. 그 전에 읽기 전용 역할을 프롬프트 밖에서 지키고 싶으면, 에이전트 정의 머리말의 `hooks:`가 이 CLI에서 도는지 탐침 하나로 본다(시험용 정의에 Bash 훅을 달고 에이전트를 세워 막히는지). 되면 읽기 전용 셋의 머리말에 `hook-bash.mjs`를 거는 석 줄을 더한다.
7. 워크플로의 `agent()`가 작업 폴더 격리(`isolation: "worktree"`)를 받는지 본다. 받으면 함께 도는 작성자에게 쓴다.

**워크플로 스크립트 (저장된 워크플로를 쓴다면 있으면 좋은 것)**

8. 「갈래 하나」 틀: 작성자(`agentType: 'game-builder'`) → 리뷰어 둘(`game-reviewer`, 관점 하나씩) → 고치는 사람(`game-builder`) → 필요하면 QA(`playtest-qa`). 스크립트의 `RULES`는 정의로 옮겼으니 프롬프트에는 넘겨받는 것만 적는다: 갈래 이름, 사양 절, 맡은 파일, 끝난 기준, 작업 폴더, 커밋 꼬리, (QA) 빌드가 지어져 있는지와 조종 서버 포트 쌍, (리뷰어) 커밋 해시·보는 눈·작성자가 사양과 달리 한 곳.
9. 「덩어리 닫기」 틀: 전체 검사 → 손 QA 둘(393×852·393×659, 포트 쌍 따로) → 재는 점 → `node scripts/play-page/build.mjs`와 아티팩트 올리기 → 장부 한 번(`/roadmap-sync`) → PR과 병합(steward의 「문」).
10. 어느 워크플로든 첫 걸음에 `node scripts/harness/doctor.mjs`를 돌려 걸린 줄을 본다. 리뷰어·QA만 도는 단계 앞뒤로 `git rev-parse HEAD`와 `git status --short`가 같은지 본다.

**넘기는 것**

11. `scripts/smoke.mjs`에서 고칠 것(다른 갈래의 파일이라 손대지 않았다): ① 휴대폰 톡의 누름과 뗌을 한 `evaluate` 안에서 보낸다(1231~1232·1255~1256줄. 게임은 그 사이를 실제 시계로 재어 0.8초를 넘으면 톡으로 치지 않는다) ② 「적 모두 제거」의 누름과 세기를 한 걸음에(961~962줄, 비운 무리는 25초 뒤 다시 찬다) ③ 「게임 시간이 그대로인가」는 밀리초 대신 프레임 수로 기다린다(100~104·488~489줄) ④ 43·618·922줄의 `goto`·`reload`를 뒤 두 페이지와 같은 한도로, 273·279줄의 5초를 15초로, 591줄의 600을 1000으로 ⑤ 서버를 기다릴 때 제가 띄운 서버가 살아 있는지도 본다(`server.exitCode === null`).
12. 미리보기 서버 도우미(4장 첫 줄)와 렌더러 손잡이 재기는 재는 점이 걸리지 않은 때의 갈래로: `npm run build && node scripts/bench.mjs`를 `CHROMIUM_WEBGL_RENDERER=swiftshader-llvm-fast`를 주고 안 주고 한 번씩, 빨라지면 `ui-sheet`의 `cut.json`과 그림이 같은지 본 뒤 `scripts/lib/browser.mjs` 한 곳에서 켠다.
13. 문서: `CLAUDE.md` 「작업 방식」의 로드맵 두 줄(「진행할 때마다」「고칠 때마다 올린다」)과 「대화 규칙」의 「큰 방향은 사용자가 정한다」, 「Git」의 「CI가 통과하면」은 2026-11-19 결정과 어긋난다. `docs/knowledge/handoff.md`의 하네스 줄(50줄)과 브랜치 줄의 「푸시가 막혀」(45줄), `environment.md`의 푸시 줄(「안 됨 (403)」)도 지금과 다르다. 「한 줄 요약」 절은 맨 위 문단만 남기고 「그 앞」 문단들을 `history.md`로 옮기면 세션 요약이 제 이름값을 한다.
