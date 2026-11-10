import { REGIONS } from '../../src/data/regions'
import type { GameContext } from '../../src/game/context'
import { EventBus, type GameEvents } from '../../src/game/events'
import { Persistence } from '../../src/game/systems/Persistence'
import { DropTable } from '../../src/gear/DropTable'
import { Loadout } from '../../src/gear/Loadout'
import { isMythRelic } from '../../src/gear/mythRelic'
import type { GearItem } from '../../src/gear/roll'
import { Wardrobe } from '../../src/looks/outfit'
import { ClassProgress } from '../../src/myth/ClassProgress'
import { breathSlots, fitBreath } from '../../src/myth/pantheon'
import { AutomationProgress } from '../../src/progress/Automation'
import { ChapterProgress } from '../../src/progress/Chapters'
import { DepthProgress } from '../../src/progress/Depth'
import { Ending } from '../../src/progress/Ending'
import { EndlessProgress } from '../../src/progress/Endless'
import { ExpeditionProgress } from '../../src/progress/Expedition'
import { MountProgress } from '../../src/progress/Mount'
import { OathProgress } from '../../src/progress/Oaths'
import { TabUnlocks } from '../../src/progress/Tabs'
import { TrainingProgress } from '../../src/progress/Training'
import { WakeProgress } from '../../src/progress/Wake'
import { Waypoints } from '../../src/progress/Waypoints'
import { type God, godDef } from '../../src/relics/data'
import type { SaveData } from '../../src/save/SaveData'

/**
 * 저장 왕복 시험대 (E307 0B): 게임을 띄우지 않고 진짜 `Persistence`(불러오기 `restore` → 저장 `snapshot`)를
 * 진짜 기록 클래스들(신·자리·장비·수련·원정·맹세·장 진행 …)로 돌린다. 조립은 `Game.ts`의 필드 선언을 따른다.
 * 흉내 내는 것은 화면이 필요한 셋(땅의 물건·주인공·전투)과 다른 시스템에 맡기는 일(`RestoreHost`)뿐이다:
 * - 끼우기: `RelicPowers.equip`처럼 `Loadout.equip`으로 (유물은 유물표, 장비는 그 부위의 빈 칸이나 가방)
 * - 자리 셋: `Relics.restore`처럼 열린 신만(손은 조각 2를 모은 깨우는 신도), 숨은 지금 숨 칸 수까지
 * 엔딩 뒤에 유물이 닫힌 신을 여는 일(`Relics.unlock`)과 막힌 자리의 물건 옮기기(`World.settleLoaded`)는 하지 않는다.
 * `Game` 생성자가 불러온 뒤 바로잡는 셋도 여기서는 보지 못한다: 서 있는 땅을 들어선 땅에 더함,
 * 엔딩 뒤 판은 탭을 모두 엶(빠진 탭도 사실대로 엶), 마지막 보스를 이긴 판은 엔딩을 켬
 */
export function throughGame(data: SaveData): SaveData {
  const loadout = new Loadout()
  const ending = new Ending()
  const progress: ClassProgress = new ClassProgress(
    () => ending.has('mythStage4'),
    (): number => chapters.conquered,
  )
  const oaths = new OathProgress()
  const mount = new MountProgress()
  const expedition: ExpeditionProgress = Object.assign(new ExpeditionProgress(), {
    conquests: (): number => chapters.conquered,
    automation: () => automation.now,
    oathScale: (): number => oaths.renownScale(),
  })
  const automation = new AutomationProgress(
    () => expedition.returns,
    () => ending.has('autoPickup'),
  )
  const chapters: ChapterProgress = new ChapterProgress(
    {
      awakened: (realm) => progress.opened.filter((god) => godDef(god).realm === realm).length,
      forged: () => Math.max(0, ...loadout.ownedRelics.filter(isMythRelic).map((id) => loadout.stage(id))),
      returns: () => expedition.returns,
      mounted: () => mount.owned,
      merged: () => loadout.uniquesSeen.size,
      oathsKept: () => oaths.kept.size,
    },
    () => ending.has('realms'),
  )
  const awaken = new WakeProgress(() => progress.opened.length)
  // 땅의 물건: 자리와 내용만 (모델 없이)
  const ground: { id: string; x: number; z: number; gear?: GearItem }[] = []
  const pickups = { list: ground, drop: (id: string, x: number, z: number, _armed: boolean, gear?: GearItem) => void ground.push({ id, x, z, gear }) }
  // 게임은 저장의 땅에서 시작한다 (없거나 모르는 땅이면 마을의 시작점)
  const region = REGIONS[data.region?.id ?? 'village']!
  const position = { x: region.spawn.x, z: region.spawn.z }
  const ctx = {
    bus: new EventBus<GameEvents>(),
    progress,
    powers: { loadout },
    pickups,
    drops: new DropTable(),
    combat: { heartGauge: 0, health: { reset: () => {} } },
    wardrobe: new Wardrobe(),
    depth: new DepthProgress(),
    automation,
    waypoints: new Waypoints(),
    oaths,
    endless: new EndlessProgress(),
    ending,
    chapters,
    training: new TrainingProgress(),
    expedition,
    tabs: new TabUnlocks(),
    awaken,
    mount,
    map: { region },
    hero: { object: { position }, teleport: (x: number, z: number) => Object.assign(position, { x, z }) },
    scenesSeen: new Set<string>(),
  }
  const persistence = new Persistence(ctx as unknown as GameContext, false)
  persistence.restore(data, {
    equip: (id) => void loadout.equip(id),
    pantheon: (p) => {
      const open = (g: God | null) => (g && progress.isOpen(g) ? g : null)
      const hand = p.hand && awaken.waking === p.hand && awaken.fragments >= 2 ? p.hand : open(p.hand)
      const next = { hand, heart: open(p.heart), breath: p.breath.filter((g) => progress.isOpen(g)) }
      progress.pantheon = fitBreath(next, Math.max(1, breathSlots({ progress, chapters, oaths, ending })))
    },
    applyStats: () => {},
    applyLooks: () => {},
  })
  return persistence.snapshot()
}
