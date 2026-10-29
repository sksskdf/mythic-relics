# 성장·진행 시스템 지도 (2026-10-29, main a9f6063 기준)

## 0. 힘이 모이는 곳

모든 힘은 `src/build/BuildState.ts`의 `computeBuild` 한 곳으로 모인다. 재료는 `src/build/Build.ts`의 `inputs()`가 모으고, 지문(`fingerprint`)을 보고 앞 계산을 다시 쓴다.

```
피해 = damageScale × (1 + stats[출처별]) × 원천 연속처치배율 × (1 + bossDamage, 정예·보스만) × 유물효과 STAGE_DAMAGE
damageScale = 1.35^(승급 합) × (1 + stats.damage + 열린신화수×0.04) × 주신.passive.damageScale
maxHp = (100 + 열린신화수×5 + stats.maxHp) × (1 + 승급합×0.25 + stats.maxHpPct) × 시련배율
stats[k] = Σ 일반장비 + Σ 유물기본수치 + 수련 + 시련보상 + 균열축복 + 성좌판 별 (모두 같은 종류끼리 더함)
적 = 땅 세기(hp ×P, 피해 ×P^0.55) × 위협 1.2^n/1.1^n × (균열 1.12^층/1.06^층) × 시련 난이도
```

곱셈 층은 사실상 넷뿐이다: 승급 ×1.35, 주신 배율, 유물 단계, 원천 연속 처치. 나머지는 모두 한 주머니(`stats`)에 더해진다.

## 1. 시스템 표

