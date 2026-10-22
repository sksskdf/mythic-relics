import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { RoadmapChecks, RoadmapItem, RoadmapStatus, RoadmapView } from '../types'

const PANE = 'roadmap'
const TITLE = '로드맵'
const STORE_KEY = 'items'
const CHECKS_KEY = 'checks'
const DOC = 'ROADMAP.md'
const items = atom({ plugin: 'roadmap', key: 'items' } as const, [])
const view = atom({ plugin: 'roadmap', key: 'view' } as const, { tab: 'plan', open: null })
const checks = atom({ plugin: 'roadmap', key: 'checks' } as const, {})
const docVersion = atom({ plugin: 'roadmap', key: 'docVersion' } as const, 0)

const STATUSES: RoadmapStatus[] = ['doing', 'todo', 'done']
const HEADINGS: Record<RoadmapStatus, string> = {
  doing: '진행 중',
  todo: '할 일',
  done: '완료',
}
const MARKS: Record<RoadmapStatus, string> = { doing: '▶', todo: '○', done: '✓' }
const NEXT: Record<RoadmapStatus, RoadmapStatus> = {
  todo: 'doing',
  doing: 'done',
  done: 'todo',
}

const isStatus = (value: unknown): value is RoadmapStatus =>
  value === 'todo' || value === 'doing' || value === 'done'

const nextId = (list: RoadmapItem[]) => list.reduce((max, one) => Math.max(max, one.id), 0) + 1

const change = async ($: EngineInterface, fn: (list: RoadmapItem[]) => RoadmapItem[]) => {
  await update($, items, fn)
  const list = await read($, items)
  await $.store.set(STORE_KEY, list)

  return list
}

const describe = (list: RoadmapItem[]) =>
  list.length === 0
    ? '로드맵이 비어 있습니다.'
    : STATUSES.flatMap(status =>
        list
          .filter(one => one.status === status)
          .map(one => `#${one.id} [${HEADINGS[status]}] ${one.title}`),
      ).join('\n')

const USAGE = [
  '/roadmap              패널 열기',
  '/roadmap plan         계획 보기 (ROADMAP.md)',
  '/roadmap text         계획 요약을 글로 보기',
  '/roadmap show <E1>    마일스톤 자세히 (글)',
  '/roadmap items        할 일 목록 보기',
  '/roadmap reload       ROADMAP.md 다시 읽기',
  '/roadmap add <제목>    항목 추가',
  '/roadmap start <번호>  진행 중으로 변경',
  '/roadmap done <번호>   완료로 변경',
  '/roadmap todo <번호>   할 일로 되돌리기',
  '/roadmap rm <번호>     항목 삭제',
  '/roadmap list         목록 출력',
].join('\n')

// ROADMAP.md는 그릴 때마다 읽되, 바뀌지 않았으면 전에 읽은 결과를 쓴다.
let cache: { text: string; plan: Plan } | null = null
const loadPlan = async ($: EngineInterface): Promise<Plan | null> => {
  const text = await $.fs.read(DOC).catch(() => null)
  if (typeof text !== 'string') return null
  if (cache?.text !== text) cache = { text, plan: parsePlan(text) }
  return cache.plan
}

/** 할 일 목록에서 마일스톤 이름으로 시작하는 항목의 상태 (예: "E1 조작과 ...") */
const milestoneStatus = (list: RoadmapItem[], id: string): RoadmapStatus | undefined =>
  list.find(one => one.title.startsWith(`${id} `))?.status

const setView = ($: EngineInterface, patch: Partial<RoadmapView>) => update($, view, v => ({ ...v, ...patch }))

const toggleCheck = async ($: EngineInterface, id: string, index: number) => {
  await update($, checks, all => {
    const old = all[id] ?? []
    const row = Array.from({ length: Math.max(old.length, index + 1) }, (_, i) => old[i] === true)
    row[index] = !row[index]
    return { ...all, [id]: row }
  })
  await $.store.set(CHECKS_KEY, await read($, checks))
}

