import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseSave, SAVE_VERSION, saveStorage, UNREAD_KEEP, unreadReason } from '../src/save/SaveData'
import { type SlotCard, unreadLine } from '../src/ui/TitleScreen'
import FULL from './fixtures/save-v17-full.json?raw'

/**
 * 읽지 못한 저장 (E307 0B, 리뷰 `save-1`): 더 새 버전이 쓴 저장이나 깨진 글이 든 슬롯은
 * 원본을 옆 키에 남기고, 처음 화면에 빈 칸과 가려 보이며, 그 칸에서 새 판을 시작해도 원본이 남는다
 */
const SLOT0 = 'mythic-relics/save/0'
/** 다음 버전이 쓴 저장 (지금 판은 읽지 못한다) */
const newer = (extra: Record<string, unknown> = {}): string => JSON.stringify({ ...JSON.parse(FULL), version: SAVE_VERSION + 1, patrons: ['thor'], ...extra })
const NEWER_KEY = `${SLOT0}:unread-v${SAVE_VERSION + 1}`

describe('읽지 못한 저장', () => {
  let store: Map<string, string>
  /** 이 키들에는 쓰지 못한다 (저장소가 찼을 때를 흉내) */
  let refuse: (key: string) => boolean
  const before = (globalThis as { localStorage?: unknown }).localStorage
  const backups = () => [...store.keys()].filter((k) => k.endsWith('.bak')).sort()

  beforeEach(() => {
    store = new Map()
    refuse = () => false
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        if (refuse(k)) throw new Error('QuotaExceededError')
        store.set(k, v)
      },
      removeItem: (k: string) => void store.delete(k),
    }
    saveStorage.slot = -1
  })
  afterEach(() => {
    ;(globalThis as { localStorage?: unknown }).localStorage = before
    saveStorage.slot = -1
  })

  it('까닭: 버전이 지금보다 높으면 더 새 버전의 저장, 나머지(JSON이 아님·버전이 없거나 이상함)는 깨진 글', () => {
    expect(unreadReason(newer())).toBe('newer')
    expect(unreadReason(JSON.stringify({ version: 99 }))).toBe('newer')
    for (const text of ['{깨진', '', 'null', '[]', '"글"', '{}', '{"version":"18"}', '{"version":0}', '{"version":-3}', '{"version":17.5}', FULL.slice(0, 400)]) {
      expect(unreadReason(text), text.slice(0, 20)).toBe('broken')
      // 읽지 못하는 글이어야 까닭을 묻는다
      expect(parseSave(text), text.slice(0, 20)).toBeNull()
    }
  })

  it('더 새 버전의 저장: 읽지 않고(null), 원본을 `…:unread-vN.bak`에 남기고, 슬롯의 글은 건드리지 않는다', () => {
    const text = newer()
    store.set(SLOT0, text)
    expect(saveStorage.load(0)).toBeNull()
    expect(saveStorage.unread(0)).toEqual({ unread: 'newer', kept: true })
    expect(backups()).toEqual([`${NEWER_KEY}.bak`])
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(text)
    expect(store.get(SLOT0)).toBe(text)
  })

  it('깨진 글: 원본을 `…:unread-broken.bak`에 남긴다 (잘린 저장도 글자 그대로)', () => {
    const text = FULL.slice(0, 400)
    store.set(SLOT0, text)
    expect(saveStorage.load(0)).toBeNull()
    expect(saveStorage.unread(0)).toEqual({ unread: 'broken', kept: true })
    expect(backups()).toEqual([`${SLOT0}:unread-broken.bak`])
    expect(store.get(`${SLOT0}:unread-broken.bak`)).toBe(text)
  })

  it('빈 슬롯과 읽히는 저장은 읽지 못한 저장이 아니고, 남기는 것도 없다', () => {
    expect(saveStorage.unread(0)).toBeNull()
    expect(saveStorage.load(0)).toBeNull()
    store.set(SLOT0, FULL)
    expect(saveStorage.unread(0)).toBeNull()
    expect(saveStorage.load(0)).toEqual(JSON.parse(FULL))
    expect(backups()).toEqual([])
    // 슬롯마다 따로 본다
    store.set('mythic-relics/save/2', '{깨진')
    expect([0, 1, 2].map((i) => saveStorage.unread(i)?.unread ?? null)).toEqual([null, null, 'broken'])
  })

  it('그 칸에서 새 판을 시작해도(슬롯을 고르고 저장) 원본은 남는다: 슬롯을 읽지 않고 바로 골라도', () => {
    const text = newer()
    store.set(SLOT0, text)
    // 처음 화면을 거치지 않는 길(마지막 슬롯으로 바로 시작)도 슬롯을 고르는 때에 남긴다
    saveStorage.use(0)
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(text)
    expect(saveStorage.save(parseSave(JSON.stringify({ version: SAVE_VERSION }))!)).toBe(true)
    // 슬롯은 새 판이 되고, 원본은 옆 키에 그대로
    expect(saveStorage.load(0)).not.toBeNull()
    expect(saveStorage.unread(0)).toBeNull()
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(text)
    // 슬롯을 지워도(처음 화면의 지우기) 남긴 원본은 지우지 않는다
    saveStorage.clear(0)
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(text)
  })

  it('열어 둔 옛 탭: 슬롯을 고른 뒤에 다른 탭(더 새 빌드)이 읽지 못할 저장을 써 두어도 덮기 전에 남긴다', () => {
    const mine = parseSave(JSON.stringify({ version: SAVE_VERSION }))!
    store.set(SLOT0, FULL)
    saveStorage.use(0)
    expect(saveStorage.save(mine)).toBe(true)
    expect(backups()).toEqual([])
    // 그 사이에 다른 탭이 이 슬롯을 다음 버전으로 올려 썼다
    const theirs = newer()
    store.set(SLOT0, theirs)
    expect(saveStorage.save(mine)).toBe(true)
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(theirs)
    expect(saveStorage.unread(0)).toBeNull()
    // 내가 쓴 글 그대로면 견줘 보기만 하고 다시 검사하지 않는다 (슬롯을 한 번만 읽는다. 검사하면 두 번)
    let reads = 0
    const storage = (globalThis as unknown as { localStorage: { getItem(k: string): string | null } }).localStorage
    const getItem = storage.getItem
    storage.getItem = (k) => (k === SLOT0 && (reads += 1), getItem(k))
    saveStorage.save(mine)
    expect(reads).toBe(1)
    store.set(SLOT0, theirs)
    saveStorage.save(mine)
    expect(reads).toBe(3)
  })

  it('같은 글은 한 번만 남기고, 다른 원본이 또 오면 먼저 남긴 것을 덮지 않고 다음 칸에 남긴다', () => {
    const first = newer({ dropMisses: 1 })
    store.set(SLOT0, first)
    for (let i = 0; i < 3; i++) saveStorage.load(0)
    saveStorage.unread(0)
    expect(backups()).toEqual([`${NEWER_KEY}.bak`])
    // 새 판으로 덮인 뒤 더 새 버전이 다시 쓴 다른 저장
    const second = newer({ dropMisses: 2 })
    store.set(SLOT0, second)
    expect(saveStorage.unread(0)).toEqual({ unread: 'newer', kept: true })
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(first)
    expect(store.get(`${NEWER_KEY}.2.bak`)).toBe(second)
    // 먼저 남긴 글이 다시 와도 새로 남기지 않는다
    store.set(SLOT0, first)
    saveStorage.load(0)
    expect(backups()).toHaveLength(2)
  })

  it(`남기는 수는 슬롯·까닭마다 ${UNREAD_KEEP}개까지: 넘치면 끝 칸만 새것으로 바꾸고 앞의 것은 지킨다`, () => {
    const texts = Array.from({ length: UNREAD_KEEP + 2 }, (_, i) => newer({ dropMisses: i + 1 }))
    for (const text of texts) {
      store.set(SLOT0, text)
      expect(saveStorage.unread(0)?.kept).toBe(true)
    }
    expect(backups()).toHaveLength(UNREAD_KEEP)
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(texts[0])
    expect(store.get(`${NEWER_KEY}.2.bak`)).toBe(texts[1])
    expect(store.get(`${NEWER_KEY}.${UNREAD_KEEP}.bak`)).toBe(texts.at(-1))
    // 깨진 글은 따로 센다 (깨진 글이 더 새 버전의 원본을 밀어내지 않는다)
    store.set(SLOT0, '{깨진')
    saveStorage.load(0)
    expect(backups()).toHaveLength(UNREAD_KEEP + 1)
    expect(store.get(`${NEWER_KEY}.bak`)).toBe(texts[0])
  })

  it('옮기기 백업(`…:vN.bak`)과 이름이 겹치지 않는다: 옛 버전을 옮길 때 남기는 원본은 그대로 한 번 남는다', () => {
    store.set(SLOT0, newer())
    saveStorage.load(0)
    expect(store.has(`${SLOT0}:v${SAVE_VERSION + 1}.bak`)).toBe(false)
    const old = JSON.stringify({ version: 12, slots: [], bag: [] })
    store.set(SLOT0, old)
    expect(saveStorage.load(0)).not.toBeNull()
    expect(saveStorage.unread(0)).toBeNull()
    expect(store.get(`${SLOT0}:v12.bak`)).toBe(old)
    expect(backups()).toEqual([`${NEWER_KEY}.bak`, `${SLOT0}:v12.bak`].sort())
  })

  it('원본을 남기지 못해도(저장소가 참) 게임은 뜨고, 남기지 못했다고 알린다', () => {
    store.set(SLOT0, newer())
    refuse = (key) => key.endsWith('.bak')
    expect(() => saveStorage.use(0)).not.toThrow()
    expect(saveStorage.load(0)).toBeNull()
    expect(saveStorage.unread(0)).toEqual({ unread: 'newer', kept: false })
    expect(backups()).toEqual([])
  })

  it('처음 화면의 한 줄: 무엇이 들어 있는지와 원본이 남았는지 (남기지 못했으면 남겼다고 하지 않는다)', () => {
    store.set(SLOT0, newer())
    store.set('mythic-relics/save/1', '{깨진')
    // 슬롯 카드가 받는 모양 그대로 (`main.ts`: 요약이 없으면 `saveStorage.unread`)
    const cards: SlotCard[] = [0, 1, 2].map((i) => saveStorage.unread(i))
    expect(cards.map((c) => (c && 'unread' in c ? unreadLine(c) : null))).toEqual(['더 새 버전의 저장 · 원본은 남겨 둠', '깨진 저장 · 원본은 남겨 둠', null])
    expect(unreadLine({ unread: 'newer', kept: false })).toBe('더 새 버전의 저장 · 공간이 모자라 이 칸은 저장되지 않음')
    expect(unreadLine({ unread: 'broken', kept: false })).toBe('깨진 저장 · 공간이 모자라 이 칸은 저장되지 않음')
  })

  it('원본을 남기지 못한 칸은 새 판이 덮지 않는다: 저장이 실패로 돌아오고 슬롯의 글은 그대로다', () => {
    store.set(SLOT0, newer())
    refuse = (key) => key.endsWith('.bak')
    saveStorage.use(0)
    const fresh = parseSave(JSON.stringify({ version: SAVE_VERSION }))!
    expect(saveStorage.save(fresh)).toBe(false)
    expect(store.get(SLOT0)).toBe(newer())
    // 공간이 생겨 원본을 남길 수 있게 되면 그때는 남기고 덮는다
    refuse = () => false
    expect(saveStorage.save(fresh)).toBe(true)
    expect(backups().length).toBe(1)
    expect(store.get(SLOT0)).not.toBe(newer())
  })

  it('저장소를 아예 못 쓰면(사생활 보호 모드) 빈 슬롯처럼 조용히 넘어간다', () => {
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
      removeItem: () => {
        throw new Error('SecurityError')
      },
    }
    expect(() => saveStorage.use(1)).not.toThrow()
    expect(saveStorage.load(1)).toBeNull()
    expect(saveStorage.unread(1)).toBeNull()
  })
})
