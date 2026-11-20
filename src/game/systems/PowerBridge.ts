import { godPowers, lendPower, power, type PowerId, relicPowerId, ultimateId, weaponId } from '../../data/powers'
import { lendText } from '../../myth/levelGains'
import { type God, godDef, relicDef, type RelicId } from '../../relics/data'
import { classIcon } from '../../ui/classIcons'
import { josa } from '../../ui/josa'
import type { GameContext } from '../context'

/** 다리가 부르는 `RelicSystem`의 일 */
interface BridgeHost {
  syncPowers(announce?: boolean): void
  announce(god: God): void
  offerSwap: ((part: 'hand' | 'heart', incoming: God, current: God, choose: (take: boolean) => void) => void) | null
}

/**
 * 임시 다리 (재미 재설계 P2). 힘을 고르는 카드(P5)와 차례 없는 흔적(P4)이 생길 때까지, 지금의 깨우는 흐름이 힘을 주게 잇는다.
 * P4·P5가 이 파일을 통째로 걷는다. 힘을 주는 길은 여기 한 곳뿐이다 (점검용 지름길 `RelicSystem.choose`는 따로):
 * - 흔적의 무리를 이김(조각 2): 그 신을 만나고, 그 신의 무기와 대표 패시브를 갖는다. 빈 칸이면 끼우고, 무기 칸이 찼으면 두 갈래 카드
 * - 신이 깨어남(수호자): 그 신의 남은 힘을 모두 갖는다 (빈 칸이 있으면 끼움, 없으면 가진 힘으로만). 궁극기 칸이 찼으면 두 갈래 카드
 * - 유물표에 유물이 켜짐: 그 유물 힘을 갖는다 (빈 칸이 있으면 끼움). 조각 2에 함께 오는 그 신의 유물이 이 길로 온다
 * 저장을 읽을 때 깨운 신의 힘을 합치는 것(`mergePowers`)도 같은 다리의 일부다
 */
export class PowerBridge {
  constructor(
    private readonly ctx: GameContext,
    private readonly host: BridgeHost,
  ) {
    ctx.bus.on('fragment', ({ god, piece }) => {
      if (piece === 2) this.traceWon(god)
      // 조각 3 (수호자): 힘은 깨어날 때(`mythOpened`) 이미 받았다. 궁극기 칸이 다른 신의 것이면 바꿀지 묻는다
      if (piece === 3) this.offer(god, 'heart')
    })
    ctx.bus.on('mythOpened', ({ god, quiet }) => this.awakened(god, quiet ?? false))
  }

  /** 흔적의 무리를 이겼다: 무기와 대표 패시브. 무기 칸이 비었으면(맨손) 저절로 쥔다: 동작이 바뀌는 순간 */
  private traceWon(god: God): void {
    const { mythPowers } = this.ctx
    mythPowers.meet(god)
    const lend = lendPower(god)
    if (lend) mythPowers.gain(lend)
    mythPowers.gain(weaponId(god))
    this.host.syncPowers()
    this.offer(god, 'hand')
  }

  /**
   * 신이 깨어났다: 남은 힘을 모두. 궁극기 칸이 비어 있었으면 첫 신이다: 깨어나는 장면과 「신이 깨어남」 카드.
   * 그 뒤의 신은 칸에 들어간 것이 있을 때만 카드로 알린다 (장 보스·개발 지름길로 한꺼번에 열린 신은 조용히)
   */
  private awakened(god: God, quiet: boolean): void {
    const { mythPowers, bus, progress } = this.ctx
    const first = mythPowers.slots.ultimate === null
    const before = mythPowers.slotted.length
    mythPowers.meet(god)
    for (const p of godPowers(god)) mythPowers.gain(p.id)
    this.host.syncPowers()
    if (first) this.host.announce(god)
    else if (!quiet && mythPowers.slotted.length > before) {
      const def = godDef(god)
      bus.emit('moment', {
        id: 'mythLent',
        card: { kind: '빌린 힘', title: def.name, color: def.color, icon: classIcon(def.name), lines: [lendText(god, progress.level(god)), `${josa(relicDef(def.relic).name, '이')} 깨어난다`] },
      })
    }
  }

  /** 유물표에 유물이 켜졌다: 그 유물 힘을 갖는다 */
  relicLit(id: RelicId): void {
    if (this.ctx.mythPowers.gain(relicPowerId(id))) this.host.syncPowers()
  }

  /**
   * 새 신의 무기·궁극기가 왔다 (E302-03의 두 갈래 카드를 칸에 대해): 칸이 비었으면 끼우고, 다른 신의 것이 있으면 바꿀지 묻는다.
   * 카드는 순간의 줄에 세운다: 그 신의 장면과 큰 카드가 지나간 뒤에 뜬다 (바로 띄우면 신이 말을 걸기도 전에 고르라고 한다)
   */
  private offer(god: God, part: 'hand' | 'heart'): void {
    const { mythPowers, bus } = this.ctx
    const kind = part === 'hand' ? 'weapon' : 'ultimate'
    const id: PowerId = part === 'hand' ? weaponId(god) : ultimateId(god)
    const holder = () => {
      const now = mythPowers.slots[kind]
      return now ? (power(now)?.god ?? null) : null
    }
    if (!mythPowers.has(id) || holder() === god) return
    if (!holder()) {
      if (mythPowers.slot(id)) this.host.syncPowers()
      return
    }
    bus.emit('moment', {
      id: 'swapOffer',
      after: () => {
        // 기다리는 동안 칸이 바뀌었으면 지금 칸으로 묻는다 (이미 그 신의 것이면 묻지 않는다)
        const now = holder()
        if (!now || now === god) return
        this.host.offerSwap?.(part, god, now, (take) => {
          if (take && mythPowers.slot(id)) this.host.syncPowers()
        })
      },
    })
  }
}