| 시스템 | 무엇이 힘을 주나 (공식·배율) | 언제 열리나 | 어디서 계산 | 저장 키 | 의존 |
|---|---|---|---|---|---|
| **수련** (깨달음·마디) | 마디 22개(뿌리 1 + 힘·몸·손 7씩). 모두 `stats`에 덧셈(예: 날 선 칼 basicDamage +0.12, 큰 마디 거인 사냥꾼 bossDamage +0.3·basicDamage +0.1). 깨달음 k번째 문턱 = 60+25(k−1). 되돌리기 무료 | 처음부터(첫 깨달음에 탭이 열림) | `src/data/training.ts`(`TRAINING_NODES`, `insightsAt`), `src/progress/Training.ts`, 경험치는 `Progression.gainMastery` → `training.gain`, 빌드는 `Build.blessed()` | `training {xp, taken[]}` (v11) | 경험치(처치), `masteryGain` 수치, 빌드 `stats` |
| **신의 조각 셋** (흔적·사냥·수호자) | 조각 1: 그 신의 대표 패시브(`lentPassive`, 1단계)를 칸 없이 빌림(`Build.waking`·`passives()`). 조각 2: 그 땅에서 30을 잡으면 신화 유물 1단계를 받고 깨어남(`Loadout.waking`). 조각 3: 수호자를 이기면 `progress.open`(신화 1단계) | 장 데이터의 awaken 할 일. 한 번에 한 신, 깨운 신 수 < 주신 단계일 때만(`canWakeMore`). 데모는 북유럽 넷뿐 | `src/data/awaken.ts`, `src/progress/Awakening.ts`(`AwakenProgress`), `src/game/systems/Awakening.ts`(456줄) | `awaken {waking, fragments, hunt}` (v13) | 신화 진행(open), 신위 칸, 장 흐름(`ChapterWorld.awakened`), 땅·적(`enemies.json` 역할 guardian), 장면·순간 |
| **신위 칸** (주신·빌린 힘) | 주신: 무기 모션, 공격 리듬 `passive.attackSpeed`, 궁극기, 패시브 전부, `passive.damageScale`. 빌린 신: `gods.json`의 `lend` 부품 하나를 그 신의 단계로 쓰고, 그 신의 유물이 깨어남. 경험치는 주신이 다, 빌린 신은 ×0.5 | 칸 수 = 1 + (깨운 신 ≥ 2) + 이긴 장 보스(utgard·lycia), 넷까지. 바꾸기는 마을·성소에서(엔딩 뒤 편의 `quickChoose`면 어디서나) | `src/myth/slots.ts`(`slotCount`, `lentPassive`, `withMain/withLent`), `src/game/systems/Relics.ts` 66~105행, `RelicPowers.lend` | `chosen: God[]` (v12, 첫째가 주신) | 신화 진행, 유물 깨어남(`relicAwake`), Damage(`build.passives()`), 장 진행(보스) |
| **신화 개방 단계와 전설** | 승급 1회마다 모든 피해 ×1.35, 생명 +25%. **모든 신의 (단계−1) 합**으로 센다(`promotions`). 단계마다 패시브 부품의 `minLevel`이 풀림(`levelGains`). 수집 보너스: 열린 신화마다 피해 +4%·생명 +5 | 1단계 = 깨우기(북유럽) 또는 올림포스 성소에서 고름(그리스 `choose`), 키마이라가 그리스 나머지를 엶. 2→3단계는 경험치(1500/3000)를 채우고 장이 정한 성소의 전설을 깸. 데모는 3단계까지, 4단계는 엔딩 뒤 | `src/myth/ClassProgress.ts`(`PER_PROMOTION`, `PER_OPENED`, `levelCap`, `promote`), `src/game/systems/Progression.ts`(`readyKind`, `promote`), `src/game/Legend.ts`, `src/game/systems/MythChoice.ts` | `classes {god: {level, xp}}` | 경험치, 성소·장 흐름, Ending(4단계), 신위 칸(전설은 주신만) |
| **신화 경험치** | 처치 경험치 × (1 + masteryGain). `masteryShares`: 주신 다, 빌린 신 절반. 주신이 없으면 그 신화권 신 모두에게(600에서 멈춤). 같은 양이 수련에도 쌓임 | 처음부터 | `ClassProgress.addXp`, `masteryShares`, `Progression.gainMastery` | `classes[*].xp` | 정예 배율 `ELITE_REWARD.xp`, 오딘·수련 「배움」 |
| **장비** (칸 7·등급·단계) | 등급(보통/좋음/희귀/영웅): 수치 1/2/3/4개, 배율 ×1/1.3/1.7/2.2. 단계 배율 1.4^(t−1). 원천 +1~+3은 따로. 영웅은 고유 효과 12종 가운데 하나(**카드에 글만 있고 돌지 않음**) | 처음부터. 드랍은 졸개 6%·정예 25%·보스 100%(희귀 이상) × 땅 자리(입구 1·깊은 땅 1.2·보스 1.4) × 위협 1.08^n | `src/gear/roll.ts`(`rollGear`, `tierScale`), `src/gear/Loadout.ts`, `src/gear/Pickups.ts`, 드랍은 `Progression.onGiantKilled`, 표는 `src/data/gear.json` | `slots[7]`, `bag[]`, `gear[]`, `ground[]` | 장 단계(`chapters.tier`), 위협 등급 확률(`threatGrades`), 원천 각성 |
| **유물** (단계·깨어남) | 신화 유물 21개: 기본 수치 셋(영웅 등급 가운데 값 × 단계 배율), 원천 +2/3/4/5, 지속 효과(`passive.modifiers`, 곱셈)와 행동(`trigger`)은 **그 신이 칸에 있을 때만** 깨어남. 주신이면 효과 단계 +1, 단계별 피해 배율 [1, 1.3, 1.65, 2.1, 2.6] | 조각 2에 1단계. 데모는 2단계까지, 3·4단계는 엔딩 뒤. 재료 유물 41개는 엔딩 뒤에만 떨어짐 | `src/gear/mythRelic.ts`(`relicStats`, `relicAwake`, `effectScale`, `relicTier`), `src/game/RelicPowers.ts`, `src/skills/` | `stages {relic: 2~4}`, `dropMisses` | 신위 칸, 대장간, 원천, Ending |
| **대장간·재료** | 제작법은 규칙으로 정함: 단계 s = (그 신의 장 + s − 1)번째 장 보스 재료 ×1 + 그 장 재료 ×10/15/20/30. 분해하면 신화권 재료 1/2/4/8 | 마을 대장간. 종장 할 일이 「유물 2단계」 | `src/gear/forge.ts`(`recipeFor`, `craft`, `salvage`), `src/gear/materials.ts`(`rollMaterials`: 졸개 25%·정예 +2·보스 +3, 위협이 높으면 +1) | `materials {id: n}` | 장 보스, 위협, 유물 단계, 장 흐름(`forged`) |
| **원천과 각성** | 원천 넷(불꽃·사냥·바람·바위). 합 5/10/20에 각성 1~3단계. 동작을 바꾸는 효과(폭발, 처치 가속, 걷기 충전, 보호막). 곱셈은 사냥 3단계 연속 처치(+4%×10겹)와 바람 충전뿐 | 장비를 끼면 바로. 첫 각성에 탭이 열림 | `src/data/awakening.ts`(`AWAKEN_AT`, `AWAKENING`), `computeBuild`의 sources·awakening, `src/skills/SourceAwakening.ts` | 저장하지 않음(장비에서 다시 셈) | 장비·유물 원천 수치, 균열 축복(`awakenBonus`) |
| **장 흐름** (장·땅 세기·결계) | 땅 세기 P: 적 생명 ×P, 피해 ×P^0.55(미드가르드 1 → 하늘 17). 장 단계 = 장비 단계 | 서장 → 제1장(북유럽: 깨우기·전설 2·두 번째 신·거인 왕) → 제2장(그리스: 고르기·전설 3·키마이라) → 종장(대장간 2·우트가르드의 왕). 땅은 할 일 차례로 열림, 결계로 막음 | `src/data/chapters.json`·`chapters.ts`(`landScale`), `src/progress/Chapters.ts`(`done`, `goal`, `isOpen`), `src/game/systems/Chapters.ts`, `src/world/Barriers.ts`, `Encounter.landPower` | `chapters {entered[], bosses[]}` (v10) | 신화(깨운 수·단계), 유물(forged), 보스, 슬롯 수 |
| **위협 단계** | 적 생명 1.2^(n−1)·피해 1.1^(n−1), 정예 +3%p, 등급 몫 ×1.25^n, 재료 +10%p, 장비 드랍 ×1.08^n. 10단계에서 보스 다섯 → 한계를 깸(99까지) | 엔딩 뒤 | `src/data/threat.ts`, `src/progress/Threat.ts`, `src/game/systems/Threat.ts` | `threat {level, unlocked, reached, cleared, limitBroken}` | Ending, 보스, 드랍, 균열 |
| **편의 자동화** | 자동 줍기(주운 20), 자동 분해(분해 10), 재료 자동 모음(첫 제작), 신화 빠르게 바꾸기(신화 넷). 워프는 처음부터 | 엔딩 뒤(세기는 그 전에도 쌓임, 엔딩에 `catchUp`) | `src/progress/Conveniences.ts` | `conveniences {counters, open, autoSalvage, visited}` | Ending, 줍기·분해·대장간·신화 수 |
| **시련** | 여덟 개 × 난이도 5. 깬 가장 높은 난이도 × 보상(`stats`에 덧셈). 마일스톤 4·12·24(보상 ×1.25, 어느 성소에서나 전설, 균열 +10%) | 엔딩 뒤, 위협 3단계 | `src/data/trials.ts`, `src/progress/Trials.ts`, `src/game/systems/Trials.ts`, 제약은 `computeBuild`의 rules | `trials {cleared, best}` (v7) | 전설 판(Legend), 위협, 균열 배율 |
| **균열** | 1층 = 위협 5단계, 층마다 ×1.12/×1.06. 층마다 임시 축복 셋 중 하나(수치 덧셈 또는 원천 각성 +1). 나가면 사라짐(안쪽 리셋) | 엔딩 뒤, 한계를 깬 뒤 | `src/data/rift.ts`, `src/progress/Rift.ts`, `src/game/systems/Rift.ts`, `src/world/riftFloor.ts` | `rift {best, stars, lit[]}` (축복은 저장하지 않음) | 위협, 시련 배율, 성좌판 |
| **성좌판** | 별 = 처음 닿은 5층마다 하나·종말 보스 둘. 밝힌 별의 신화가 `always.stat`을 냄(단계 + 별 + 유물, 3단계 v[0] / 4단계 v[1] / 5단계 ×1.5). 이웃한 별만 밝힘 | 엔딩 뒤 | `src/data/rift.ts`(`STARS`), `computeBuild`의 starred·`statAt`·`alwaysStage` | `rift.lit` | 균열, 신화 단계, 유물 착용 |
| **정보 화면 탭 차례** | 힘 없음. 상태 탭은 처음부터, 장비(첫 장비) → 수련(첫 깨달음) → 지도(첫 성소) → 원천(첫 각성) → 신화(첫 신화) → 외형(신화 유물) | 사건이 생길 때. 시련·균열 탭은 Ending | `src/progress/Tabs.ts`, `src/game/systems/Tabs.ts` | `tabs[]` (v11) | 위 모든 시스템의 사실 |
| **엔딩 문** | 한 곳에서 엶: 위협·시련·균열·편의·신화 4단계·유물 3·4단계·유물 드랍 | 갈라진 하늘의 왕을 이기면 | `src/progress/Ending.ts`(`AFTER_ENDING`) | `ending: bool` (v9) | 위 엔딩 뒤 장치 전부 |
| 기타 저장 | 신위 게이지 `divine`(궁극기, `PlayerCombat.addDivine`, 오르는 양은 ultCharge 수치), `looks`, `body`, `region`, `scenes` | | `src/save/SaveData.ts`(v13, v1~v12 옮김) | `version` = 13 | |

