/**
 * 글자로 그린 작은 픽셀 그림을 이미지 주소로 바꾼다. 한 글자가 한 칸이고 '.'은 빈칸이다.
 * HUD 칸에 넣으면 CSS로 확대해 또렷한 픽셀로 보인다.
 */
export function pixelIcon(rows: readonly string[], colors: Readonly<Record<string, string>>): string {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = colors[row[x]!]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x, y, 1, 1)
    }
  })
  return canvas.toDataURL()
}

/** 궁극기 칸의 번개 그림 */
export const BOLT_ICON = {
  rows: [
    '............',
    '......aa....',
    '.....aa.....',
    '....aab.....',
    '...aab......',
    '..aaaaaaa...',
    '.....baa....',
    '....baa.....',
    '...baa......',
    '..baa.......',
    '..ba........',
    '............',
  ],
  colors: { a: '#e9f8ff', b: '#5fc4ff' },
}
