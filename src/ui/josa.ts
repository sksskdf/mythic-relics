/** 숫자 끝자리를 읽은 소리에 받침이 있는가 (영·일·삼·육·칠·팔, 0으로 끝나는 십·백·천·만도 받침이 있다) */
const DIGIT_BATCHIM = '013678'
/** 숫자 끝자리를 읽은 소리의 받침이 ㄹ인가 (일·칠·팔) */
const DIGIT_RIEUL = '178'

/** 마지막 글자에 받침이 있는가 (숫자는 읽은 소리로, 한글도 숫자도 아니면 없다고 친다) */
function hasBatchim(word: string): boolean {
  const last = word.at(-1) ?? ''
  if (/\d/.test(last)) return DIGIT_BATCHIM.includes(last)
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 !== 0
}

/** 마지막 글자의 받침이 ㄹ인가 ('으로'가 아니라 '로'를 쓴다) */
function endsWithRieul(word: string): boolean {
  const last = word.at(-1) ?? ''
  if (/\d/.test(last)) return DIGIT_RIEUL.includes(last)
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 === 8
}

/** 조사를 붙인다: 으로/로, 을/를, 이/가, 은/는 */
export function josa(word: string, pair: '으로' | '을' | '이' | '은'): string {
  const batchim = hasBatchim(word)
  switch (pair) {
    case '으로':
      return word + (batchim && !endsWithRieul(word) ? '으로' : '로')
    case '을':
      return word + (batchim ? '을' : '를')
    case '이':
      return word + (batchim ? '이' : '가')
    case '은':
      return word + (batchim ? '은' : '는')
  }
}