## 2. 의존 그림

```
처치(Encounter/Giant) ──xp──▶ gainMastery ─┬─▶ 수련 깨달음 ─▶ 마디 ─┐
   │                                       └─▶ 신화 xp(주신 1, 빌린 신 0.5) ─▶ 전설(성소·장) ─▶ 승급 합 ×1.35^n ─┐
   ├─재료(신화권·보스)─▶ 대장간 ─▶ 유물 단계 ─────────────────────────────────────────────┐            │
   ├─장비 드랍(땅 자리·장 단계·위협)─▶ 칸 7 ─┬─ stats 덧셈 ──────────────────────┐        │            │
   │                                         └─ 원천 합 ─▶ 각성 0~3 ─▶ SourceAwakening │        │            │
   └─흔적·사냥·수호자(Awakening)─▶ 깨운 신 ─▶ ClassProgress.open ─▶ 수집 보너스 ─────┤        │            │
                                     │        └─▶ 신위 칸(slotCount ← 장 보스) ─▶ 주신: 무기·리듬·궁극기·패시브·배율
                                     │                                      └▶ 빌린 신: lend 패시브, 유물 깨어남(relicAwake)
                                     └─ 조각 2 ─▶ 유물 1단계 + Loadout.waking
                                                                            ▼
                          computeBuild (BuildState) ◀── 시련 보상·균열 축복·성좌판 별 (엔딩 뒤)
                                                                            ▼
                                Damage.scale / targetScale ── 적: landScale × threatScale × riftScale × 시련
장 흐름(Chapters) ◀── awakened·level·forged·bosses ──▶ 땅 차례·결계·땅 세기·장비 단계
Ending ──▶ Threat·Conveniences·Trials·Rift·4단계·유물 3·4단계·유물 드랍·탭 모두 열기
```

