/**
 * 데이터 검사 도구: 값의 형식을 확인하고, 틀리면 어느 값이 왜 틀렸는지 알려 주며 실패한다.
 * schema.ts(유물·신·적)와 classKit.ts(클래스 부품)가 함께 쓴다. 다른 모듈에 기대지 않는다.
 */

export class DataError extends Error {
  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'DataError'
  }
}

export type Obj = Record<string, unknown>

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function obj(value: unknown, path: string): Obj {
  if (!isObj(value)) throw new DataError(path, '객체여야 합니다')
  return value
}

/** 모르는 키가 있으면 실패한다. (오타로 값이 무시되는 일을 막는다) */
export function onlyKeys(o: Obj, path: string, allowed: readonly string[]): void {
  for (const key of Object.keys(o)) {
    if (!allowed.includes(key)) throw new DataError(`${path}.${key}`, `모르는 항목입니다 (쓸 수 있는 것: ${allowed.join(', ')})`)
  }
}

export function num(o: Obj, key: string, path: string, range: { min?: number; max?: number } = {}): number {
  const value = o[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new DataError(`${path}.${key}`, '숫자여야 합니다')
  if (range.min !== undefined && value < range.min) throw new DataError(`${path}.${key}`, `${range.min} 이상이어야 합니다`)
  if (range.max !== undefined && value > range.max) throw new DataError(`${path}.${key}`, `${range.max} 이하여야 합니다`)
  return value
}

export function optNum(o: Obj, key: string, path: string, range: { min?: number; max?: number } = {}): number | undefined {
  return o[key] === undefined ? undefined : num(o, key, path, range)
}

export function str(o: Obj, key: string, path: string): string {
  const value = o[key]
  if (typeof value !== 'string' || value.trim() === '') throw new DataError(`${path}.${key}`, '비어 있지 않은 글자여야 합니다')
  return value
}

export function oneOf<T extends string>(o: Obj, key: string, path: string, values: readonly T[]): T {
  const value = str(o, key, path)
  if (!(values as readonly string[]).includes(value)) throw new DataError(`${path}.${key}`, `${values.join(', ')} 중 하나여야 합니다 ("${value}")`)
  return value as T
}

export function color(o: Obj, key: string, path: string): string {
  const value = str(o, key, path)
  if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new DataError(`${path}.${key}`, `#rrggbb 꼴의 색이어야 합니다 ("${value}")`)
  return value
}

export function bool(o: Obj, key: string, path: string): boolean {
  const value = o[key] ?? false
  if (typeof value !== 'boolean') throw new DataError(`${path}.${key}`, 'true나 false여야 합니다')
  return value
}

export function list(o: Obj, key: string, path: string): unknown[] {
  const value = o[key]
  if (!Array.isArray(value)) throw new DataError(`${path}.${key}`, '목록이어야 합니다')
  return value
}

/** 키가 곧 id인 표. id는 영문·숫자만 쓴다. */
export function table(raw: unknown, path: string): [string, Obj][] {
  const o = obj(raw, path)
  return Object.entries(o).map(([id, value]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(id)) throw new DataError(`${path}.${id}`, 'id는 영문자로 시작하는 영문·숫자여야 합니다')
    return [id, obj(value, `${path}.${id}`)]
  })
}

/** 레벨마다 다른 수: 숫자 하나면 네 레벨 모두 같고, [Lv1, Lv2, Lv3, Lv4] 네 개를 쓸 수도 있다 */
export type Leveled = readonly [number, number, number, number]

export function leveled(o: Obj, key: string, path: string, range: { min?: number; max?: number } = {}): Leveled {
  const value = o[key]
  if (typeof value === 'number') {
    const n = num(o, key, path, range)
    return [n, n, n, n]
  }
  if (!Array.isArray(value) || value.length !== 4) throw new DataError(`${path}.${key}`, '숫자 하나나 [Lv1, Lv2, Lv3, Lv4] 네 개여야 합니다')
  return value.map((_, i) => num(value as unknown as Obj, String(i), `${path}.${key}`, range)) as unknown as Leveled
}

/** 그 레벨의 값 (1~4) */
export const atLevel = (v: Leveled, level: number): number => v[Math.max(0, Math.min(3, level - 1))]!
