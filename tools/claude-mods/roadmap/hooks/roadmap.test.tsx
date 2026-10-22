import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const fakeStore = (on: On) => {
  const saved = new Map<string, unknown>()
  on('store.get', async (_$, e) => ({ value: saved.get(e.key) }))
  on('store.set', async (_$, e) => {
    saved.set(e.key, e.value)

    return { value: undefined }
  })

  return saved
}

describe('roadmap', () => {
  test('/roadmap 명령으로 항목을 추가하고 상태를 바꾼다', async ($, on) => {
    const saved = fakeStore(on)

    const added = await $.command.run({ command: 'roadmap', args: 'add 캐릭터 이동 구현' })
    expect(added.text).toContain('#1')
    await $.command.run({ command: 'roadmap', args: 'add 맵 에디터' })
    await $.command.run({ command: 'roadmap', args: 'start 1' })
    await $.command.run({ command: 'roadmap', args: 'done 2' })

    const listed = await $.command.run({ command: 'roadmap', args: 'list' })
    expect(listed.text).toBe('#1 [진행 중] 캐릭터 이동 구현\n#2 [완료] 맵 에디터')
    expect(saved.get('items')).toEqual([
      { id: 1, title: '캐릭터 이동 구현', status: 'doing' },
      { id: 2, title: '맵 에디터', status: 'done' },
    ])

    await $.command.run({ command: 'roadmap', args: 'rm 2' })
    const after = await $.command.run({ command: 'roadmap', args: 'list' })
    expect(after.text).toBe('#1 [진행 중] 캐릭터 이동 구현')
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: 패널 항목을 누르면 상태가 순환한다`, async ($, on) => {
      fakeStore(on)
      await $.command.run({ command: 'roadmap', args: 'add 사운드' })

      const ui = await $.ui.mount({
        plugin: 'roadmap',
        surface,
        component: 'Pane',
        requestId: 'roadmap',
        props: {},
      })
      await ui.press({ key: 'tab-items' })
      expect((await ui.find({ type: 'Text', text: '할 일 (1)' }))).toBeDefined()

      await ui.press({ key: 'item-1' })
      expect((await ui.find({ type: 'Text', text: '진행 중 (1)' }))).toBeDefined()

      await ui.press({ key: 'item-1' })
      expect((await ui.find({ type: 'Text', text: '완료 (1)' }))).toBeDefined()
    })
  }

  const SAMPLE = [
    '## 0. 한눈에 보기',
    '### 0.1 단계와 일정',
    '| 단계 | 이름 | 기간 (예상) | 끝날 때 있어야 할 것 | 게이트 |',
    '| --- | --- | --- | --- | --- |',
    '| 0 | 컨셉 | 완료 | 기획 문서 | - |',
    '| 1 | 프로토타입 | 완료 + 검증 1~2주 | 빌드 | G1 재미 확인 |',
    '### 0.2 지금 할 일',
    '1. 직접 플레이 검증',
    '#### 순서와 이유',
    '| 순서 | 마일스톤 | 기간 | 플레이어가 느끼는 변화 | 이 순서인 이유 |',
    '| --- | --- | --- | --- | --- |',
    '| E1 | 조작 손보기 | 1~2주 | 빠져나갈 수 있다 | 가장 먼저 |',
    '#### E1 조작과 전투 손보기 (1~2주)',
    '- **목표:** 무리에서 빠져나갈 수 있다.',
    '| ID | 분야 | 작업 | 산출물 | 규모 |',
    '| --- | --- | --- | --- | --- |',
    '| E1-01 | EN | 무리 밀고 지나가기 | 밀어낸다 | M |',
    '- **자동 검증**',
    '  - 단위 테스트: 3초 안에 도착',
    '- **직접 플레이 체크리스트**',
    '  - [ ] 한 번 눌러서 빠져나가진다',
    '  - [ ] 표시만 보고 안다',
    '- **완료 기준:** 모두 통과',
  ].join('\n')

  for (const surface of ['terminal', 'desktop'] as const) {
    test(`${surface}: 계획 탭에서 마일스톤을 펼치고 체크리스트를 표시한다`, async ($, on) => {
      const saved = fakeStore(on)
      on('fs.read', async (_$, e) => ({ value: e.path.endsWith('ROADMAP.md') ? SAMPLE : '' }))
      await $.command.run({ command: 'roadmap', args: 'add E1 조작과 전투 손보기' })
      await $.command.run({ command: 'roadmap', args: 'start 1' })

      const ui = await $.ui.mount({
        plugin: 'roadmap',
        surface,
        component: 'Pane',
        requestId: 'roadmap',
        props: {},
      })
      expect(await ui.find({ type: 'Text', text: '지금 할 일' })).toBeDefined()
      expect(await ui.find({ key: 'ms-E1' })).toBeDefined()

      await ui.press({ key: 'ms-E1' })
      expect(await ui.find({ type: 'Text', text: '자동 검증' })).toBeDefined()

      await ui.press({ key: 'check-E1-1' })
      expect(saved.get('checks')).toEqual({ E1: [false, true] })
    })
  }

  test('/roadmap text 와 show 로 계획을 글로 본다', async ($, on) => {
    fakeStore(on)
    on('fs.read', async (_$, e) => ({ value: e.path.endsWith('ROADMAP.md') ? SAMPLE : '' }))
    const summary = await $.command.run({ command: 'roadmap', args: 'text' })
    expect(summary.text).toContain('○ E1 조작과 전투 손보기 (1~2주) · 체크 0/2')
    const detail = await $.command.run({ command: 'roadmap', args: 'show e1' })
    expect(detail.text).toContain('E1-01 무리 밀고 지나가기 (EN, M)')
    expect(detail.text).toContain('완료 기준: 모두 통과')
  })
})