## 3. 겹치거나 같은 일을 하는 것

1. **수치 주머니 다섯이 같은 `stats`에 더해진다.** 장비 수치, 수련 마디, 시련 보상, 균열 축복, 성좌판 별. 수련 마디와 균열 축복은 이름까지 같은 것이 열두 개다(분노·날 선 칼·하늘의 분노·무리의 힘·거인 사냥꾼·빠른 손·바람의 발·넓은 손길·굳센 몸·샘물·사냥의 잔치·방패·신의 숨). 층이 달라도 효과는 같은 덧셈이라 곱셈 층으로 느껴지지 않는다.
2. **인접 해금 판이 둘이다.** 수련 트리(앞 마디)와 성좌판(이웃한 별). 같은 원리를 쓰는 장치가 엔딩 앞과 뒤에 따로 있다.
3. **"각성"이라는 이름이 둘이다.** 원천 각성(`src/data/awakening.ts`, `SourceAwakening`, `computeBuild.awakening`)과 신 깨우기(`src/data/awaken.ts`, `progress/Awakening.ts`, `systems/Awakening.ts`). 파일 이름도 `awaken.ts`와 `awakening.ts`로 겨우 갈린다.
4. **"신위"가 둘이다.** 신위 칸(`chosen`)과 신위 게이지(`divine`, 궁극기). **"축복·가호"도 둘이다.** `LoadoutState.blessings`(가호, 상태 탭에 표시만 하고 효과 없음)와 균열 축복.
5. **고른 신화가 두 곳에 있다.** `ClassProgress.chosen[]`(저장되는 신위 칸)과 `Loadout.chosen`·`Loadout.borrowed`(`RelicPowers.lend`·`choose`로 따라 맞춤). `Build.inputs`는 앞의 것을, `RelicPowers.relicAwake`·`effectScale`은 뒤의 것을 읽는다.
6. **유물 깨어남 판정이 둘이다.** `computeBuild`의 `lent`(빌린 신 + 깨우는 신)와 `RelicPowers.awakeBorrowed`. 같은 규칙을 두 곳에서 다시 짠다.
7. **신화를 여는 길이 넷이다.** 조각 셋(북유럽), 성소에서 고르기(`MythChoice`, 그리스), 장 보스가 신화권을 통째로 엶(`opens`, 키마이라), 유물로 엶(`relicsOpenMyths`, 점검용·엔딩 뒤). MYTHBUILD 6장은 고르기와 통째로 열기를 "없앰"으로 적었는데, 그리스에는 아직 남아 있다.
8. **유물 단계와 신 단계가 같은 일을 한다.** 둘 다 "그 신의 힘을 한 단계 위로"이고, 주신이면 유물 효과 단계 +1, 성좌판은 별 +1. 단계 덧셈이 세 군데서 따로 일어난다(`effectStage`, `alwaysStage`, `levelCap`).
9. **세기 배율 층이 셋이다.** 땅 세기(`landScale`), 위협(`threatScale`), 균열(`riftScale`). 모두 생명·피해를 곱하는 같은 모양이고 `Encounter`에서 겹친다.
10. **장비 단계를 정하는 길이 셋이다.** 장 단계(`chapters.tier`), 신화권 단계(`landTier`), 유물 단계(`relicTier`).

