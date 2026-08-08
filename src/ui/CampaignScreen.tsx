// 캠페인 허브 — 3열 그리드 1화면 (docs/research/campaign-ux.md 2부 §3)
// 좌: 다음 전투 카드 / 중앙: 로스터 / 우: 선택 유닛 상세. 걸어다니는 허브 금지.

import { useState } from 'react'
import { equipInstanceBonus } from '../core/battle'
import type { CampaignState, RosterEntry } from '../core/campaign'
import { CAMPAIGN_NODES, currentNode, isCampaignFinished, stageForNode } from '../core/campaign'
import { combatStats, maxHp, maxMp } from '../core/formulas'
import type {
  EquipInstance,
  EquipSlot,
  EquipmentDef,
  OfficerStats,
  StageDef,
  VictoryCondition,
} from '../core/types'
import { EQUIP_EXP_PER_LEVEL, EQUIP_MAX_LEVEL_NORMAL, EQUIP_MAX_LEVEL_TREASURE } from '../core/types'
import { CLASSES } from '../data/classes'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STRATEGIES } from '../data/strategies'
import { CLASS_ICON } from './BattleBoard'
import { CampFacilities } from './CampFacilities'
import './campaign.css'

// ---------- v0.6 장비 개체 / 열매 보정 헬퍼 ----------

type CombatStatKey = 'atk' | 'def' | 'mind' | 'agi' | 'morale'

/** 장수 원 능력치 키 — 열매가 직접 올린다 (RosterEntry.statBonus) */
const OFFICER_STAT_KEYS = ['str', 'ldr', 'int', 'agi', 'luck'] as const
const OFFICER_STAT_LABEL: Record<(typeof OFFICER_STAT_KEYS)[number], string> = {
  str: '무력',
  ldr: '통솔',
  int: '지력',
  agi: '민첩',
  luck: '운',
}

const SLOT_ORDER: EquipSlot[] = ['weapon', 'armor', 'accessory']
const SLOT_LABEL: Record<EquipSlot, string> = { weapon: '무기', armor: '방어구', accessory: '보조' }

/** 열매 누적을 장수 능력치에 합산 — combatStats 는 이 합계를 입력으로 받는다 */
function withStatBonus(stats: OfficerStats, bonus: Partial<OfficerStats> | undefined): OfficerStats {
  if (!bonus) return stats
  const out: OfficerStats = { ...stats }
  for (const k of OFFICER_STAT_KEYS) out[k] = out[k] + (bonus[k] ?? 0)
  return out
}

/** 열매 누적 총합 + "무력 +2 · 운 +2" 요약 */
function fruitSummary(bonus: Partial<OfficerStats> | undefined): { total: number; text: string } {
  const parts: string[] = []
  let total = 0
  for (const k of OFFICER_STAT_KEYS) {
    const v = bonus?.[k] ?? 0
    if (v) {
      total += v
      parts.push(`${OFFICER_STAT_LABEL[k]} +${v}`)
    }
  }
  return { total, text: parts.join(' · ') }
}

/** 장착 중인 (개체, 정의) 목록 — 미등록 id 내성 */
function equippedRows(entry: RosterEntry): Array<{ slot: EquipSlot; inst: EquipInstance; def: EquipmentDef }> {
  const out: Array<{ slot: EquipSlot; inst: EquipInstance; def: EquipmentDef }> = []
  for (const slot of SLOT_ORDER) {
    const inst = entry.equipment?.[slot]
    const def = inst ? EQUIPMENT[inst.itemId] : undefined
    if (inst && def) out.push({ slot, inst, def })
  }
  return out
}

/** 장비 레벨 반영 실효 보정 합계 (코어 equipInstanceBonus 단일 출처) */
function equipBonusTotal(entry: RosterEntry): Partial<Record<CombatStatKey, number>> & { move: number } {
  const out: Partial<Record<CombatStatKey, number>> & { move: number } = { move: 0 }
  for (const { inst, def } of equippedRows(entry)) {
    const bonus = equipInstanceBonus(inst) as Partial<Record<CombatStatKey, number>>
    for (const k of ['atk', 'def', 'mind', 'agi', 'morale'] as const) {
      if (bonus[k]) out[k] = (out[k] ?? 0) + (bonus[k] ?? 0)
    }
    out.move += def.moveBonus ?? 0
  }
  return out
}

const equipMaxLevel = (isTreasure: boolean | undefined): number =>
  isTreasure ? EQUIP_MAX_LEVEL_TREASURE : EQUIP_MAX_LEVEL_NORMAL

