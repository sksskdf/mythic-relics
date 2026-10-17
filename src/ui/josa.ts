/** 마지막 글자에 받침이 있는가 (한글이 아니면 없다고 친다) */
function hasBatchim(word: string): boolean {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code <= 11171 && code % 28 !== 0
}

/** 마지막 글자의 받침이 ㄹ인가 ('으로'가 아니라 '로'를 쓴다) */
function endsWithRieul(word: string): boolean {
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
