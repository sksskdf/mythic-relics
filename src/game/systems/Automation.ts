import { AUTOMATION_STEPS } from '../../progress/Automation'
import type { GameContext } from '../context'

/**
 * 자동화 (E305-03, `CYCLE.md` 3.5): 귀환 횟수가 여는 자동화(다시 찍기·가보·자동 합치기·출발점)를 귀환할 때 카드로 알리고,
 * 주운 장비·재료를 세어 엔딩 뒤 자동 줍기가 열리면 알린다. 켜졌나는 `AutomationProgress.now`가 셈한다 (엔딩을 봤으면 귀환 3 이상)
 */
export class AutomationSystem {
  constructor(ctx: GameContext) {
    const { bus, automation, expedition, ending } = ctx
    const picked = () => {
      if (!automation.picked()) return
      bus.emit('moment', { id: 'automation', card: { kind: '자동화', title: '자동 줍기', color: '#9fe3ff', lines: ['둘레의 장비를 걸어가지 않아도 줍는다', '재료 유물은 어디서나'] } })
      bus.emit('progressChanged', {})
    }
    bus.on('gearPicked', picked)
    bus.on('relicPicked', picked)
    // 귀환 1·2·3이 처음 연 것 (엔딩을 봤으면 이미 귀환 3 이상으로 쳐서 새로 열리는 것이 없다)
    bus.on('expeditionReturned', () => {
      if (ending.has('autoPickup')) return
      const step = AUTOMATION_STEPS.find((s) => s.at === expedition.returns)
      if (step) bus.emit('moment', { id: 'automation', card: { kind: '자동화', title: `${step.name} · 새 자동화`, color: '#9fe3ff', lines: [...step.lines] } })
    })
  }
}
