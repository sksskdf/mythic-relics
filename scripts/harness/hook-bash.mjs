// 하네스 훅 (PreToolUse · Bash): 실수하기 쉬운 명령을 돌기 전에 막는다. 까닭을 Claude에게 돌려준다.
// - 검사(`npm run check`)를 통과하지 않은 코드의 커밋 (문서만 바뀐 커밋, 같은 && 줄에서 검사 뒤 커밋, HARNESS_SKIP_CHECK=1은 둔다).
//   명령이 `cd 폴더 &&`로 시작하면 그 폴더(worktree)를 본다
// - main으로 바로 푸시, 강제 푸시
// - 빌드보다 새로 고친 src가 있는데 dist를 쓰는 점검 스크립트를 돌림 (`npm run build &&`를 앞에 붙이면 됨)
// - 같은 포트를 쓰는 점검 스크립트가 이미 돌고 있음
// - `playwright install` (이 환경에 깔린 브라우저를 못 찾게 된다)
// 훅이 스스로 틀리면 막지 않는다.
import { isAbsolute, join } from 'node:path'

import { branch, checkState, portBusy, readInput, ROOT, scriptPorts, staleBuild, usesBuild } from './repo.mjs'
import { checksBeforeCommit, hasCommit, leadingDir, pushProblem, scriptRuns, segments, skipsCheck } from './shell.mjs'

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `[하네스] ${reason}` } }))
  process.exit(0)
}

async function main() {
  const input = readInput()
  const command = input.tool_input?.command
  if (typeof command !== 'string') return
  // 커밋하는 작업 폴더: 명령 앞의 `cd 폴더 &&`, 없으면 프로젝트 폴더
  const cd = leadingDir(command)
  const dir = cd ? (isAbsolute(cd) ? cd : join(input.cwd ?? ROOT, cd)) : ROOT

  if (segments(command).some((w) => w[0] === 'playwright' || (w[0] === 'npx' && w[1] === 'playwright' && w[2] === 'install'))) {
    deny('playwright install은 하지 않는다. 브라우저는 깔려 있다 (docs/knowledge/environment.md).')
  }

  const push = pushProblem(command, branch())
  if (push) deny(push)

  if (hasCommit(command) && !skipsCheck(command) && !checksBeforeCommit(command)) {
    const s = checkState(dir)
    if (!s.sameAsHead && !s.checked) {
      deny(
        '마지막 `npm run check` 통과 뒤 코드가 바뀌었다 (또는 이 컨테이너에서 아직 검사하지 않았다). ' +
          '`set -o pipefail && npm run check`를 통과시킨 뒤 커밋한다. 문서(*.md·docs/·.claude/)만 바뀐 커밋은 막지 않는다. ' +
          '사용자가 검사 없이 커밋하라고 했을 때만 명령 앞에 HARNESS_SKIP_CHECK=1을 붙인다.',
      )
    }
  }

  for (const run of scriptRuns(command)) {
    if (!usesBuild(run.script)) continue
    if (!run.built) {
      const stale = staleBuild()
      if (stale) deny(`빌드(dist)가 ${stale.file}보다 오래됐다. 점검이 옛 코드를 잰다. \`npm run build && \`를 앞에 붙여 돌린다.`)
    }
    for (const port of scriptPorts(run.script)) {
      if (await portBusy(port)) {
        deny(
          `다른 점검이 포트 ${port}에 미리보기 서버를 띄워 두었다 (${run.script}.mjs도 이 포트를 쓴다). 그 점검이 끝난 뒤 돌린다. ` +
            `돌고 있는 점검이 없는데 남은 서버면 \`pkill -f "vite preview --port ${port}"\`로 정리한다.`,
        )
      }
    }
  }
}

main().catch(() => process.exit(0))
