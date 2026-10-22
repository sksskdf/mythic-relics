export type RoadmapStatus = 'todo' | 'doing' | 'done'

export type RoadmapItem = { id: number; title: string; status: RoadmapStatus }

/** 패널에서 보고 있는 탭과 펼친 마일스톤 */
export type RoadmapView = { tab: 'plan' | 'items'; open: string | null }

/** 마일스톤별 직접 플레이 체크리스트 표시 (마일스톤 ID → 항목별 완료 여부) */
export type RoadmapChecks = Record<string, boolean[]>

declare module 'claude-code' {
  interface PluginState {
    roadmap: {
      items: RoadmapItem[]
      view: RoadmapView
      checks: RoadmapChecks
      /** ROADMAP.md를 다시 읽을 때마다 오르는 번호 (패널을 다시 그리게 한다) */
      docVersion: number
    }
  }
}
