// 잘린 요소 세기 (E235, ui-sheet·power-curve --shots가 함께 쓴다): page.evaluate(findCuts)로 페이지 안에서 돌린다.
// 페이지로 넘어가 도는 함수라 바깥 것을 쓰지 못한다 (돕는 함수도 안에 둔다). 규칙마다의 시험은 tests/cuts.test.mjs

/**
 * 잘린 요소 (페이지 안에서 돈다): 보이는 HUD·정보 화면 요소 가운데 아래 셋. 줄머리가 종류다
 * - 「가로」·「세로」: 가장 가까운 잘라 내는 조상(overflow hidden)이나 화면 밖으로 가로나 세로가 나간 것.
 *   밀어 볼 수 있는 상자(overflow auto·scroll) 안은 뺀다
 * - 「밀림」 (E307): 가로로 밀어야 다 보이는데 밀 수 있다는 단서가 없는 상자. 단서는 자리를 차지하는 스크롤 막대나 가장자리를 흐리는
 *   mask-image다. 휴대폰은 막대가 없으니 단서를 따로 그리지 않은 가로 넘침은 모두 걸린다 (한 줄 탭 줄의 여섯째 탭이 이것이었다).
 *   세로로 미는 본문은 흔한 배치라 세지 않는다
 * - 「덮임」 (E307): 누르는 요소(단추·탭)의 가운데를 다른 요소가 덮어 보이지 않거나 눌리지 않는 것 (그 점의 elementFromPoint가
 *   그 요소도 자손도 아니다). 헛짚지 않게 빼는 것: 꺼진 단추와 누름을 받지 않는 것(pointer-events: none), 누름을 받지 않는 장식에
 *   가린 것(elementFromPoint가 건너뛴다), 가운데가 화면 밖이거나 잘라 내는·미는 상자 밖인 것(접어 둔 것, 굴려 넘긴 것: 위 두 규칙의 몫),
 *   다른 창이 위에 열려 가린 것 (정보 화면이 HUD를, 일시 정지가 정보 화면을 덮는 것은 일부러다. 창 목록은 WINDOWS).
 *   뜬 창 안의 글은 누르는 요소가 아니어도 본다: 글자 상자의 한 귀퉁이라도 창 밖의 요소가 덮으면 잡는다 (창은 HUD 위에 뜨는 것이라
 *   창 밖의 것이 그 글을 가리면 잘못이다. 393×659에서 작은 지도가 맹세 출발 카드의 제목 끝 글자를 덮던 것). 창 밖 HUD의 글끼리 겹친 것은
 *   세지 않는다 (세로 화면의 얻은 것 카드는 일부러 작은 지도 자리를 빌린다)
 */
export function findCuts() {
  const out = []
  /** 떠서 아래를 가리는 창: 창이 다르면 덮여도 세지 않는다. 창을 새로 만들면 여기에 더한다 */
  const WINDOWS = '.menu, .pause, .pick-card, .swap-card, .dialog, .title, .rotate-hint, .devpanel'
  /** 누르는 요소 (cursor: pointer는 물려받으니 부모가 pointer면 그 부모의 한 부분이다) */
  const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], input, select, textarea, summary'
  const name = (el) => el.getAttribute('class') || el.tagName
  const label = (el) => `${name(el)}: ${(el.textContent ?? '').trim().slice(0, 16)}`
  const pressable = (el, style) => el.matches(PRESSABLE) || (style.cursor === 'pointer' && (!el.parentElement || getComputedStyle(el.parentElement).cursor !== 'pointer'))
  /** 그 점이 요소의 잘라 내는·미는 조상들 안에 보이는가 */
  const shownAt = (el, x, y) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
      const b = p.getBoundingClientRect()
      if (x < b.left || x > b.right || y < b.top || y > b.bottom) return false
    }
    return true
  }
  /** 덮인 것으로 잡은 요소: 그 안의 글을 또 세지 않는다 */
  const covered = []
  /** 창 안의 글 한 줄(글자 상자)에서 보는 점: 네 귀퉁이와 위아래 가운데 (1px 안쪽) */
  const textPoints = (b) => [b.left + 1, (b.left + b.right) / 2, b.right - 1].flatMap((x) => [[x, b.top + 1], [x, b.bottom - 1]])
  /** 창 안의 글을 덮은 창 밖의 요소 (없으면 null) */
  const coverOfText = (el, win) => {
    for (const node of el.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const b of range.getClientRects()) {
        if (b.width < 2 || b.height < 2) continue
        for (const [x, y] of textPoints(b)) {
          if (x < 0 || x > innerWidth || y < 0 || y > innerHeight || !shownAt(el, x, y)) continue
          const top = document.elementFromPoint(x, y)
          // 같은 창 안의 것(붙박인 머리줄 같은 그 창의 배치)과 다른 창(위에 열린 창)은 세지 않는다
          if (top && !win.contains(top) && !top.contains(win) && !top.closest(WINDOWS)) return top
        }
      }
    }
    return null
  }
  for (const el of document.querySelectorAll('.hud *, .menu *, .minimap, .menu-button')) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const style = getComputedStyle(el)
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
    if (x || cut('y')) out.push(`${x ? '가로' : '세로'} ${label(el)}`)

    // 밀림: 가로로 넘치는 미는 상자에 단서(스크롤 막대·가장자리 흐림)가 없다. 가려진 누르는 요소 수를 함께 적는다
    if (['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 2) {
      const bar = el.offsetHeight - el.clientHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) >= 2
      const fade = (style.maskImage && style.maskImage !== 'none') || (style.webkitMaskImage && style.webkitMaskImage !== 'none')
      if (!bar && !fade) {
        const hidden = [...el.querySelectorAll('*')].filter((c) => {
          const b = c.getBoundingClientRect()
          return b.width >= 2 && pressable(c, getComputedStyle(c)) && (b.left < r.left - 1 || b.right > r.right + 1)
        })
        out.push(`밀림 ${name(el)}: 가로 +${Math.round(el.scrollWidth - el.clientWidth)}px, 단서 없음${hidden.length ? `, 가려진 단추 ${hidden.length} (${(hidden[0].textContent ?? '').trim().slice(0, 8)})` : ''}`)
      }
    }

    // 덮임: 누름을 받지 않는 것은 그 점에 무엇이 있는지 물을 수 없다 (elementFromPoint가 건너뛴다)
    if (style.pointerEvents === 'none') continue
    const win = el.closest(WINDOWS)
    /** 덮은 요소: 누르는 요소는 가운데에 다른 요소가 있나, 창 안의 글은 한 귀퉁이라도 창 밖의 요소가 덮었나 */
    let over = null
    if (!el.disabled && el.getAttribute('aria-disabled') !== 'true' && pressable(el, style)) {
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (cx >= 0 && cx <= innerWidth && cy >= 0 && cy <= innerHeight && shownAt(el, cx, cy)) {
        const top = document.elementFromPoint(cx, cy)
        // 제 조상이 잡히면(제 가운데가 비치는 모양) 가린 것이 없다. 다른 창이 위에 열려 가린 것도 세지 않는다
        const other = top?.closest(WINDOWS)
        if (top && top !== el && !el.contains(top) && !top.contains(el) && (!other || other === win)) over = top
      }
    }
    if (!over && win && !covered.some((c) => c.contains(el))) over = coverOfText(el, win)
    if (!over) continue
    covered.push(el)
    out.push(`덮임 ${label(el)} ← ${name(over)}`)
  }
  return out
}
