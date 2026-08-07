// v0.5 막사 시설 — 창고·장비 / 상점 (docs/research/campaign-ux.md 1부 §26·30)
// 원작 막사는 "창고 담당 장수 클릭 = 장비 교체", "물자 담당 클릭 = 아이템 매매".
// 걸어다니는 허브 없이 캠페인 허브 위에 전면 오버레이 1장으로 두 기능을 얹는다.
// 거래/장착은 즉시 확정(확인 모달 없음, 원작식) — 상태 저장은 부모(onChange) 책임.

import { useEffect, useMemo, useState } from 'react'
import type { CampaignState, RosterEntry } from '../core/campaign'
import { avgRosterLevel, buyItem, equipItem, sellItem, shopTierFor, unequipItem } from '../core/campaign'
import { combatStats, maxHp, maxMp } from '../core/formulas'
import type { EquipSlot, EquipmentDef } from '../core/types'
import { CLASSES } from '../data/classes'
import { EQUIPMENT } from '../data/equipment'
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

const SLOTS: EquipSlot[] = ['weapon', 'armor', 'accessory']
const SLOT_LABEL: Record<EquipSlot, string> = { weapon: '무기', armor: '방어구', accessory: '보조' }
const SLOT_ICON: Record<EquipSlot, string> = { weapon: '武', armor: '甲', accessory: '珍' }

const statBonus = (def: EquipmentDef): StatDelta => def.bonus
/** null = 비매품(보물) */
const priceOf = (def: EquipmentDef): number | null => def.price
const moveBonusOf = (def: EquipmentDef): number => def.moveBonus ?? 0
const expMultiplierOf = (def: EquipmentDef): number => def.expMultiplier ?? 1
const sellPriceOf = (def: EquipmentDef): number | null => {
  const p = priceOf(def)
  return p === null ? null : Math.floor(p / 2)
}
const isTreasure = (def: EquipmentDef): boolean => def.isTreasure === true

function defOf(itemId: string | null | undefined): EquipmentDef | null {
  if (!itemId) return null
  return EQUIPMENT[itemId] ?? null
}

const signed = (n: number): string => (n > 0 ? `+${n}` : `${n}`.replace('-', '−'))

/** "공격 +16 · 이동 +1 · 경험치 ×1.5" */
function effectText(def: EquipmentDef): string {
  const parts: string[] = []
  const bonus = statBonus(def)
  for (const k of STAT_KEYS) {
    const v = bonus[k]
    if (v) parts.push(`${STAT_LABEL[k]} ${signed(v)}`)
  }
  const mv = moveBonusOf(def)
  if (mv) parts.push(`이동 ${signed(mv)}`)
  const exp = expMultiplierOf(def)
  if (exp !== 1) parts.push(`경험치 ×${exp}`)
  return parts.length > 0 ? parts.join(' · ') : '효과 없음'
}

// ---------- 로스터 장비 합산 ----------

