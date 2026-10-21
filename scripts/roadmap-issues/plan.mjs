// 로드맵 → GitHub 이슈 계획: ROADMAP.md를 읽어 마일스톤 이슈(부모)와 작업 이슈(자식)의 제목·본문·라벨을 만든다.
// 사용법: node scripts/roadmap-issues/plan.mjs [저장할 경로.json]
// 만든 이슈 번호는 scripts/roadmap-issues/issues.json에 둔다 (ID → 번호). 이미 번호가 있는 ID는 계획에서 뺀다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const md = readFileSync(new URL('../../ROADMAP.md', here), 'utf8')
const mapPath = new URL('issues.json', here)
const known = existsSync(mapPath) ? JSON.parse(readFileSync(mapPath, 'utf8')) : {}
const out = process.argv[2]

/** 마일스톤 구역: `#### E11 이름 (기간)`부터 다음 `####`/`##`까지 */
const milestones = []
let cur = null
for (const line of md.split('\n')) {
  const m = /^#### (E\d+) (.*?)(?: \((.+)\))?$/.exec(line)
  if (m) {
    cur = { id: m[1], name: m[2], period: m[3] ?? '', lines: [] }
    milestones.push(cur)
  } else if (/^#{2,4} /.test(line)) cur = null
  else if (cur) cur.lines.push(line)
}

/** `- **이름**` 아래 들여쓴 줄들 */
function under(lines, name) {
  const start = lines.findIndex((l) => l.startsWith(`- **${name}`))
  if (start < 0) return []
  const res = []
  for (const l of lines.slice(start + 1)) {
    if (!l.startsWith('  ')) break
    res.push(l.trim())
  }
  return res
}
const field = (lines, name) => lines.find((l) => l.startsWith(`- **${name}:**`))?.replace(`- **${name}:**`, '').trim() ?? ''
/** 순서와 이유 표의 한 줄 */
const order = Object.fromEntries(
  md.split('\n').filter((l) => /^\| E\d+ \|/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim())).map((c) => [c[0], c]),
)

const plan = []
for (const ms of milestones) {
  const rows = ms.lines.filter((l) => /^\| E\d+-\d+/.test(l)).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))
  const units = under(ms.lines, '작업 단위')
  const checklist = under(ms.lines, '직접 플레이 체크리스트')
  const verify = under(ms.lines, '자동 검증')
  const why = order[ms.id]
  plan.push({
    id: ms.id,
    kind: 'milestone',
    title: `${ms.id} ${ms.name}`,
    labels: ['마일스톤', ms.id],
    body: [
      `**목표:** ${field(ms.lines, '목표')}`,
      ms.period && `**기간 (예상):** ${ms.period}`,
      why && `**플레이어가 느끼는 변화:** ${why[3]}\n**이 순서인 이유:** ${why[4]}`,
      `### 작업\n하위 이슈 ${rows.length}개 (${rows.map((r) => r[0]).join(', ')})`,
      `### 자동 검증\n${verify.map((v) => (v.startsWith('- ') ? `- [ ] ${v.slice(2)}` : v)).join('\n')}`,
      `### 직접 플레이 체크리스트\n${checklist.join('\n')}`,
      `### 완료 기준\n${field(ms.lines, '완료 기준')}`,
      '---\n`ROADMAP.md`에서 만든 이슈. 하위 이슈를 모두 닫고 완료 기준을 넘으면 닫는다.',
    ].filter(Boolean).join('\n\n'),
  })
  for (const [id, area, work, output, size] of rows) {
    const mine = units.filter((u) => u.slice(6).startsWith(`${id}-`))
    plan.push({
      id,
      kind: 'issue',
      parent: ms.id,
      title: `${id} ${work.replace(/`/g, '')}`,
      labels: [ms.id, area.split('/')[0], `규모 ${size}`],
      body: [
        `**마일스톤:** ${ms.id} ${ms.name}`,
        `**분야:** ${area} · **규모:** ${size}`,
        `**산출물:** ${output}`,
        `### 작업 단위\n${mine.join('\n')}`,
        '---\n`ROADMAP.md`에서 만든 이슈. 작업 단위를 끝낼 때마다 여기와 `ROADMAP.md`를 함께 체크하고, 다 끝나면 닫는다.',
      ].join('\n\n'),
    })
  }
}

const todo = plan.filter((p) => !known[p.id])
if (out) writeFileSync(out, JSON.stringify(todo, null, 2))
console.log(`마일스톤 ${plan.filter((p) => p.kind === 'milestone').length}, 이슈 ${plan.filter((p) => p.kind === 'issue').length}, 새로 만들 것 ${todo.length}`)