## 4. 데모에서 거의 안 쓰이거나 죽은 것

- **영웅 고유 효과 12종**(`gear.json` uniques): 굴리고 카드에 보여 주기만 하고 효과가 돌지 않는다(handoff 할 일 4).
- **장비 수치 `dropChance`**: 유물 드랍(엔딩 뒤)에만 쓰인다(`Progression.ts` 112행). 일반 장비 드랍 확률에는 들어가지 않아 데모에서는 효과 없는 수치가 굴러 나온다.
- **주신이 없을 때 신화권 신들에게 쌓이는 경험치**(`masteryShares`의 realm 분기, `MASTERY_TO_OPEN` 600): 북유럽은 깨우기로 열고 `open()`이 xp를 0으로 지운다. 데모에서 이 경험치는 그리스 고르기에만 의미가 있다. MYTHBUILD는 "600 막대 없앰"으로 적었다.
- **`LoadoutState.blessings` 가호, `Loadout.preview`의 신화 판정**: 효과 없이 표시만 한다(`statusTab.ts` 54행, `Game.ts` 1231행).
- **`legacyManifest`·`hiddenUnlocked`·`MANIFEST_COUNT`**: 저장 옮기기와 히든 신화(아수라왕, 유물 셋)에만 쓰인다. 재료 유물은 엔딩 뒤에만 떨어져서 데모에서는 아수라왕을 열 수 없다.
- **`mythAlways` 신화마다의 수치(`always.stat`)**: 성좌판에서만 돈다. 21신화 데이터가 데모에서는 쓰이지 않는다.
- **편의 셈 `'threat'`**: `CONVENIENCES`에 이 세기를 쓰는 항목이 없다(워프가 쓰던 자리). `Threat.ts` 53행은 세기만 한다.
- **`DropTable`·`dropMisses`·재료 유물 41개·`DEFAULT_DROPS`**: 엔딩 뒤에만 쓰인다.
- **글이 낡은 곳**: `src/ui/menu/statusTab.ts` 78행 「개방 단계가 오를 때마다 +5%」. 실제는 ×1.35다.
- **원천 숙련·갈래·공명**: E21-05에서 없앴다. RI의 "프로모트 갈래" 자리가 지금은 빈칸이다(`REDESIGN.md` 10.3의 "넣음"과 다르다).
- **성능 후보**: `Build.state`는 피해마다 여러 번 불리고, 부를 때마다 `fingerprint`가 30여 값을 다시 적으며 신화 기록을 Map으로 돈다. 장비·칸을 바꿀 때 올리는 판(版) 번호 하나로 바꿀 수 있다. `Build.passives()`도 맞을 때마다 배열을 새로 만든다.