/** ROADMAP.md에서 패널에 보여 줄 부분만 뽑아낸 것 */
type Milestone = {
  id: string
  name: string
  weeks: string
  /** 플레이어가 느끼는 변화 (순서표에서) */
  feel: string
  /** 이 순서인 이유 (순서표에서) */
  reason: string
  goal: string
  background: string
  why: string
  tasks: { id: string; track: string; title: string; size: string }[]
  auto: string[]
  manual: string[]
  done: string
  /** 이 마일스톤으로 판단하는 게이트 (E10 → G2) */
  gate: { title: string; items: string[] } | null
}

type Phase = { stage: string; name: string; weeks: string; gate: string }

type LaterStage = { title: string; goal: string; parts: { name: string; weeks: string; content: string }[] }

type Plan = { phases: Phase[]; now: string[]; milestones: Milestone[]; later: LaterStage[] }

type Section = { level: number; title: string; body: string[] }

/** **굵게**, `코드` 같은 표시를 걷어 낸다. 패널은 일반 글자로 그린다. */
const plain = (text: string) => text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/`(.+?)`/g, '$1').trim()

function sections(markdown: string): Section[] {
  const out: Section[] = []
  for (const line of markdown.split('\n')) {
    const m = /^(#{2,4}) (.*)$/.exec(line)
    if (m) out.push({ level: m[1]!.length, title: m[2]!.trim(), body: [] })
    else out.at(-1)?.body.push(line)
  }
  return out
}

/** 본문의 표들을 머리글 → 값 객체 목록으로 */
function tables(body: string[]): Record<string, string>[][] {
  const result: Record<string, string>[][] = []
  let rows: string[][] = []
  for (const line of [...body, '']) {
    if (line.startsWith('|')) {
      rows.push(line.trim().replace(/^\||\|$/g, '').split('|').map(cell => plain(cell)))
    } else if (rows.length) {
      const [head, , ...data] = rows
      result.push(data.map(row => Object.fromEntries(head!.map((h, i) => [h, row[i] ?? '']))))
      rows = []
    }
  }
  return result
}

/** "- **목표:** ..." 같은 한 줄 항목의 값 */
function field(body: string[], label: string): string {
  const line = body.find(l => l.startsWith(`- **${label}`))
  return line ? plain(line.split(':**').slice(1).join(':**')) : ''
}

/** "- **자동 검증**" 아래 들여쓴 항목들 */
function bulletsUnder(body: string[], label: string): string[] {
  const out: string[] = []
  let on = false
  for (const line of body) {
    if (line.startsWith('- ') && line.includes(label)) {
      on = true
      // "- **자동 검증:** 내용"처럼 한 줄에 쓴 경우
      const inline = plain(line.split(':**').slice(1).join(':**'))
      if (inline !== '') out.push(inline)
      continue
    }
    if (!on) continue
    if (line.startsWith('  - ')) out.push(plain(line.slice(4)).replace(/^\[[ x]\] /, ''))
    else if (line.trim() !== '') break
  }
  return out
}

/** "**게이트 G2: 제작 착수** (설명)" 아래 항목들 */
function gateOf(body: string[]): { title: string; items: string[] } | null {
  const start = body.findIndex(l => l.startsWith('**게이트'))
  if (start < 0) return null
  const items: string[] = []
  for (const line of body.slice(start + 1)) {
    if (line.startsWith('- ')) items.push(plain(line.slice(2)))
    else if (line.trim() !== '' || items.length > 0) break
  }
  return { title: plain(body[start]!), items }
}

export function parsePlan(markdown: string): Plan {
  const all = sections(markdown)
  const find = (prefix: string) => all.find(s => s.title.startsWith(prefix))

  const phases = (tables(find('0.1')?.body ?? [])[0] ?? []).map(row => ({
    stage: row['단계'] ?? '',
    name: row['이름'] ?? '',
    weeks: row['기간 (예상)'] ?? '',
    gate: row['게이트'] === '-' ? '' : (row['게이트'] ?? ''),
  }))
  const now = (find('0.2')?.body ?? [])
    .filter(l => /^\d+\. /.test(l))
    .map(l => plain(l.replace(/^\d+\. /, '')))

  const order = new Map(
    (tables(all.find(s => s.title === '순서와 이유')?.body ?? [])[0] ?? []).map(row => [row['순서'] ?? '', row]),
  )
  const milestones: Milestone[] = []
  for (const s of all) {
    const m = /^(E\d+) (.+?) \((.+)\)$/.exec(s.title)
    if (!m) continue
    const row = order.get(m[1]!)
    milestones.push({
      id: m[1]!,
      name: m[2]!,
      weeks: m[3]!,
      feel: row?.['플레이어가 느끼는 변화'] ?? '',
      reason: row?.['이 순서인 이유'] ?? '',
      goal: field(s.body, '목표'),
      background: field(s.body, '배경'),
      why: field(s.body, '이유'),
      tasks: (tables(s.body)[0] ?? []).map(t => ({
        id: t['ID'] ?? '',
        track: t['분야'] ?? '',
        title: t['작업'] ?? '',
        size: t['규모'] ?? '',
      })),
      auto: bulletsUnder(s.body, '자동 검증'),
      manual: bulletsUnder(s.body, '직접 플레이 체크리스트'),
      done: field(s.body, '완료 기준'),
      gate: gateOf(s.body),
    })
  }

  const later: LaterStage[] = []
  for (const prefix of ['4.3', '4.4', '4.5', '4.6']) {
    const s = find(prefix)
    if (!s) continue
    const overview = tables(s.body)[0] ?? []
    later.push({
      title: s.title.replace(/^4\.\d /, ''),
      goal: field(s.body, '목표'),
      parts: overview
        .filter(row => '마일스톤' in row)
        .map(row => ({ name: row['마일스톤'] ?? '', weeks: row['기간'] ?? '', content: row['내용'] ?? '' })),
    })
  }
  return { phases, now, milestones, later }
}

/** 패널 대신 글로 보여 줄 때의 계획 요약 */
const planText = (plan: Plan, list: RoadmapItem[], allChecks: RoadmapChecks) =>
  [
    '지금 할 일',
    ...plan.now.map((line, i) => `  ${i + 1}. ${line}`),
    '',
    '단계 2 마일스톤',
    ...plan.milestones.map(m => {
      const status = milestoneStatus(list, m.id)
      const ticked = m.manual.filter((_, i) => (allChecks[m.id] ?? [])[i]).length
      return `  ${status ? MARKS[status] : '○'} ${m.id} ${m.name} (${m.weeks}) · 체크 ${ticked}/${m.manual.length}\n      ${m.goal}`
    }),
    '',
    '마일스톤 하나를 자세히: /roadmap show E1',
  ].join('\n')

const milestoneText = (m: Milestone) =>
  [
    `${m.id} ${m.name} (${m.weeks})`,
    `목표: ${m.goal}`,
    ...(m.reason ? [`순서 이유: ${m.reason}`] : []),
    ...(m.background ? [`배경: ${m.background}`] : []),
    '',
    '작업',
    ...m.tasks.map(t => `  ${t.id} ${t.title} (${t.track}, ${t.size})`),
    ...(m.auto.length ? ['', '자동 검증', ...m.auto.map(a => `  · ${a}`)] : []),
    ...(m.manual.length ? ['', '직접 플레이 체크리스트', ...m.manual.map(c => `  ☐ ${c}`)] : []),
    ...(m.gate ? ['', m.gate.title, ...m.gate.items.map(g => `  · ${g}`)] : []),
    ...(m.done ? ['', `완료 기준: ${m.done}`] : []),
  ].join('\n')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const saved = await $.store.get(STORE_KEY)
    if (Array.isArray(saved)) {
      await update($, items, () => saved as RoadmapItem[])
    }
    const savedChecks = await $.store.get(CHECKS_KEY)
    if (savedChecks && typeof savedChecks === 'object') {
      await update($, checks, () => savedChecks as RoadmapChecks)
    }

    await $.command.register({
      name: 'roadmap',
      description: '로드맵 패널 열기, 계획 보기, 할 일 관리 (plan, items, reload, add, start, done, todo, rm, list)',
    })
    await $.tool.register({
      name: 'roadmap',
      description:
        '프로젝트 로드맵 패널을 관리합니다. action: list(목록 조회), add(title로 항목 추가, status 선택), set(id의 status 변경), remove(id 삭제). status는 todo, doing, done 중 하나입니다.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'add', 'set', 'remove'] },
          title: { type: 'string' },
          id: { type: 'number' },
          status: { type: 'string', enum: ['todo', 'doing', 'done'] },
        },
        required: ['action'],
      },
    })
    void $.ui.open({ id: PANE, title: TITLE })

    return next(e)
  })

  on('command.run', { command: 'roadmap' }, async ($, e) => {
    const [verb = '', ...rest] = e.args.trim().split(/\s+/)
    const arg = rest.join(' ').trim()
    const id = Number(arg)

    if (verb === '' || verb === 'text') {
      const opened = verb === '' ? await $.ui.open({ id: PANE, title: TITLE }) : { isPlaced: false }
      if (opened.isPlaced) return { text: '로드맵 패널을 열었습니다.' }

      // 패널을 그리지 못하는 화면(일부 앱·웹)에서는 같은 내용을 글로 보여 준다.
      const plan = await loadPlan($)
      if (!plan) return { text: `${DOC}를 찾지 못했습니다.` }
      return { text: planText(plan, await read($, items), await read($, checks)) }
    }
    if (verb === 'plan' || verb === 'items') {
      await setView($, { tab: verb })
      await $.ui.open({ id: PANE, title: TITLE })

      return { text: verb === 'plan' ? '계획을 띄웠습니다.' : '할 일 목록을 띄웠습니다.' }
    }
    if (verb === 'reload') {
      cache = null
      await update($, docVersion, n => n + 1)
      const plan = await loadPlan($)

      return { text: plan ? `${DOC}를 다시 읽었습니다. 마일스톤 ${plan.milestones.length}개` : `${DOC}를 찾지 못했습니다.` }
    }
    if (verb === 'show') {
      const plan = await loadPlan($)
      const m = plan?.milestones.find(one => one.id.toLowerCase() === arg.toLowerCase())
      return { text: m ? milestoneText(m) : `${arg || '(빈칸)'} 마일스톤을 찾지 못했습니다. 예: /roadmap show E1` }
    }
    if (verb === 'list') {
      return { text: describe(await read($, items)) }
    }
    if (verb === 'add' && arg !== '') {
      const list = await change($, all => [
        ...all,
        { id: nextId(all), title: arg, status: 'todo' },
      ])

      return { text: `#${list.at(-1)?.id} 항목을 추가했습니다: ${arg}` }
    }
    if (verb === 'rm' && Number.isInteger(id)) {
      const before = await read($, items)
      if (!before.some(one => one.id === id)) return { text: `#${id} 항목이 없습니다.` }
      await change($, all => all.filter(one => one.id !== id))

      return { text: `#${id} 항목을 삭제했습니다.` }
    }
    const target: RoadmapStatus | undefined =
      verb === 'start' ? 'doing' : verb === 'done' ? 'done' : verb === 'todo' ? 'todo' : undefined
    if (target && Number.isInteger(id)) {
      const before = await read($, items)
      if (!before.some(one => one.id === id)) return { text: `#${id} 항목이 없습니다.` }
      await change($, all => all.map(one => (one.id === id ? { ...one, status: target } : one)))

      return { text: `#${id} 항목을 '${HEADINGS[target]}'(으)로 바꿨습니다.` }
    }

    return { text: USAGE }
  })

  on('tool.call', { tool: /^mcp__roadmap__roadmap$/ }, async ($, e) => {
    const input = e as unknown as { action?: string; title?: string; id?: number; status?: unknown }
    const reply = (text: string) => ({ result: text })

    if (input.action === 'add' && typeof input.title === 'string' && input.title.trim() !== '') {
      const title = input.title.trim()
      const status = isStatus(input.status) ? input.status : 'todo'
      const list = await change($, all => [...all, { id: nextId(all), title, status }])

      return reply(`#${list.at(-1)?.id} 추가됨\n\n${describe(list)}`)
    }
    if (input.action === 'set' && typeof input.id === 'number' && isStatus(input.status)) {
      const status = input.status
      const before = await read($, items)
      if (!before.some(one => one.id === input.id)) return { deny: `#${input.id} 항목이 없습니다.` }
      const list = await change($, all =>
        all.map(one => (one.id === input.id ? { ...one, status } : one)),
      )

      return reply(describe(list))
    }
    if (input.action === 'remove' && typeof input.id === 'number') {
      const before = await read($, items)
      if (!before.some(one => one.id === input.id)) return { deny: `#${input.id} 항목이 없습니다.` }
      const list = await change($, all => all.filter(one => one.id !== input.id))

      return reply(describe(list))
    }
    if (input.action === 'list') {
      return reply(describe(await read($, items)))
    }

    return { deny: 'action과 필요한 값(add: title, set: id와 status, remove: id)을 확인해 주세요.' }
  })

  // ROADMAP.md를 고치면 패널을 다시 그린다.
  on('tool.call', { tool: /^(Edit|Write|MultiEdit)$/ }, async ($, e, next) => {
    const result = await next(e)
    const path = String((e as unknown as { file_path?: string }).file_path ?? '')
    // 패널을 다시 그리는 일이 실패해도 파일 수정 결과는 그대로 돌려준다.
    if (path.endsWith(DOC)) await update($, docVersion, n => n + 1).catch(() => undefined)

    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, items)
    const v = await read($, view)
    await read($, docVersion)

    const tabs = (
      <Box flexDirection="row" gap={2}>
        <Button key="tab-plan" onPress={() => setView($, { tab: 'plan' })}>
          <Text bold={v.tab === 'plan'} dimColor={v.tab !== 'plan'}>계획</Text>
        </Button>
        <Button key="tab-items" onPress={() => setView($, { tab: 'items' })}>
          <Text bold={v.tab === 'items'} dimColor={v.tab !== 'items'}>할 일 목록</Text>
        </Button>
      </Box>
    )

    if (v.tab === 'items') {
      const done = list.filter(one => one.status === 'done').length

      return (
        <Box flexDirection="column">
          {tabs}
          <Text dimColor>
            {list.length === 0
              ? '항목이 없습니다. /roadmap add <제목> 으로 추가하세요.'
              : `완료 ${done}/${list.length} · 항목을 누르면 상태가 바뀝니다`}
          </Text>
          {STATUSES.map(status => {
            const group = list.filter(one => one.status === status)
            if (group.length === 0) return null

            return (
              <Box flexDirection="column" marginTop={1}>
                <Text bold>
                  {HEADINGS[status]} ({group.length})
                </Text>
                {group.map(one => (
                  <Button
                    key={`item-${one.id}`}
                    onPress={() =>
                      change($, all =>
                        all.map(it => (it.id === one.id ? { ...it, status: NEXT[it.status] } : it)),
                      )
                    }
                  >
                    {MARKS[status]} #{one.id} <Text dimColor={status === 'done'}>{one.title}</Text>
                  </Button>
                ))}
              </Box>
            )
          })}
        </Box>
      )
    }

    const plan = await loadPlan($)
    if (!plan) {
      return (
        <Box flexDirection="column">
          {tabs}
          <Text dimColor>{DOC}를 찾지 못했습니다. 프로젝트 폴더에서 열어 주세요.</Text>
        </Box>
      )
    }
    const allChecks = await read($, checks)
    const nowStage = plan.phases.find(p => p.weeks.includes('검증')) ?? plan.phases[1]

    return (
      <Box flexDirection="column">
        {tabs}

        <Box flexDirection="column" marginTop={1}>
          <Text bold>지금 할 일</Text>
          {plan.now.map((line, i) => (
            <Text>
              {i + 1}. {line}
            </Text>
          ))}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>단계</Text>
          {plan.phases.map(p => {
            const mark = p.stage === '0' ? '✓' : p === nowStage ? '▶' : '○'

            return (
              <Text dimColor={p.stage === '0'}>
                {mark} {p.stage}. {p.name} <Text dimColor>· {p.weeks}{p.gate ? ` · ${p.gate}` : ''}</Text>
              </Text>
            )
          })}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>단계 2 마일스톤 · 누르면 펼쳐집니다</Text>
          {plan.milestones.map(m => {
            const status = milestoneStatus(list, m.id)
            const ticks = allChecks[m.id] ?? []
            const ticked = m.manual.filter((_, i) => ticks[i]).length
            const isOpen = v.open === m.id

            return (
              <Box flexDirection="column">
                <Button key={`ms-${m.id}`} onPress={() => setView($, { open: isOpen ? null : m.id })}>
                  {status ? MARKS[status] : '○'} {isOpen ? '▾' : '▸'} {m.id} {m.name}{' '}
                  <Text dimColor>
                    · {m.weeks} · 체크 {ticked}/{m.manual.length}
                  </Text>
                </Button>
                {isOpen && (
                  <Box flexDirection="column" marginLeft={2} marginBottom={1}>
                    <Text>
                      <Text bold>목표 </Text>
                      {m.goal}
                    </Text>
                    {m.reason !== '' && (
                      <Text dimColor>
                        <Text bold>순서 이유 </Text>
                        {m.reason}
                      </Text>
                    )}
                    {m.background !== '' && (
                      <Text dimColor>
                        <Text bold>배경 </Text>
                        {m.background}
                      </Text>
                    )}
                    {m.why !== '' && (
                      <Text dimColor>
                        <Text bold>이유 </Text>
                        {m.why}
                      </Text>
                    )}

                    <Text bold>작업</Text>
                    {m.tasks.map(t => (
                      <Text>
                        <Text dimColor>{t.id}</Text> {t.title} <Text dimColor>({t.track}, {t.size})</Text>
                      </Text>
                    ))}

                    {m.auto.length > 0 && <Text bold>자동 검증</Text>}
                    {m.auto.map(a => (
                      <Text>· {a}</Text>
                    ))}

                    {m.manual.length > 0 && <Text bold>직접 플레이 체크리스트 · 누르면 표시</Text>}
                    {m.manual.map((item, i) => (
                      <Button key={`check-${m.id}-${i}`} onPress={() => toggleCheck($, m.id, i)}>
                        {ticks[i] ? '☑' : '☐'} <Text dimColor={ticks[i]}>{item}</Text>
                      </Button>
                    ))}

                    {m.gate && (
                      <Box flexDirection="column">
                        <Text bold color="warning">{m.gate.title}</Text>
                        {m.gate.items.map(item => (
                          <Text>· {item}</Text>
                        ))}
                      </Box>
                    )}
                    {m.done !== '' && (
                      <Text color="warning">
                        <Text bold>완료 기준 </Text>
                        {m.done}
                      </Text>
                    )}
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>이후 단계</Text>
          {plan.later.map(stage => (
            <Box flexDirection="column">
              <Text>○ {stage.title}</Text>
              {stage.parts.map(part => (
                <Text dimColor>
                  {'   '}
                  {part.name} · {part.weeks}
                </Text>
              ))}
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Button key="reload" onPress={async () => {
            cache = null
            await update($, docVersion, n => n + 1)
          }}>
            <Text dimColor>↻ {DOC} 다시 읽기</Text>
          </Button>
        </Box>
      </Box>
    )
  })
}
