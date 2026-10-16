/** 생명력 */
export class Health {
  hp: number

  constructor(public max: number) {
    this.hp = max
  }

  /** 최대 생명력을 바꾼다. 늘어난 만큼 지금 생명력도 함께 는다. */
  setMax(max: number): void {
    const gained = max - this.max
    this.max = max
    this.hp = Math.min(max, Math.max(0, this.hp + Math.max(0, gained)))
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