## 5. 엔딩 뒤로 숨긴 것 (`src/progress/Ending.ts`의 `AFTER_ENDING`)

위협 단계와 한계를 깸, 시련(8 × 5), 균열과 축복, 성좌판, 편의 4종(워프만 처음부터), 신화 4단계, 유물 3·4단계(×20·×30 재료), 땅에 떨어지는 유물(재료 유물 41개, 아수라왕 열쇠), 중국·일본·한국 세 신화권의 땅 열둘과 신화 열둘, 유물로 신화 열기(`relicsOpenMyths`). RI의 층 장치(도전·자동화·인접판·상한 깨기·안쪽 리셋)는 **모두 엔딩 뒤에 몰려 있다.** 그래서 90분 데모 안에는 순환 층이 하나도 없다.

## 6. 순환(리셋·곱셈 층)으로 재편할 때의 자리 후보

| RI 층 | 하는 일 | 들어갈 후보 (지금 시스템) | 바꿀 것 |
|---|---|---|---|
| 원과 바퀴 (맨 안쪽) | 단순 반복, 바퀴마다 색 배율이 곱으로 | 처치 → 경험치 → 깨달음(수련) | 갈래 셋(힘·몸·손)을 "색"으로 보고 갈래마다 곱셈 배율을 준다. 덧셈 마디는 줄인다 |
| 승천 (원 하나의 상한) | 상한에 닿으면 그 원만 되돌리고 상한 +10 | **신 단계와 전설**(신 하나의 상한), **유물 단계**(대장간) | 전설을 "그 신의 상한 깨기"로 둔다. 신 단계를 넘으면 그 신의 빌린 힘이 곱으로 커진다 |
| 프레스티지 (점수 리셋, 전체 배율) | 원·점수를 지우고 P.Mult | **원정 한 바퀴**: 마을 → 북유럽 → 장 보스. 장비·땅 세기·수련 깨달음이 지워지고 신의 힘은 남는다 | 지금 `PER_PROMOTION` ×1.35를 "원정을 마칠 때 받는 배율"로 옮긴다. 장 흐름 데이터가 한 바퀴의 틀이 된다 |
| 프로모트 (갈래에 몰아 넣기) | 쌓인 것을 네 갈래 하나에 | **원천 넷**: 원정을 리셋할 때 그동안의 기록을 원천 하나에 붓는다(E21-05에서 없앤 원천 숙련을 되살림) | 각성 문턱 5/10/20에 영구 몫을 더한다. 넷째 갈래 "공명" 후보 |
| 인피니티 생성기 (G3→G2→G1) | 위 단이 아래 단을 만든다 | **신위 칸**: 주신이 빌린 신을, 빌린 신이 유물을 키우는 사슬 | 지금은 빌린 신이 xp ×0.5만 받는다. 칸 차례마다 아래 칸 배율을 곱하는 사슬로 바꾼다 |
| 도전 | 제약 + 영구 보상 + 기록 | **시련**(그대로) | 데모 안으로 당긴다(예: 원정 2회째에 하나) |
| 동물원 (인접 해금 판) | 옆 칸만 산다 | **수련 트리 + 성좌판을 하나로** | 둘을 합쳐 "신의 별자리" 판 하나로 만든다. 리셋 때 남는 판 |
| 횟수 마일스톤·자동화 | 반복할수록 손일이 자동 | **편의 자동화**(세기 그대로) | 엔딩 문 대신 원정 횟수로 연다 |
| 상한 깨기 | 수의 끝을 깸 | **한계를 깸**, 데모 상한(신 3단계·유물 2단계) | 상한을 원정 횟수 마일스톤에 묶는다 |
| 안쪽 리셋 | 판 안에서만 쓰는 임시 강화 | **균열**(축복) | 그대로 두되 데모의 "원정" 축복과 같은 표를 쓴다(수련과 같은 이름 열둘을 하나로) |
| 템빨용사식 조합 | 같은·다른 아이템을 합쳐 위로 | **대장간·분해·재료** + 일반 장비 | 장비 둘 → 한 등급 위(보통→좋음→희귀→영웅→유물 조각). 영웅 고유 효과를 조합의 끝 보상으로 살린다 |
| 고정 클래스 발현 개편 | (사용자 결정) | 주신이 무기·리듬·궁극기·패시브·배율을 통째로 정함 | `lentPassive`가 이미 부품 하나씩 빌린다. **무기 모션은 무기 칸 유물이, 궁극기는 칸 하나가, 패시브는 부품 칸이** 정하도록 쪼갠다. 그러면 "주신"은 배율과 모습만 남는다 |

