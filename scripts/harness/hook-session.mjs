// 하네스 훅 (SessionStart): 세션을 시작하거나 대화를 줄인 뒤 인수인계 요약과 지금 저장소 상태를 넣어 준다.
// 넣는 것: handoff.md의 한 줄 요약·다음 할 일·사용자에게 받아야 할 것, 브랜치·커밋하지 않은 파일·최근 커밋, 의존성, 검사 도장.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { branch, checkState, readInput, ROOT } from './repo.mjs'

const sh = (cmd, args) => {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** 마크다운에서 `## 제목` 아래 글 (다음 `## `까지) */
function section(md, title) {
  const at = md.indexOf(`\n## ${title}`)
  if (at < 0) return ''
  const body = md.slice(md.indexOf('\n', at + 1) + 1)
  const end = body.search(/\n## /)
  return (end < 0 ? body : body.slice(0, end)).trim()
}

function main() {
  const source = readInput().source ?? 'startup'
  const out = []
  const handoff = join(ROOT, 'docs/knowledge/handoff.md')
  if (existsSync(handoff)) {
    const md = readFileSync(handoff, 'utf8')
    out.push('## 인수인계 (docs/knowledge/handoff.md, 자세한 상태 표는 그 파일)')
    for (const title of ['한 줄 요약', '다음 할 일', '사용자에게 받아야 할 것']) {
      const body = section(md, title)
      if (body) out.push(`### ${title}\n${body}`)
    }
  }

  const status = sh('git', ['status', '--short']).split('\n').filter(Boolean)
  out.push(
    '## 저장소',
    `- 브랜치: ${branch() || '(알 수 없음)'}${branch() === 'main' ? ' — 작업은 main에서 새 브랜치(feature/<마일스톤>-<내용>)를 만들어 한다' : ''}`,
    `- 커밋하지 않은 파일: ${status.length ? `${status.length}개 (${status.slice(0, 5).map((l) => l.slice(3)).join(', ')}${status.length > 5 ? ' …' : ''})` : '없음'}`,
    `- 최근 커밋: ${sh('git', ['log', '--oneline', '-3']).split('\n').join(' / ')}`,
  )
  if (!existsSync(join(ROOT, 'node_modules'))) out.push('- 의존성이 없다: `npm ci`부터 (사용자 컴퓨터에서는 pnpm)')
  try {
    const s = checkState()
    out.push(`- 검사 도장: ${s.sameAsHead ? '코드가 HEAD와 같음' : s.checked ? '지금 코드로 npm run check 통과' : '코드가 바뀐 뒤 아직 npm run check를 통과하지 않음 (커밋 훅이 막는다)'}`)
  } catch {}

  out.push(
    '## 하네스',
    '- 커밋 전 검사·main 푸시·낡은 빌드·포트 충돌은 훅이 막고, 파일을 고치면 돌려 볼 점검을 알린다. 지금 바뀐 것에 맞는 점검 모음: `node scripts/harness/what-to-run.mjs`',
    '- 서브에이전트: game-reviewer(PR 전 리뷰), playtest-qa(봇·스크린숏 QA), balance-analyst(수치 분석). 스킬: /roadmap-sync, /balance-pass, /qa-pass, steward(PR 지키기)',
  )
  if (source === 'compact') out.unshift('(대화를 줄인 뒤 다시 넣은 인수인계다. 하던 일을 이어 간다.)')
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: out.join('\n') } }))
}

try {
  main()
} catch {}
