/** 큰 수를 짧게: 999 → 999, 12_340 → 1.2만, 3_400_000 → 340만, 1.2억 */
export function shortNumber(value: number): string {
  const n = Math.floor(value)
  if (n < 10_000) return String(n)
  if (n < 100_000_000) {
    const man = n / 10_000
    return `${man < 100 ? man.toFixed(1).replace(/\.0$/, '') : Math.floor(man)}만`
  }
  const eok = n / 100_000_000
  return `${eok < 100 ? eok.toFixed(1).replace(/\.0$/, '') : Math.floor(eok)}억`
}
