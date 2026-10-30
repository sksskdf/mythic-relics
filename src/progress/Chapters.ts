import { CHAPTERS, type ChapterDef, type ChapterStep, chapterOf, conquestsOf, TOP_POWER } from '../data/chapters'
import { REGIONS } from '../data/regions'

/** 장 진행이 게임에서 읽는 것 (신화·장비는 따로 저장되니 여기서는 묻기만 한다) */
export interface ChapterWorld {
  /** 그 신화권에서 깨운(연) 신의 수 (E238) */
  awakened(realm: string): number
  /** 가진 유물 가운데 가장 높은 단계 (없으면 0) */
  forged(): number
  /** 귀환한 횟수 (E304) */
  returns(): number
}

export interface ChapterData {
  /** 들어서 본 땅 */
  entered: string[]
  /** 보스를 이긴 땅 */
  bosses: string[]
}

/**
 * 장 진행 (E22-01, TIMELINE.md 4·7장).
 * - 지금 장: 마지막 할 일을 아직 못 한 첫 장. 지난 장의 땅과 들어서 본 땅이 열려 있다 (마을은 늘)
 * - 지금 장의 땅은 할 일 차례로 열린다 (E236-01): 그 땅에 들어서는 할 일 바로 앞까지 했을 때.
 *   요툰헤임은 첫 신을 깨운 뒤, 우트가르드는 두 번째 신과 2단계 전설 뒤 (준비가 되기 전에 거인 왕을 만나지 않게)
 * - 지금 목표: 지금 장에서 아직 못 한 첫 할 일. 뒤의 할 일을 먼저 했으면 앞의 것은 지나간 것으로 친다
 * - 엔딩 뒤에는 모든 땅이 열리고 목표가 없다
 */
export class ChapterProgress {
  readonly entered = new Set<string>()
  readonly bosses = new Set<string>()

  constructor(
    private readonly world: ChapterWorld,
    private readonly afterEnding: () => boolean = () => false,
    readonly chapters: readonly ChapterDef[] = CHAPTERS,
  ) {}

  /** 그 할 일을 했나 */
  done(step: ChapterStep): boolean {
    const { world } = this
    switch (step.kind) {
      case 'enter':
        return this.entered.has(step.region)
      case 'awaken':
        return world.awakened(step.realm!) >= step.n!
      case 'boss':
        return this.bosses.has(step.region)
      case 'forge':
        return world.forged() >= step.n!
      case 'return':
        return world.returns() >= step.n!
    }
  }

  /** 정복한 장의 수 (E305-02): 장 정복 보스(거인 왕·키마이라) 가운데 이긴 수. 엔딩 뒤 신화권 보스는 세지 않는다 */
  get conquered(): number {
    return conquestsOf(this.chapters).filter((r) => this.bosses.has(r)).length
  }

  /** 끝낸 장의 수 (지금 장의 차례). 모두 끝냈으면 장의 수 */
  get index(): number {
    const i = this.chapters.findIndex((c) => !this.done(c.steps.at(-1)!))
    return i < 0 ? this.chapters.length : i
  }

  /** 지금 장 (모두 끝냈으면 null) */
  get chapter(): ChapterDef | null {
    return this.chapters[this.index] ?? null
  }

  /** 지금 목표 (엔딩 뒤이거나 모두 끝냈으면 null) */
  get goal(): ChapterStep | null {
    const chapter = this.chapter
    if (!chapter || this.afterEnding()) return null
    return chapter.steps[this.lastDone(chapter) + 1] ?? null
  }

  /** 그 장에서 한 마지막 할 일의 차례 (하나도 안 했으면 -1). 뒤의 것을 했으면 앞의 것은 지나간 것으로 친다 */
  private lastDone(chapter: ChapterDef): number {
    let last = -1
    chapter.steps.forEach((s, i) => this.done(s) && (last = i))
    return last
  }

  /** 마지막 장의 마지막 할 일까지 했나 (엔딩) */
  get finished(): boolean {
    return this.index >= this.chapters.length
  }

  /** 그 땅에 들어갈 수 있나 (막힌 땅은 통로 입구에 결계) */
  isOpen(region: string): boolean {
    if (this.afterEnding() || REGIONS[region]?.kind === 'hub' || this.entered.has(region)) return true
    const at = this.chapters.findIndex((c) => region in c.lands)
    if (at < 0 || at > this.index) return false
    if (at < this.index) return true
    const chapter = this.chapters[at]!
    const enter = chapter.steps.findIndex((s) => s.kind === 'enter' && s.region === region)
    return enter <= 0 || this.lastDone(chapter) >= enter - 1
  }

  /** 그 땅 보통 적의 세기 (처음 땅 = 1). 장 흐름 밖의 들판(엔딩 뒤)은 가장 센 땅만큼, 끝없는 원정·마을은 1 (끝없는 원정은 층이 세기를 정한다) */
  power(region: string): number {
    const chapter = chapterOf(region, this.chapters)
    if (chapter) return chapter.lands[region]!
    return REGIONS[region]?.kind === 'field' ? TOP_POWER : 1
  }

  /** 그 땅의 단계 (장비 단계). 장 흐름에 없는 땅은 null (신화권 단계를 쓴다) */
  tier(region: string): number | null {
    return chapterOf(region, this.chapters)?.tier ?? null
  }

  /** 땅에 들어섰다. 처음이면 true */
  enter(region: string): boolean {
    if (this.entered.has(region)) return false
    this.entered.add(region)
    return true
  }

  /** 땅의 보스를 이겼다. 처음이면 true */
  bossDefeated(region: string): boolean {
    if (this.bosses.has(region)) return false
    this.bosses.add(region)
    return true
  }

  toData(): ChapterData {
    return { entered: [...this.entered], bosses: [...this.bosses] }
  }

  load(data: ChapterData): void {
    for (const id of data.entered) this.entered.add(id)
    for (const id of data.bosses) this.bosses.add(id)
  }
}

/** 저장된 장 진행을 검사한다. 모르는 땅은 버린다 */
export function parseChapterData(raw: unknown): ChapterData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((id): id is string => typeof id === 'string' && Object.hasOwn(REGIONS, id)))] : [])
  return { entered: ids(o.entered), bosses: ids(o.bosses).filter((id) => REGIONS[id]!.boss !== null) }
}