**재편 때 먼저 손볼 코드:** `computeBuild`를 덧셈 주머니 하나에서 층 목록(층마다 곱셈)으로 바꾸고, `ClassProgress.chosen`과 `Loadout.chosen`을 하나로 합치고, 이름(각성 둘·신위 둘·축복 둘)을 정리하고, `Build` 지문을 판 번호로 바꾸고, `Ending` 문을 원정 횟수 마일스톤으로 옮긴다. 저장은 v14가 필요하다(원정 횟수·갈래·판 키를 더하고, `training`·`rift.lit`을 합친다).

**참고 파일:** /home/user/game/src/build/BuildState.ts, /home/user/game/src/build/Build.ts, /home/user/game/src/myth/ClassProgress.ts, /home/user/game/src/myth/slots.ts, /home/user/game/src/data/training.ts, /home/user/game/src/data/awaken.ts, /home/user/game/src/gear/mythRelic.ts, /home/user/game/src/gear/roll.ts, /home/user/game/src/gear/forge.ts, /home/user/game/src/data/awakening.ts, /home/user/game/src/data/chapters.json, /home/user/game/src/progress/Ending.ts, /home/user/game/src/progress/Conveniences.ts, /home/user/game/src/data/rift.ts, /home/user/game/src/data/trials.ts, /home/user/game/src/save/SaveData.ts, /home/user/game/src/game/systems/Progression.ts, /home/user/game/src/ui/menu/statusTab.ts