function equippedIds(entry: RosterEntry): Array<{ slot: EquipSlot; def: EquipmentDef }> {
  const out: Array<{ slot: EquipSlot; def: EquipmentDef }> = []
  for (const slot of SLOTS) {
    const def = defOf(entry.equipment?.[slot])
    if (def) out.push({ slot, def })
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
  for (const { def } of equippedIds(entry)) {
    const bonus = statBonus(def)
    for (const k of STAT_KEYS) {
      if (bonus[k]) stats[k] = (stats[k] ?? 0) + (bonus[k] ?? 0)
    }
    move += moveBonusOf(def)
    expMultiplier *= expMultiplierOf(def)
  }
  return { stats, move, expMultiplier }
}

/** 장착 시 순증감 — 같은 슬롯에 이미 낀 장비를 교체하는 경우까지 반영 */
function previewDelta(entry: RosterEntry, next: EquipmentDef): EquipTotals {
  const cur = defOf(entry.equipment?.[next.slot])
  const nextBonus = statBonus(next)
  const curBonus = cur ? statBonus(cur) : {}
  const stats: StatDelta = {}
  for (const k of STAT_KEYS) {
    const d = (nextBonus[k] ?? 0) - (curBonus[k] ?? 0)
    if (d !== 0) stats[k] = d
  }
  return {
    stats,
    move: moveBonusOf(next) - (cur ? moveBonusOf(cur) : 0),
    expMultiplier: expMultiplierOf(next) / (cur ? expMultiplierOf(cur) : 1),
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

// ---------- 창고·장비 탭 ----------

interface TabProps {
  campaign: CampaignState
  onChange: (next: CampaignState) => void
}

function StorageTab({ campaign, onChange }: TabProps) {
  const [selectedId, setSelectedId] = useState<string>(campaign.roster[0]?.officerId ?? '')
  const selected = campaign.roster.find((r) => r.officerId === selectedId) ?? campaign.roster[0] ?? null

  const inventory = useMemo(() => {
    const rows = campaign.inventory
      .map((itemId, index) => ({ index, itemId, def: defOf(itemId) }))
      .filter((r): r is { index: number; itemId: string; def: EquipmentDef } => r.def !== null)
    if (!selected) return rows
    // 빈 슬롯용 장비 → 능력치가 오르는 교체품 → 나머지 (병과 제한은 MVP 없음)
    const rank = (def: EquipmentDef): number => {
      if (!defOf(selected.equipment?.[def.slot])) return 0
      return deltaScore(previewDelta(selected, def)) > 0 ? 1 : 2
    }
    return rows.sort(
      (a, b) =>
        rank(a.def) - rank(b.def) ||
        deltaScore(previewDelta(selected, b.def)) - deltaScore(previewDelta(selected, a.def)) ||
        a.def.name.localeCompare(b.def.name, 'ko'),
    )
  }, [campaign.inventory, selected])

  if (!selected) return <p className="dim">부대가 없다.</p>

  const officer = OFFICERS[selected.officerId]
  const cls = CLASSES[officer.classId]
  const base = combatStats(officer.stats, cls.growth, selected.level)
  const totals = equipTotals(selected)

  const doEquip = (itemId: string) => {
    const next = equipItem(campaign, selected.officerId, itemId)
    if (next !== campaign) onChange(next)
  }
  const doUnequip = (slot: EquipSlot) => {
    const next = unequipItem(campaign, selected.officerId, slot)
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
                    const def = defOf(r.equipment?.[slot])
                    return (
                      <span
                        key={slot}
                        className={`fac-slot-icon${def ? ' filled' : ''}`}
                        title={def ? `${SLOT_LABEL[slot]}: ${def.name}` : `${SLOT_LABEL[slot]}: 없음`}
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
            const def = defOf(selected.equipment?.[slot])
            return (
              <button
                key={slot}
                className={`fac-slot${def ? '' : ' empty'}`}
                onClick={() => def && doUnequip(slot)}
                disabled={!def}
                title={def ? `${def.name} 해제 → 창고` : undefined}
              >
                <span className="fac-slot-tag">{SLOT_LABEL[slot]}</span>
                {def ? (
                  <>
                    <span className="fac-slot-name">{def.name}</span>
                    <span className="fac-slot-effect">{effectText(def)}</span>
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
      </section>

      {/* ③ 창고 (인벤토리) */}
      <section className="panel-box fac-col">
        <h3>창고 ({campaign.inventory.length})</h3>
        {inventory.length === 0 ? (
          <p className="dim">창고가 비어 있다. 상점에서 장비를 구입하거나 전투 전리품을 모아보자.</p>
        ) : (
          <div className="fac-inventory">
            {inventory.map((row) => {
              const delta = previewDelta(selected, row.def)
              return (
                <button
                  key={`${row.itemId}-${row.index}`}
                  className="fac-item-row"
                  onClick={() => doEquip(row.itemId)}
                  title={`${row.def.description} — 클릭하면 ${officer.name}에게 장착`}
                >
                  <span className="fac-item-head">
                    <span className="fac-item-name">{row.def.name}</span>
                    <span className="fac-item-slot">{SLOT_LABEL[row.def.slot]}</span>
                  </span>
                  <span className="fac-item-effect">{effectText(row.def)}</span>
                  <span className="fac-item-delta">
                    <DeltaChips delta={delta} />
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

  const sellable = useMemo(
    () =>
      campaign.inventory
        .map((itemId, index) => ({ index, itemId, def: defOf(itemId) }))
        .filter((r): r is { index: number; itemId: string; def: EquipmentDef } => r.def !== null),
    [campaign.inventory],
  )

  const doBuy = (itemId: string) => {
    const next = buyItem(campaign, itemId)
    if (next !== campaign) onChange(next)
  }
  const doSell = (itemId: string) => {
    const next = sellItem(campaign, itemId)
    if (next !== campaign) onChange(next)
  }

  return (
    <div className="fac-shop">
      <div className="fac-shop-head panel-box">
        <span className="fac-gold-big">금전 {campaign.gold.toLocaleString('ko-KR')}</span>
        <span className="fac-tier-note">
          평균 Lv {avgText} — {unlockedTier}단계 상점
        </span>
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
                      <span className="fac-item-effect">{effectText(def)}</span>
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
              const sell = isTreasure(row.def) ? null : sellPriceOf(row.def)
              return (
                <div key={`${row.itemId}-${row.index}`} className="fac-shop-row" title={row.def.description}>
                  <span className="fac-item-name">{row.def.name}</span>
                  <span className="fac-item-slot">{SLOT_LABEL[row.def.slot]}</span>
                  <span className="fac-item-effect">{effectText(row.def)}</span>
                  {sell === null ? (
                    <span className="fac-nosale" title="보물은 팔 수 없다">
                      비매품
                    </span>
                  ) : (
                    <button className="fac-sell-btn" onClick={() => doSell(row.itemId)}>
                      판매 (반값 {sell.toLocaleString('ko-KR')})
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
  /** 모든 거래/장착 결과를 부모로 전달 (저장은 부모 책임) */
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
