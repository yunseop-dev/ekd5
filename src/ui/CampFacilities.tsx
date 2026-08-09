// v0.6 막사 시설 — 창고·장비 / 상점 / 능력치 열매 (docs/research/campaign-ux.md 1부 §26·30, equipment.md §1·§2)
// 원작 막사는 "창고 담당 장수 클릭 = 장비 교체", "물자 담당 클릭 = 아이템 매매".
// 걸어다니는 허브 없이 캠페인 허브 위에 전면 오버레이 1장으로 두 기능을 얹는다.
// 거래/장착은 즉시 확정(확인 모달 없음, 원작식) — 상태 저장은 부모(onChange) 책임.
//
// v0.6: 장비는 개체(EquipInstance = itemId + level + exp)다. 표시/미리보기 모두
// 레벨이 반영된 실효 보정(equipInstanceBonus)을 쓰고, 창고 조작은 인덱스 기반이다.

import { useEffect, useMemo, useState } from 'react'
import { equipInstanceBonus } from '../core/battle'
import type { CampaignState, RosterEntry } from '../core/campaign'
import {
  avgRosterLevel,
  buyItem,
  canEquip,
  equipItem,
  sellItem,
  shopTierFor,
  unequipItem,
  // 코어 순수 함수지만 이름이 use* — React Hook 규칙 오탐을 피해 별칭으로 받는다.
  useFruit as applyFruit,
} from '../core/campaign'
import { combatStats, maxHp, maxMp } from '../core/formulas'
import {
  EQUIP_EXP_PER_LEVEL,
  EQUIP_MAX_LEVEL_NORMAL,
  EQUIP_MAX_LEVEL_TREASURE,
  EXP_PER_LEVEL,
} from '../core/types'
import type { EquipInstance, EquipSlot, EquipmentDef, OfficerStats } from '../core/types'
import { CLASSES } from '../data/classes'
import { EQUIPMENT } from '../data/equipment'
import { FRUITS } from '../data/fruits'
import { OFFICERS } from '../data/officers'
import { CLASS_ICON } from './BattleBoard'
// .panel-box/.stat-grid(battle.css), .roster-row/.dim/.title-btn(campaign.css) 재사용
import './battle.css'
import './campaign.css'
import './facilities.css'

// ---------- 장비 정의 읽기 헬퍼 ----------

type StatKey = 'atk' | 'def' | 'mind' | 'agi' | 'morale'
type StatDelta = Partial<Record<StatKey, number>>

const STAT_KEYS: StatKey[] = ['atk', 'def', 'mind', 'agi', 'morale']
const STAT_LABEL: Record<StatKey, string> = {
  atk: '공격',
  def: '방어',
  mind: '정신',
  agi: '순발',
  morale: '사기',
}

/** 장수 원 능력치 키 — 열매가 올리는 값 (RosterEntry.statBonus) */
const OFFICER_STAT_KEYS = ['str', 'ldr', 'int', 'agi', 'luck'] as const
type OfficerStatKey = (typeof OFFICER_STAT_KEYS)[number]
const OFFICER_STAT_LABEL: Record<OfficerStatKey, string> = {
  str: '무력',
  ldr: '통솔',
  int: '지력',
  agi: '민첩',
  luck: '운',
}
/** 코어 FruitDef.stat 이 장수 능력치 키든 부대 능력치 키든 라벨을 찾게 둔다 */
const FRUIT_STAT_LABEL: Record<string, string> = {
  str: '무력',
  ldr: '통솔',
  int: '지력',
  agi: '민첩',
  luck: '운',
  atk: '공격',
  def: '방어',
  mind: '정신',
  morale: '사기',
  exp: '경험치',
}
const fruitStatLabel = (stat: string): string => FRUIT_STAT_LABEL[stat] ?? stat

const SLOTS: EquipSlot[] = ['weapon', 'armor', 'accessory']
const SLOT_LABEL: Record<EquipSlot, string> = { weapon: '무기', armor: '방어구', accessory: '보조' }
const SLOT_ICON: Record<EquipSlot, string> = { weapon: '武', armor: '甲', accessory: '珍' }

