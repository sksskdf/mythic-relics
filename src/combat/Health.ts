/** 생명력 */
export class Health {
  hp: number

  constructor(readonly max: number) {
    this.hp = max
  }

  get dead(): boolean {
    return this.hp <= 0
  }

  get ratio(): number {
    return Math.max(0, this.hp / this.max)
  }

  /** 피해를 입힌다. 실제로 깎인 양을 돌려준다. */
  damage(amount: number): number {
    if (this.dead || amount <= 0) return 0
    const dealt = Math.min(this.hp, amount)
    this.hp -= dealt
    return dealt
  }

  heal(amount: number): void {
    this.hp = Math.min(this.max, this.hp + amount)
  }

  reset(): void {
    this.hp = this.max
  }
}
