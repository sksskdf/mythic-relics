// 로드맵 페이지(아티팩트) 만들기: ROADMAP.md를 읽어 E1~E10 중심의 한 장짜리 HTML로 만든다.
// 사용법: node scripts/roadmap-page/build.mjs <저장할 경로.html>
// 로드맵을 고칠 때마다 다시 만들어 아티팩트에 올린다. (사용자는 아티팩트로 로드맵을 본다)
import { readFileSync, writeFileSync } from 'node:fs'

const here = new URL('.', import.meta.url)
const md = readFileSync(new URL('../../ROADMAP.md', here), 'utf8')
const out = process.argv[2] ?? 'test-results/roadmap.html'

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** 마크다운 한 줄 → HTML (굵게, 코드) */
const inline = (s) =>
  esc(s.trim())
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')

/** 제목으로 나눈 구역들 */
function sections(text) {
  const out = []
  let cur = null
  for (const line of text.split('\n')) {
    const m = /^(#{2,4}) (.*)$/.exec(line)
    if (m) {
      cur = { level: m[1].length, title: m[2].trim(), body: [] }
      out.push(cur)
    } else if (cur) cur.body.push(line)
  }
  return out
}

/** 구역 안의 표들 (머리줄 → 값) */
function tables(body) {
  const result = []
  let rows = []
  const flush = () => {
    if (rows.length > 2) {
      const [head, , ...data] = rows
      result.push(data.map((row) => Object.fromEntries(head.map((h, i) => [h, row[i] ?? '']))))
    }
    rows = []
  }
  for (const line of body) {
    if (line.startsWith('|')) rows.push(line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim()))
    else flush()
  }
  flush()
  return result
}

const field = (body, label) => {
  const line = body.find((l) => l.startsWith(`- **${label}`))
  return line ? inline(line.split(':**').slice(1).join(':**')) : ''
}

/** "- **자동 검증**" 아래 들여쓴 항목들. 체크박스는 [x] 여부를 함께 */
function bulletsUnder(body, label) {
  const out = []
  let on = false
  for (const line of body) {
    if (line.startsWith('- ') && line.includes(label)) {
      on = true
      const rest = line.split(':**').slice(1).join(':**').trim()
      if (rest) out.push({ text: inline(rest), checked: false })
      continue
    }
    if (!on) continue
    if (line.startsWith('  - ')) {
      const raw = line.slice(4)
      const checked = /^\[x\] /.test(raw)
      out.push({ text: inline(raw.replace(/^\[[ x]\] /, '')), checked })
    } else if (line.trim() !== '') break
  }
  return out
}

function gateOf(body) {
  const start = body.findIndex((l) => l.startsWith('**게이트'))
  if (start < 0) return null
  const items = []
  for (const line of body.slice(start + 1)) {
    if (line.startsWith('- ')) items.push(inline(line.slice(2)))
    else if (line.trim() !== '' || items.length > 0) break
  }
  return { title: inline(body[start].replace(/\*\*/g, '')), items }
}

const all = sections(md)
const find = (prefix) => all.find((s) => s.title.startsWith(prefix))
const cells = (rows) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, inline(v)])))

const meta = md
  .split('\n')
  .filter((l) => l.startsWith('> '))
  .slice(0, 3)
  .map((l) => inline(l.slice(2)))
const phases = cells(tables(find('0.1').body)[0])
const nowBody = find('0.2').body
const now = nowBody.filter((l) => /^\d+\. /.test(l)).map((l) => inline(l.replace(/^\d+\. /, '')))
const progress = cells(tables(nowBody)[0] ?? [])
const rules = find('1.').body.filter((l) => /^ {0,2}- /.test(l)).map((l) => ({ text: inline(l.replace(/^ {0,2}- /, '')), sub: l.startsWith('  ') }))
const order = cells(tables(all.find((s) => s.title === '순서와 이유').body)[0])

const milestones = []
for (const s of all) {
  const m = /^(E\d+(?:\.\d)?) (.+?) \((.+)\)$/.exec(s.title)
  if (!m) continue
  const row = order.find((o) => o['순서'].replace(/<[^>]+>/g, '').replace(' ✅', '').trim() === m[1])
  milestones.push({
    id: m[1],
    name: m[2],
    weeks: m[3],
    done: !!row && row['순서'].includes('✅'),
    feel: row?.['플레이어가 느끼는 변화'] ?? '',
    reason: row?.['이 순서인 이유'] ?? '',
    goal: field(s.body, '목표'),
    background: field(s.body, '배경'),
    why: field(s.body, '이유'),
    tasks: cells(tables(s.body)[0] ?? []).map((t) => ({ ...t, done: (t.ID ?? '').includes('✅') })),
    auto: bulletsUnder(s.body, '자동 검증'),
    manual: bulletsUnder(s.body, '직접 플레이 체크리스트'),
    log: bulletsUnder(s.body, '진행 상황'),
    criteria: field(s.body, '완료 기준'),
    gate: gateOf(s.body),
  })
}
// 아직 끝나지 않은 첫 마일스톤이 지금 하는 것
const current = milestones.find((m) => !m.done)
if (current) current.now = true

const sprints = cells(tables(find('3.').body)[0] ?? [])
const after = find('4.').body.filter((l) => l.startsWith('- ')).map((l) => inline(l.slice(2)))
const decisions = cells(tables(find('5.').body)[0] ?? [])
const risks = cells(tables(find('6.').body)[0] ?? [])

const DATA = { meta, phases, now, progress, rules, milestones, sprints, after, decisions, risks }
const head = readFileSync(new URL('head.html', here), 'utf8')
const body = readFileSync(new URL('body.html', here), 'utf8')
writeFileSync(out, `${head}\n${body.replace('/*DATA*/', `const DATA = ${JSON.stringify(DATA)};`)}`)
console.log(`로드맵 페이지: ${out} (마일스톤 ${milestones.length}개, 지금: ${current?.id ?? '없음'})`)
