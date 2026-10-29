import type { Giant } from './Giant'
import { ELITES } from './elite'

/** 몬스터 등급 (E12-09): 보통 · 정예(종류) · 보스 */
export type GradeKind = 'normal' | 'elite' | 'boss'

export interface Grade {
  kind: GradeKind
  /** 이름표에 붙는 꼬리표 (보통·정예·사나움·보스) */
  label: string
  /** 꼬리표 색: 디자인 토큰 이름 (`theme.css`) */
  tone: string
}

/** 이 몬스터의 등급. 보스는 지역 보스·전설 보스, 정예는 무리에서 가끔 나오는 강한 놈 */
export function gradeOf(giant: Pick<Giant, 'spec' | 'elite'>): Grade {
  if (giant.spec.role === 'boss' || giant.spec.boss) return { kind: 'boss', label: '보스', tone: 'var(--c-gold)' }
  // 수호자 (E239-03): 보스만큼 크게 보이되 이름표는 따로
  if (giant.spec.role === 'guardian') return { kind: 'boss', label: '수호자', tone: 'var(--c-gold)' }
  if (giant.elite) return { kind: 'elite', label: `정예·${ELITES[giant.elite].name}`, tone: `var(--c-elite-${giant.elite})` }
  return { kind: 'normal', label: '보통', tone: 'var(--c-ink-3)' }
}
