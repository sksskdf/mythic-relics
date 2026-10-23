// 작업 단위 체크: ROADMAP.md에서 작업 단위(`E11-01-1`)를 [x]로 바꾸고, 그 이슈의 새 본문을 만든다.
// 사용법: node scripts/roadmap-issues/tick.mjs <저장할 경로.json> <작업 단위 ID ...>
// 저장한 파일은 [{ id, number, body }] — GitHub MCP issue_write(update)에 그대로 넘긴다. 이슈 ID(`E11-01`)를 주면 체크 없이 본문만 만든다.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const here = new URL('.', import.meta.url)
const roadmap = new URL('../../ROADMAP.md', here)
const [out, ...ids] = process.argv.slice(2)
if (!out || ids.length === 0) throw new Error('사용법: tick.mjs <저장할 경로.json> <작업 단위 ID ...>')

let md = readFileSync(roadmap, 'utf8')
for (const id of ids.filter((x) => /^E\d+-\d+-\d+$/.test(x))) {
  const before = md
  md = md.replace(new RegExp(`^(\\s*- )\\[ \\]( ${id} )`, 'm'), '$1[x]$2')
  if (md === before && !new RegExp(`^\\s*- \\[x\\] ${id} `, 'm').test(md)) throw new Error(`작업 단위를 찾지 못함: ${id}`)
}
writeFileSync(roadmap, md)

// 계획을 이미 만든 것까지 모두 뽑아 본문을 얻는다
const all = new URL('all.json', `file://${process.env.TMPDIR ?? '/tmp'}/`)
execFileSync('node', [new URL('plan.mjs', here).pathname, all.pathname, '--all'], { stdio: 'ignore' })
const plan = JSON.parse(readFileSync(all, 'utf8'))
const known = JSON.parse(readFileSync(new URL('issues.json', here), 'utf8'))
const issueIds = [...new Set(ids.map((x) => x.split('-').slice(0, 2).join('-')))]
const result = issueIds.map((id) => {
  const p = plan.find((x) => x.id === id)
  if (!p || !known[id]) throw new Error(`이슈를 찾지 못함: ${id}`)
  return { id, number: known[id], body: p.body }
})
writeFileSync(out, JSON.stringify(result, null, 2))
console.log(result.map((r) => `${r.id} → #${r.number}`).join('\n'))