function victoryText(cond: VictoryCondition): string {
  switch (cond.type) {
    case 'annihilation':
      return '적 부대 전멸'
    case 'defeatBoss':
      return '적장 격파'
    case 'reachPoint':
      return `지점 (${cond.pos.x},${cond.pos.y}) 도달`
    case 'surviveTurns':
      return `${cond.turns}턴 방어`
  }
}

function enemyCount(stage: StageDef): { initial: number; reinforcement: number } {
  return {
    initial: stage.units.filter((u) => u.faction === 'enemy').length,
    reinforcement: stage.reinforcements.reduce(
      (n, r) => n + r.units.filter((u) => u.faction === 'enemy').length,
      0,
    ),
  }
}

interface Props {
  campaign: CampaignState
  savedAt: number | null
  onSortie: () => void
  onTitle: () => void
  /** 막사(상점/창고) 거래·장착 결과 반영 + 저장 (부모 책임) */
  onUpdate: (next: CampaignState) => void
}

export function CampaignScreen({ campaign, savedAt, onSortie, onTitle, onUpdate }: Props) {
  const [selectedId, setSelectedId] = useState<string>(campaign.roster[0]?.officerId)
  const [facilitiesOpen, setFacilitiesOpen] = useState(false)
  const finished = isCampaignFinished(campaign)
  const node = currentNode(campaign)
  const stage = !finished && node?.type === 'battle' ? stageForNode(node) : null
  const nodeIndex = CAMPAIGN_NODES.findIndex((n) => n.id === campaign.nodeId)

  const selected = campaign.roster.find((r) => r.officerId === selectedId)
  const selOfficer = selected ? OFFICERS[selected.officerId] : null
  const selClass = selOfficer ? CLASSES[selOfficer.classId] : null

  return (
    <div className="campaign-screen">
      <header className="campaign-header">
        <h2>조조군 진영</h2>
        <span className="campaign-progress">
          진행 {finished ? CAMPAIGN_NODES.length : nodeIndex + 1} / {CAMPAIGN_NODES.length}
        </span>
        <span className="save-indicator">
          {savedAt ? `자동 저장됨 · ${new Date(savedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </span>
        <span className="gold-display">금 {campaign.gold.toLocaleString('ko-KR')}</span>
        <button className="title-btn" onClick={() => setFacilitiesOpen(true)}>
          막사 (상점·창고)
        </button>
        <button className="title-btn" onClick={onTitle}>
          타이틀로
        </button>
      </header>

      {facilitiesOpen && (
        <CampFacilities campaign={campaign} onChange={onUpdate} onClose={() => setFacilitiesOpen(false)} />
      )}

      <div className="campaign-grid">
        <section className="panel-box next-battle">
          {finished ? (
            <>
              <h3>시나리오 클리어!</h3>
              <p>모든 전투에서 승리했습니다. 다음 장은 준비 중입니다.</p>
            </>
          ) : node?.type === 'story' ? (
            <>
              <h3>다음 이야기</h3>
              <div className="battle-name">{node.title}</div>
              <p className="dim">이야기를 진행하면 다음 전투가 열립니다.</p>
              <button className="sortie-btn" onClick={onSortie} autoFocus>
                이야기 진행
              </button>
            </>
          ) : !stage ? null : (
            <>
              <h3>다음 전투</h3>
              <div className="battle-name">{stage.name}</div>
              <dl className="battle-facts">
                <dt>승리 조건</dt>
                {stage.victory.map((v, i) => (
                  <dd key={i}>
                    {victoryText(v)}
                    {i > 0 && stage.bonusExp ? ` (달성 시 전원 +${stage.bonusExp} EXP)` : ''}
                  </dd>
                ))}
                <dt>패배 조건</dt>
                <dd>조조 부대 괴멸</dd>
                <dt>적 병력</dt>
                <dd>
                  {enemyCount(stage).initial}부대
                  {enemyCount(stage).reinforcement > 0 && ` + 증원 ${enemyCount(stage).reinforcement}부대`}
                </dd>
                <dt>날씨</dt>
                <dd>{stage.weather === 'clear' ? '맑음' : '비 (화계 사용 불가)'}</dd>
              </dl>
              <button className="sortie-btn" onClick={onSortie} autoFocus>
                출진
              </button>
            </>
          )}
        </section>

        <section className="panel-box roster-list">
          <h3>부대 ({campaign.roster.length})</h3>
          {campaign.roster.map((r) => {
            const officer = OFFICERS[r.officerId]
            const cls = CLASSES[officer.classId]
            // 원작 유닛 정보 패널 7필드(초상/이름/병과/Lv/HP/사기/Exp) 축약 재현
            // v0.6: 열매(statBonus)는 장수 능력치에 먼저 얹고, 장비는 개체 레벨 실효치로 더한다.
            const morale =
              combatStats(withStatBonus(officer.stats, r.statBonus), cls.growth, r.level).morale +
              (equipBonusTotal(r).morale ?? 0)
            const fruit = fruitSummary(r.statBonus)
            return (
              <button
                key={r.officerId}
                className={`roster-row${r.officerId === selectedId ? ' selected' : ''}`}
                onClick={() => setSelectedId(r.officerId)}
              >
                <span className={`roster-icon f-player`}>{CLASS_ICON[cls.id] ?? '?'}</span>
                <span className="roster-name">
                  {officer.name}
                  {fruit.total > 0 && (
                    <em className="fruit-badge" title={`능력치 열매 누적 — ${fruit.text}`}>
                      열매 +{fruit.total}
                    </em>
                  )}
                </span>
                <span className="roster-class">{cls.name}</span>
                <span className="roster-level">Lv {r.level}</span>
                <span className="roster-stat">HP {maxHp(cls, r.level)}</span>
                <span className="roster-stat">사기 {morale}</span>
                <span className="exp-bar">
                  <span style={{ width: `${r.exp}%` }} />
                </span>
              </button>
            )
          })}
        </section>

        <section className="panel-box unit-detail">
          {selected && selOfficer && selClass ? (
            <>
              <h3>
                {selOfficer.name} — {selClass.name} Lv{selected.level}
                {(() => {
                  const fruit = fruitSummary(selected.statBonus)
                  return (
                    fruit.total > 0 && (
                      <em className="fruit-badge" title={`능력치 열매 누적 — ${fruit.text}`}>
                        열매 +{fruit.total}
                      </em>
                    )
                  )
                })()}
              </h3>
              <div className="stat-grid">
                {(() => {
                  // 열매는 장수 능력치 자체를 올린다 → combatStats 입력에 먼저 합산한다.
                  const s = combatStats(
                    withStatBonus(selOfficer.stats, selected.statBonus),
                    selClass.growth,
                    selected.level,
                  )
                  const equip = equipBonusTotal(selected)
                  const stat = (label: string, base: number, extra: number) => (
                    <span>
                      {label} {base + extra}
                      {extra !== 0 && <em className="equip-bonus"> (+{extra})</em>}
                    </span>
                  )
                  return (
                    <>
                      <span>HP {maxHp(selClass, selected.level)}</span>
                      <span>MP {maxMp(selClass, selected.level)}</span>
                      {stat('공격', s.atk, equip.atk ?? 0)}
                      {stat('방어', s.def, equip.def ?? 0)}
                      {stat('정신', s.mind, equip.mind ?? 0)}
                      {stat('순발', s.agi, equip.agi ?? 0)}
                      {stat('사기', s.morale, equip.morale ?? 0)}
                      <span>EXP {selected.exp}/100</span>
                      {stat('이동', selClass.move, equip.move)}
                      <span>
                        사거리 {selClass.minRange === selClass.maxRange ? selClass.minRange : `${selClass.minRange}~${selClass.maxRange}`}
                      </span>
                    </>
                  )
                })()}
              </div>
              <h4>장비</h4>
              <ul className="strategy-list">
                {SLOT_ORDER.map((slot) => {
                  const inst = selected.equipment?.[slot]
                  const def = inst ? EQUIPMENT[inst.itemId] : undefined
                  if (!inst || !def) {
                    return (
                      <li key={slot} className="dim">
                        {SLOT_LABEL[slot]}: 없음
                      </li>
                    )
                  }
                  const max = inst.level >= equipMaxLevel(def.isTreasure)
                  return (
                    <li
                      key={slot}
                      title={`${max ? '최대 레벨' : `EXP ${inst.exp}/${EQUIP_EXP_PER_LEVEL}`}\n${def.description}`}
                    >
                      {SLOT_LABEL[slot]}: {def.name} <strong className="equip-lv">Lv{inst.level}</strong>
                      {max ? (
                        <span className="equip-max">MAX</span>
                      ) : (
                        <span className="equip-exp">
                          <span style={{ width: `${Math.min(100, Math.round((inst.exp / EQUIP_EXP_PER_LEVEL) * 100))}%` }} />
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
              <h4>보유 책략</h4>
              <ul className="strategy-list">
                {selClass.strategies
                  .filter((s) => s.learnLevel <= selected.level)
                  .map((s) => (
                    <li key={s.strategyId}>
                      {STRATEGIES[s.strategyId].name} (MP {STRATEGIES[s.strategyId].mpCost})
                    </li>
                  ))}
                {selClass.strategies.filter((s) => s.learnLevel <= selected.level).length === 0 && (
                  <li className="dim">없음</li>
                )}
              </ul>
            </>
          ) : (
            <p className="dim">부대를 선택하세요.</p>
          )}
        </section>
      </div>
    </div>
  )
}
