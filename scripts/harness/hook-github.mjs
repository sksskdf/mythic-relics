// 하네스 훅 (PreToolUse · GitHub PR 만들기·병합): 저장소 규칙에 맞지 않으면 막는다.
// - main으로 가는 PR: 커밋을 모두 올렸고, 이 브랜치에서 handoff.md를 고쳤고, 제목·본문이 한국어
// - 병합: merge 방식만 (CLAUDE.md Git)
import { execFileSync } from 'node:child_process'

import { readInput, ROOT, unpushed } from './repo.mjs'

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `[하네스] ${reason}` } }))
  process.exit(0)
}

function main() {
  const input = readInput()
  const tool = String(input.tool_name ?? '')
  const args = input.tool_input ?? {}

  if (tool.endsWith('merge_pull_request')) {
    if (args.merge_method && args.merge_method !== 'merge') deny(`병합은 merge 방식으로 한다 (받은 것: ${args.merge_method}).`)
    return
  }

  if (tool.endsWith('create_pull_request') && (args.base ?? 'main') === 'main') {
    // PR의 head 브랜치를 본다 (작업 폴더가 다른 브랜치여도: worktree로 따로 만든 PR)
    const git = (a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const head = typeof args.head === 'string' && args.head ? args.head : null
    let ref = 'HEAD'
    let ahead = unpushed()
    if (head) {
      try {
        ref = git(['rev-parse', '--verify', '--quiet', `refs/heads/${head}`]) ? head : `origin/${head}`
        ahead = ref === head ? Number(git(['rev-list', '--count', `origin/${head}..${head}`])) : 0
      } catch {
        ref = `origin/${head}`
        ahead = null
      }
    }
    if (ahead) deny(`로컬 커밋 ${ahead}개를 아직 올리지 않았다. \`git push -u origin <브랜치>\` 뒤에 PR을 만든다.`)
    let files = []
    try {
      files = git(['diff', '--name-only', `origin/main...${ref}`]).split('\n')
    } catch {
      return
    }
    if (!files.includes('docs/knowledge/handoff.md')) deny('이 브랜치에서 docs/knowledge/handoff.md를 고치지 않았다. 지금 상태·다음 할 일을 고쳐 커밋한 뒤 PR을 만든다.')
    if (!/[가-힣]/.test(`${args.title ?? ''}`) || !/[가-힣]/.test(`${args.body ?? ''}`)) deny('PR 제목과 본문은 한국어로 쓴다 (바꾼 것·확인한 것만 짧게).')
  }
}

try {
  main()
} catch {}