const defBonus = (def: EquipmentDef): StatDelta => def.bonus
/** null = 비매품(보물) */
const priceOf = (def: EquipmentDef): number | null => def.price
const moveBonusOf = (def: EquipmentDef): number => def.moveBonus ?? 0
const expMultiplierOf = (def: EquipmentDef): number => def.expMultiplier ?? 1
const isTreasure = (def: EquipmentDef): boolean => def.isTreasure === true

function defOf(itemId: string | null | undefined): EquipmentDef | null {
  if (!itemId) return null
  return EQUIPMENT[itemId] ?? null
}

/** 개체 → 정의. 미등록 id 내성 */
function defOfInstance(inst: EquipInstance | null | undefined): EquipmentDef | null {
  return inst ? defOf(inst.itemId) : null
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`.replace('-', '−'))

// ---------- 장비 개체(레벨/EXP) ----------

const maxLevelOf = (def: EquipmentDef): number =>
  isTreasure(def) ? EQUIP_MAX_LEVEL_TREASURE : EQUIP_MAX_LEVEL_NORMAL

const isMaxLevel = (inst: EquipInstance, def: EquipmentDef): boolean => inst.level >= maxLevelOf(def)

/** 레벨이 반영된 실효 능력치 보정 — 계산 규칙은 코어(battle.equipInstanceBonus) 단일 출처 */
const instanceBonus = (inst: EquipInstance): StatDelta => equipInstanceBonus(inst) as StatDelta

const expPercent = (inst: EquipInstance): number =>
  Math.max(0, Math.min(100, Math.round((inst.exp / EQUIP_EXP_PER_LEVEL) * 100)))

/** "의천검 Lv2" + 작은 EXP 바 (만렙은 MAX 뱃지) */
function EquipTag({
  inst,
  def,
  showMeter = true,
}: {
  inst: EquipInstance
  def: EquipmentDef
  showMeter?: boolean
}) {
  const max = isMaxLevel(inst, def)
  return (
    <span className="fac-equip-tag">
      <span className="fac-item-name">{def.name}</span>
      <strong className="fac-lv">Lv{inst.level}</strong>
      {showMeter &&
        (max ? (
          <span className="fac-max" title={`최대 레벨 (Lv${maxLevelOf(def)})`}>
            MAX
          </span>
        ) : (
          <span className="fac-exp" title={`EXP ${inst.exp}/${EQUIP_EXP_PER_LEVEL}`}>
            <span style={{ width: `${expPercent(inst)}%` }} />
          </span>
        ))}
    </span>
  )
}

/** 개체 툴팁 본문 — "EXP 30/100 · 설명" */
function instanceTitle(inst: EquipInstance, def: EquipmentDef): string {
  const head = isMaxLevel(inst, def) ? `Lv${inst.level} MAX` : `Lv${inst.level} · EXP ${inst.exp}/${EQUIP_EXP_PER_LEVEL}`
  return `${def.name} (${head})\n${def.description}`
}

/** "공격 +16 · 이동 +1 · 경험치 ×1.5" — 개체 레벨 반영 실효치 */
function instanceEffectText(inst: EquipInstance, def: EquipmentDef): string {
  return formatEffect(instanceBonus(inst), moveBonusOf(def), expMultiplierOf(def))
}

/** 상점 진열(미보유 = Lv1 기준)용 */
function effectText(def: EquipmentDef): string {
  return formatEffect(defBonus(def), moveBonusOf(def), expMultiplierOf(def))
}

function formatEffect(bonus: StatDelta, move: number, exp: number): string {
  const parts: string[] = []
  for (const k of STAT_KEYS) {
    const v = bonus[k]
    if (v) parts.push(`${STAT_LABEL[k]} ${signed(v)}`)
  }
  if (move) parts.push(`이동 ${signed(move)}`)
  if (exp !== 1) parts.push(`경험치 ×${exp}`)
  return parts.length > 0 ? parts.join(' · ') : '효과 없음'
}

/** 착용 가능 병과 요약 — "기병 전용" / "군주·중보병" / "전 병과" */
function classesLabel(def: EquipmentDef): string {
  if (!def.classes) return '전 병과'
  const names = def.classes.map((id) => CLASSES[id]?.name ?? id)
  return names.length === 1 ? `${names[0]} 전용` : names.join('·')
}

// ---------- 로스터 장비 합산 ----------

interface EquippedRow {
  slot: EquipSlot
  inst: EquipInstance
  def: EquipmentDef
}

function equippedRows(entry: RosterEntry): EquippedRow[] {
  const out: EquippedRow[] = []
  for (const slot of SLOTS) {
    const inst = entry.equipment?.[slot]
    const def = defOfInstance(inst)
    if (inst && def) out.push({ slot, inst, def })
  }
  return out
}

interface EquipTotals {
  stats: StatDelta
  move: number
  expMultiplier: number
}

function equipTotals(entry: RosterEntry): EquipTotals {
  const stats: StatDelta = {}
  let move = 0
  let expMultiplier = 1
  for (const { inst, def } of equippedRows(entry)) {
    const bonus = instanceBonus(inst)
    for (const k of STAT_KEYS) {
      if (bonus[k]) stats[k] = (stats[k] ?? 0) + (bonus[k] ?? 0)
    }
    move += moveBonusOf(def)
    expMultiplier *= expMultiplierOf(def)
  }
  return { stats, move, expMultiplier }
}

/** 장착 시 순증감 — 같은 슬롯에 이미 낀 장비(개체 레벨 포함)를 교체하는 경우까지 반영 */
function previewDelta(entry: RosterEntry, next: EquipInstance, nextDef: EquipmentDef): EquipTotals {
  const curInst = entry.equipment?.[nextDef.slot]
  const curDef = defOfInstance(curInst)
  const nextBonus = instanceBonus(next)
  const curBonus = curInst && curDef ? instanceBonus(curInst) : {}
  const stats: StatDelta = {}
  for (const k of STAT_KEYS) {
    const d = (nextBonus[k] ?? 0) - (curBonus[k] ?? 0)
    if (d !== 0) stats[k] = d
  }
  return {
    stats,
    move: moveBonusOf(nextDef) - (curDef ? moveBonusOf(curDef) : 0),
    expMultiplier: expMultiplierOf(nextDef) / (curDef ? expMultiplierOf(curDef) : 1),
  }
}

const deltaScore = (d: EquipTotals): number =>
  STAT_KEYS.reduce((n, k) => n + (d.stats[k] ?? 0), 0) + d.move * 3 + (d.expMultiplier - 1) * 20

function DeltaChips({ delta }: { delta: EquipTotals }) {
  const chips: Array<{ text: string; up: boolean }> = []
  for (const k of STAT_KEYS) {
    const v = delta.stats[k]
    if (v) chips.push({ text: `${STAT_LABEL[k]} ${signed(v)}`, up: v > 0 })
  }
  if (delta.move) chips.push({ text: `이동 ${signed(delta.move)}`, up: delta.move > 0 })
  if (delta.expMultiplier !== 1) {
    chips.push({ text: `경험치 ×${Math.round(delta.expMultiplier * 100) / 100}`, up: delta.expMultiplier > 1 })
  }
  if (chips.length === 0) return <span className="fac-chip flat">변화 없음</span>
  return (
    <>
      {chips.map((c) => (
        <span key={c.text} className={`fac-chip ${c.up ? 'up' : 'down'}`}>
          {c.text}
        </span>
      ))}
    </>
  )
}

// ---------- 창고 행 ----------

interface InvRow {
  index: number
  inst: EquipInstance
  def: EquipmentDef
}

function inventoryRows(campaign: CampaignState): InvRow[] {
  return campaign.inventory
    .map((inst, index) => ({ index, inst, def: defOfInstance(inst) }))
    .filter((r): r is InvRow => r.def !== null)
}

// ---------- 열매 ----------

/**
 * 사용 결과 미리보기 — 코어 useFruit 를 그대로 돌려 차분한다.
 * 증가량 상수(+2 / 경험 +50)를 UI가 몰라도 정확하고, 사용 불가(반환값 === campaign)도 같이 판정된다.
 */
function fruitPreview(
  campaign: CampaignState,
  officerId: string,
  fruitIndex: number,
): { usable: boolean; text: string } {
  const fruitId = campaign.fruits[fruitIndex]
  const def = FRUITS[fruitId]
  const next = applyFruit(campaign, officerId, fruitIndex)
  const usable = next !== campaign
  let text = def ? fruitStatLabel(String(def.stat)) : '?'
  if (usable) {
    const before = campaign.roster.find((r) => r.officerId === officerId)
    const after = next.roster.find((r) => r.officerId === officerId)
    const beforeBonus: Partial<OfficerStats> = before?.statBonus ?? {}
    const afterBonus: Partial<OfficerStats> = after?.statBonus ?? {}
    let matched = false
    for (const k of OFFICER_STAT_KEYS) {
      const d = (afterBonus[k] ?? 0) - (beforeBonus[k] ?? 0)
      if (d !== 0) {
        text = `${OFFICER_STAT_LABEL[k]} ${signed(d)}`
        matched = true
        break
      }
    }
    // 경험의 열매 — 능력치가 아니라 부대 경험치/레벨이 오른다
    if (!matched && before && after) {
      const levelUp = after.level - before.level
      const gained = Math.max(0, levelUp * EXP_PER_LEVEL + (after.exp - before.exp))
      if (gained > 0 || levelUp > 0) {
        text = `경험치 +${gained}${levelUp > 0 ? ` (Lv${after.level})` : ''}`
      }
    }
  }
  return { usable, text }
}

/** 판매 결과 미리보기 — 코어 sellItem 을 그대로 돌려 금전/열매 획득을 차분한다 */
function sellPreview(
  campaign: CampaignState,
  index: number,
): { ok: boolean; gold: number; fruitName: string | null } {
  const next = sellItem(campaign, index)
  if (next === campaign) return { ok: false, gold: 0, fruitName: null }
  const counts = new Map<string, number>()
  for (const f of campaign.fruits) counts.set(f, (counts.get(f) ?? 0) + 1)
  let gained: string | null = null
  for (const f of next.fruits) {
    const left = counts.get(f) ?? 0
    if (left === 0) {
      gained = f
      break
    }
    counts.set(f, left - 1)
  }
  return {
    ok: true,
    gold: next.gold - campaign.gold,
    fruitName: gained ? (FRUITS[gained]?.name ?? gained) : null,
  }
}

// ---------- 창고·장비 탭 ----------

interface TabProps {
  campaign: CampaignState
  onChange: (next: CampaignState) => void
}

function StorageTab({ campaign, onChange }: TabProps) {
  const [selectedId, setSelectedId] = useState<string>(campaign.roster[0]?.officerId ?? '')
  const selected = campaign.roster.find((r) => r.officerId === selectedId) ?? campaign.roster[0] ?? null

  const inventory = useMemo(() => {
    const rows = inventoryRows(campaign)
    if (!selected) return rows
    // 착용 가능(빈 슬롯 → 상승 교체품 → 나머지) → 병과 불가 순
    const rank = (row: InvRow): number => {
      if (!canEquip(selected.officerId, row.inst.itemId)) return 3
      if (!selected.equipment?.[row.def.slot]) return 0
      return deltaScore(previewDelta(selected, row.inst, row.def)) > 0 ? 1 : 2
    }
    return rows.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        deltaScore(previewDelta(selected, b.inst, b.def)) - deltaScore(previewDelta(selected, a.inst, a.def)) ||
        a.def.name.localeCompare(b.def.name, 'ko'),
    )
  }, [campaign, selected])

  if (!selected) return <p className="dim">부대가 없다.</p>

  const officer = OFFICERS[selected.officerId]
  const cls = CLASSES[officer.classId]
  const base = combatStats(officer.stats, cls.growth, selected.level)
  const totals = equipTotals(selected)
  const fruits = campaign.fruits.map((id, index) => ({ index, id, def: FRUITS[id] }))

  const doEquip = (index: number) => {
    const next = equipItem(campaign, selected.officerId, index)
    if (next !== campaign) onChange(next)
  }
  const doUnequip = (slot: EquipSlot) => {
    const next = unequipItem(campaign, selected.officerId, slot)
    if (next !== campaign) onChange(next)
  }
  const doUseFruit = (index: number) => {
    const next = applyFruit(campaign, selected.officerId, index)
    if (next !== campaign) onChange(next)
  }

  return (
    <div className="fac-grid">
      {/* ① 장수 리스트 */}
      <section className="panel-box fac-col">
        <h3>부대 ({campaign.roster.length})</h3>
        <div className="fac-roster">
          {campaign.roster.map((r) => {
            const o = OFFICERS[r.officerId]
            const c = CLASSES[o.classId]
            return (
              <button
                key={r.officerId}
                className={`roster-row fac-roster-row${r.officerId === selected.officerId ? ' selected' : ''}`}
                onClick={() => setSelectedId(r.officerId)}
              >
                <span className="roster-icon f-player">{CLASS_ICON[c.id] ?? '?'}</span>
                <span className="roster-name">{o.name}</span>
                <span className="roster-class">{c.name}</span>
                <span className="roster-level">Lv {r.level}</span>
                <span className="fac-slot-icons">
                  {SLOTS.map((slot) => {
                    const inst = r.equipment?.[slot]
                    const def = defOfInstance(inst)
                    return (
                      <span
                        key={slot}
                        className={`fac-slot-icon${def ? ' filled' : ''}`}
                        title={
                          inst && def
                            ? `${SLOT_LABEL[slot]}: ${def.name} Lv${inst.level}`
                            : `${SLOT_LABEL[slot]}: 없음`
                        }
                      >
                        {def ? SLOT_ICON[slot] : '·'}
                      </span>
                    )
                  })}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {/* ② 선택 장수의 3슬롯 + 장비 반영 능력치 */}
      <section className="panel-box fac-col">
        <h3>
          {officer.name} — {cls.name} Lv{selected.level}
        </h3>
        <div className="fac-slots">
          {SLOTS.map((slot) => {
            const inst = selected.equipment?.[slot]
            const def = defOfInstance(inst)
            return (
              <button
                key={slot}
                className={`fac-slot${def ? '' : ' empty'}`}
                onClick={() => def && doUnequip(slot)}
                disabled={!def}
                title={inst && def ? `${instanceTitle(inst, def)}\n클릭하면 해제 → 창고` : undefined}
              >
                <span className="fac-slot-tag">{SLOT_LABEL[slot]}</span>
                {inst && def ? (
                  <>
                    <span className="fac-slot-name">
                      <EquipTag inst={inst} def={def} />
                    </span>
                    <span className="fac-slot-effect">{instanceEffectText(inst, def)}</span>
                    <span className="fac-slot-action">해제</span>
                  </>
                ) : (
                  <span className="fac-slot-name dim">비어 있음</span>
                )}
              </button>
            )
          })}
        </div>

        <h4>장비 반영 능력치</h4>
        <div className="stat-grid fac-stats">
          <span>HP {maxHp(cls, selected.level)}</span>
          <span>MP {maxMp(cls, selected.level)}</span>
          {STAT_KEYS.map((k) => {
            const bonus = totals.stats[k] ?? 0
            return (
              <span key={k}>
                {STAT_LABEL[k]} {base[k] + bonus}
                {bonus !== 0 && <em className={`fac-delta ${bonus > 0 ? 'up' : 'down'}`}> ({signed(bonus)})</em>}
              </span>
            )
          })}
          <span>
            이동 {cls.move + totals.move}
            {totals.move !== 0 && (
              <em className={`fac-delta ${totals.move > 0 ? 'up' : 'down'}`}> ({signed(totals.move)})</em>
            )}
          </span>
          <span>
            사거리 {cls.minRange === cls.maxRange ? cls.minRange : `${cls.minRange}~${cls.maxRange}`}
          </span>
          {totals.expMultiplier !== 1 && (
            <span>
              경험치 <em className="fac-delta up">×{Math.round(totals.expMultiplier * 100) / 100}</em>
            </span>
          )}
        </div>

        {/* 능력치 열매 — 3단계 일반 장비를 만렙에서 팔면 얻는다 (equipment.md §1) */}
        <h4>능력치 열매 ({fruits.length})</h4>
        {fruits.length === 0 ? (
          <p className="dim">없음</p>
        ) : (
          <div className="fac-fruits">
            {fruits.map((row) => {
              const pv = fruitPreview(campaign, selected.officerId, row.index)
              const name = row.def?.name ?? row.id
              return (
                <button
                  key={`${row.id}-${row.index}`}
                  className={`fac-fruit-row${pv.usable ? '' : ' disabled'}`}
                  disabled={!pv.usable}
                  onClick={() => doUseFruit(row.index)}
                  title={
                    pv.usable
                      ? `${row.def?.description ?? name} — 클릭하면 ${officer.name}에게 사용 (${pv.text})`
                      : `${officer.name}에게는 사용할 수 없다`
                  }
                >
                  <span className="fac-fruit-icon">果</span>
                  <span className="fac-item-name">{name}</span>
                  <span className={`fac-chip ${pv.usable ? 'up' : 'flat'}`}>{pv.text}</span>
                  <span className="fac-fruit-action">{pv.usable ? '사용' : '불가'}</span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* ③ 창고 (인벤토리) */}
      <section className="panel-box fac-col">
        <h3>창고 ({campaign.inventory.length})</h3>
        {inventory.length === 0 ? (
          <p className="dim">창고가 비어 있다. 상점에서 장비를 구입하거나 전투 전리품을 모아보자.</p>
        ) : (
          <div className="fac-inventory">
            {inventory.map((row) => {
              const wearable = canEquip(selected.officerId, row.inst.itemId)
              const delta = previewDelta(selected, row.inst, row.def)
              return (
                <button
                  key={`${row.inst.itemId}-${row.index}`}
                  className={`fac-item-row${wearable ? '' : ' fac-unwearable'}`}
                  disabled={!wearable}
                  onClick={() => doEquip(row.index)}
                  title={
                    wearable
                      ? `${instanceTitle(row.inst, row.def)}\n클릭하면 ${officer.name}에게 장착`
                      : `${instanceTitle(row.inst, row.def)}\n${cls.name}은(는) 착용할 수 없다 (${classesLabel(row.def)})`
                  }
                >
                  <span className="fac-item-head">
                    <EquipTag inst={row.inst} def={row.def} />
                    <span className="fac-item-slot">{SLOT_LABEL[row.def.slot]}</span>
                  </span>
                  <span className="fac-item-effect">{instanceEffectText(row.inst, row.def)}</span>
                  <span className="fac-item-delta">
                    {wearable ? <DeltaChips delta={delta} /> : <span className="fac-forbidden">병과 불가</span>}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

// ---------- 상점 탭 ----------

/** tier 해금에 필요한 평균 레벨 — shopTierFor 를 역으로 훑어 구한다(하드코딩 금지) */
function tierRequirement(tier: number): number | null {
  for (let lv = 1; lv <= 50; lv++) {
    if (shopTierFor(lv) >= tier) return lv
  }
  return null
}

function ShopTab({ campaign, onChange }: TabProps) {
  const avg = avgRosterLevel(campaign)
  const unlockedTier = shopTierFor(avg)
  const avgText = Number.isInteger(avg) ? `${avg}` : avg.toFixed(1)

  const tiers = useMemo(() => {
    const byTier = new Map<number, EquipmentDef[]>()
    for (const def of Object.values(EQUIPMENT)) {
      if (priceOf(def) === null) continue
      const list = byTier.get(def.tier) ?? []
      list.push(def)
      byTier.set(def.tier, list)
    }
    return [...byTier.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([tier, list]) => ({
        tier,
        items: list.sort((a, b) => (priceOf(a) ?? 0) - (priceOf(b) ?? 0) || a.name.localeCompare(b.name, 'ko')),
      }))
  }, [])

  const sellable = useMemo(() => inventoryRows(campaign), [campaign])

  const doBuy = (itemId: string) => {
    const next = buyItem(campaign, itemId)
    if (next !== campaign) onChange(next)
  }
  const doSell = (index: number) => {
    const next = sellItem(campaign, index)
    if (next !== campaign) onChange(next)
  }

  return (
    <div className="fac-shop">
      <div className="fac-shop-head panel-box">
        <span className="fac-gold-big">금전 {campaign.gold.toLocaleString('ko-KR')}</span>
        <span className="fac-tier-note">
          평균 Lv {avgText} — {unlockedTier}단계 상점
        </span>
        {campaign.fruits.length > 0 && <span className="fac-tier-note">열매 {campaign.fruits.length}개 보유</span>}
      </div>

      <div className="fac-shop-body">
        <section className="panel-box fac-col">
          <h3>물자 조달</h3>
          {tiers.length === 0 && <p className="dim">판매 중인 물품이 없다.</p>}
          {tiers.map(({ tier, items }) => {
            const locked = tier > unlockedTier
            const need = locked ? tierRequirement(tier) : null
            return (
              <div key={tier} className={`fac-tier-group${locked ? ' locked' : ''}`}>
                <h4>
                  {tier}단계 장비
                  {locked && <span className="fac-lock-label">평균 Lv {need ?? '?'} 필요</span>}
                </h4>
                {items.map((def) => {
                  const price = priceOf(def) ?? 0
                  const poor = campaign.gold < price
                  return (
                    <div key={def.id} className={`fac-shop-row${locked ? ' locked' : ''}`} title={def.description}>
                      <span className="fac-item-name">{def.name}</span>
                      <span className="fac-item-slot">{SLOT_LABEL[def.slot]}</span>
                      <span className="fac-item-effect">
                        {effectText(def)}
                        <span className="fac-classes"> · {classesLabel(def)}</span>
                      </span>
                      <span className={`fac-price${!locked && poor ? ' poor' : ''}`}>
                        {price.toLocaleString('ko-KR')}
                      </span>
                      <button
                        className="fac-buy-btn"
                        onClick={() => doBuy(def.id)}
                        disabled={locked || poor}
                        title={locked ? `평균 Lv ${need ?? '?'} 필요` : poor ? '금전 부족' : undefined}
                      >
                        구매
                      </button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </section>

        <section className="panel-box fac-col">
          <h3>창고 정리 ({campaign.inventory.length})</h3>
          {sellable.length === 0 ? (
            <p className="dim">팔 물건이 없다.</p>
          ) : (
            sellable.map((row) => {
              const pv = sellPreview(campaign, row.index)
              return (
                <div
                  key={`${row.inst.itemId}-${row.index}`}
                  className="fac-shop-row"
                  title={instanceTitle(row.inst, row.def)}
                >
                  <span className="fac-item-head">
                    <EquipTag inst={row.inst} def={row.def} />
                  </span>
                  <span className="fac-item-slot">{SLOT_LABEL[row.def.slot]}</span>
                  <span className="fac-item-effect">{instanceEffectText(row.inst, row.def)}</span>
                  {!pv.ok ? (
                    <span className="fac-nosale" title={isTreasure(row.def) ? '보물은 팔 수 없다' : undefined}>
                      {isTreasure(row.def) ? '비매품' : '판매 불가'}
                    </span>
                  ) : (
                    <button
                      className={`fac-sell-btn${pv.fruitName ? ' fruit' : ''}`}
                      onClick={() => doSell(row.index)}
                      title={
                        pv.fruitName
                          ? `최대 레벨 3단계 장비 — 팔면 ${pv.fruitName}이(가) 남는다`
                          : `반값 ${pv.gold.toLocaleString('ko-KR')} 금전`
                      }
                    >
                      {pv.fruitName
                        ? `판매 → ${pv.fruitName}`
                        : `판매 (반값 ${pv.gold.toLocaleString('ko-KR')})`}
                    </button>
                  )}
                </div>
              )
            })
          )}
        </section>
      </div>
    </div>
  )
}

// ---------- 오버레이 ----------

type Tab = 'storage' | 'shop'

interface Props {
  campaign: CampaignState
  /** 모든 거래/장착/열매 결과를 부모로 전달 (저장은 부모 책임) */
  onChange: (next: CampaignState) => void
  onClose: () => void
}

export function CampFacilities({ campaign, onChange, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('storage')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="facilities-overlay" role="dialog" aria-modal="true" aria-label="막사">
      <div className="facilities-box">
        <header className="facilities-header">
          <h2>막사</h2>
          <div className="fac-tabs">
            <button
              className={`fac-tab${tab === 'storage' ? ' active' : ''}`}
              onClick={() => setTab('storage')}
              autoFocus
            >
              창고·장비
            </button>
            <button className={`fac-tab${tab === 'shop' ? ' active' : ''}`} onClick={() => setTab('shop')}>
              상점
            </button>
          </div>
          <span className="fac-gold">금전 {campaign.gold.toLocaleString('ko-KR')}</span>
          <button className="title-btn fac-close" onClick={onClose}>
            닫기
          </button>
        </header>

        {tab === 'storage' ? (
          <StorageTab campaign={campaign} onChange={onChange} />
        ) : (
          <ShopTab campaign={campaign} onChange={onChange} />
        )}
      </div>
    </div>
  )
}
