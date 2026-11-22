# P2·P3 리뷰에서 넘길 것 (2026-11-22, P5·P6·P7 작성자가 읽는다)

must 없음. 아래는 뒤 갈래가 함께 고친다.

1. **칸이 찬 뒤 온 유물 힘은 끝까지 잠든다** (Powers.ts `gain`, Relics.ts `place`/`unplace`, PowerBridge `relicLit`). 귀환으로 칸이 늘어도 채우지 않고 끼울 화면이 없다. → P5: 칸 수가 늘 때 가진 도는 힘으로 빈 칸을 채운다. P7 힘 탭이 끼우기·빼기를 맡는다. godsTab.ts의 「숨에 넣으면 … 유물이 깨어난다」「자리에 넣으면 깨어난다」 글은 걷는다.
2. **장 정복·홀로의 맹세가 「숨 칸 +1」을 말하지만 칸이 늘지 않는다** (Relics.ts `fillBreath(){}`, Chapters.ts 장 정복 카드, Oaths.ts, MenuData.ts 잠긴 칸 글). → P6: 보상을 「도는 힘 칸 +1」로 실제로 주거나 카드 줄을 걷는다.
3. **dev.pantheon이 uncapped를 판 끝까지 켠다** (DevTools.ts). 재는 판의 빌드가 플레이어보다 세고 comboLit 카드가 안 뜬다. → 상한은 그 지름길이 끼울 때만 풀고 다시 닫는다, 카드 건너뛰기는 testRun 하나로.
4. **mergePowers가 고르지 않은 흔적을 거저 채운다** (Powers.ts mergePowers, migrate/v18.ts의 waking 갈래). → P5: PowerBridge를 걷으며 v18 저장에서는 mergePowers를 걷고(옮기기는 v17에서만), waking 갈래를 뺀다.
5. **claim/gain이 전투에 맞추지 않는다.** → P5: claim 뒤 반드시 `RelicSystem.syncPowers()`를 부르는 한 곳(gainPower 모양). PowerBridge의 offer와 Wake.settle의 「조각 2 silent」도 다리와 함께 걷는다.

nit: 맹세가 풀릴 때 처음 켜진 조합이 카드 없이 적힘(reapply quiet), Persistence.restore 끝에 refreshStages(), 칸에서 뺀 유물 효과(분신·불꽃 부채·땅 울림 고리)가 그 자리에 굳음 → P7에서 뺄 때 쉬게 하는 동작, 첫 2분에 큰 카드가 연달아 둘(P8 손 QA).
