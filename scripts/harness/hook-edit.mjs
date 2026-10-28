// 하네스 훅 (PostToolUse · Edit|Write): 고친 파일에 맞춰 돌려 볼 점검·함께 고칠 문서를 알리고, 새로 쓴 글의 규칙 위반을 짚는다.
// 파일 규칙 알림은 한 세션에 규칙마다 한 번, 규칙 위반은 고칠 때마다. 막지는 않는다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'

import { readInput, ROOT } from './repo.mjs'
import { lint, rulesFor } from './rules.mjs'

function main() {
  const input = readInput()
  const abs = input.tool_input?.file_path
  if (typeof abs !== 'string') return
  const path = relative(ROOT, abs).split(sep).join('/')
  if (path.startsWith('..')) return

  const text = input.tool_input.new_string ?? input.tool_input.content ?? ''
  const before = input.tool_input.old_string ?? ''
  const lines = lint(path, text, before).map((l) => `- ${l}`)

  // 이 세션에 이미 알린 규칙은 다시 알리지 않는다
  const dir = join(tmpdir(), 'claude-harness')
  const file = join(dir, `${String(input.session_id ?? 'none').replace(/[^\w-]/g, '')}.json`)
  let seen = []
  try {
    seen = JSON.parse(readFileSync(file, 'utf8'))
  } catch {}
  const created = input.tool_name === 'Write' && input.tool_response?.type === 'create'
  const fresh = rulesFor(path, created).filter((r) => !seen.includes(r.id))
  for (const r of fresh) {
    const parts = [r.note, r.run?.length ? `돌려 볼 것: ${r.run.join(' / ')}` : '', r.docs?.length ? `함께 고칠 문서: ${r.docs.join(', ')}` : ''].filter(Boolean)
    lines.push(`- (${r.id}) ${parts.join(' ')}`)
  }
  if (fresh.length) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify([...seen, ...fresh.map((r) => r.id)]))
  }
  if (lines.length === 0) return
  const context = `[하네스] ${path}:\n${lines.join('\n')}`
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } }))
}

try {
  main()
} catch {}
