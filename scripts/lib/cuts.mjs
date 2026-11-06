// 잘린 요소 세기 (E235, ui-sheet·power-curve --shots가 함께 쓴다): page.evaluate(findCuts)로 페이지 안에서 돌린다

/**
 * 잘린 요소 (페이지 안에서 돈다): 보이는 HUD·정보 화면 요소 가운데, 가장 가까운 잘라 내는 조상(overflow hidden)이나
 * 화면 밖으로 가로나 세로가 나간 것. 밀어 볼 수 있는 상자(overflow auto·scroll) 안은 뺀다
 */
export function findCuts() {
  const out = []
  for (const el of document.querySelectorAll('.hud *, .menu *, .minimap, .menu-button')) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    // 가로·세로마다: 잘라 내는 가장 가까운 상자(없으면 화면) 밖으로 나갔나. 스크롤 상자 안은 굴려 볼 수 있으니 세지 않는다
    const cut = (axis) => {
      const prop = axis === 'x' ? 'overflowX' : 'overflowY'
      let clip = null
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p)[prop] !== 'visible') {
          clip = p
          break
        }
      }
      if (clip && ['auto', 'scroll'].includes(getComputedStyle(clip)[prop])) return false
      const box = clip ? clip.getBoundingClientRect() : { left: 0, right: innerWidth, top: 0, bottom: innerHeight }
      return axis === 'x' ? r.left < box.left - 1 || r.right > box.right + 1 : r.top < box.top - 1 || r.bottom > box.bottom + 1
    }
    const x = cut('x')
    if (x || cut('y')) out.push(`${x ? '가로' : '세로'} ${el.className || el.tagName}: ${(el.textContent ?? '').trim().slice(0, 16)}`)
  }
  return out
}
