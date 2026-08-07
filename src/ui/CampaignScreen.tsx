// 캠페인 허브 — 3열 그리드 1화면 (docs/research/campaign-ux.md 2부 §3)
// 좌: 다음 전투 카드 / 중앙: 로스터 / 우: 선택 유닛 상세. 걸어다니는 허브 금지.

import { useState } from 'react'
import type { CampaignState } from '../core/campaign'
import { CAMPAIGN_NODES, currentNode, isCampaignFinished, stageForNode } from '../core/campaign'
import { combatStats, maxHp, maxMp } from '../core/formulas'
import type { StageDef, VictoryCondition } from '../core/types'
import { CLASSES } from '../data/classes'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { STRATEGIES } from '../data/strategies'
import { CLASS_ICON } from './BattleBoard'
import { CampFacilities } from './CampFacilities'
import './campaign.css'

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
            const morale =
              combatStats(officer.stats, cls.growth, r.level).morale +
              Object.values(r.equipment).reduce((s, id) => s + (EQUIPMENT[id]?.bonus.morale ?? 0), 0)
            return (
              <button
                key={r.officerId}
                className={`roster-row${r.officerId === selectedId ? ' selected' : ''}`}
                onClick={() => setSelectedId(r.officerId)}
              >
                <span className={`roster-icon f-player`}>{CLASS_ICON[cls.id] ?? '?'}</span>
                <span className="roster-name">{officer.name}</span>
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
              </h3>
              <div className="stat-grid">
                {(() => {
                  const s = combatStats(selOfficer.stats, selClass.growth, selected.level)
                  const items = Object.values(selected.equipment)
                    .map((id) => EQUIPMENT[id])
                    .filter((d) => d !== undefined)
                  const bonus = (k: 'atk' | 'def' | 'mind' | 'agi' | 'morale') =>
                    items.reduce((sum, d) => sum + (d.bonus[k] ?? 0), 0)
                  const moveBonus = items.reduce((sum, d) => sum + (d.moveBonus ?? 0), 0)
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
                      {stat('공격', s.atk, bonus('atk'))}
                      {stat('방어', s.def, bonus('def'))}
                      {stat('정신', s.mind, bonus('mind'))}
                      {stat('순발', s.agi, bonus('agi'))}
                      {stat('사기', s.morale, bonus('morale'))}
                      <span>EXP {selected.exp}/100</span>
                      {stat('이동', selClass.move, moveBonus)}
                      <span>
                        사거리 {selClass.minRange === selClass.maxRange ? selClass.minRange : `${selClass.minRange}~${selClass.maxRange}`}
                      </span>
                    </>
                  )
                })()}
              </div>
              <h4>장비</h4>
              <ul className="strategy-list">
                {(['weapon', 'armor', 'accessory'] as const).map((slot) => {
                  const def = selected.equipment[slot] ? EQUIPMENT[selected.equipment[slot]!] : undefined
                  const slotName = { weapon: '무기', armor: '방어구', accessory: '보조' }[slot]
                  return (
                    <li key={slot} className={def ? '' : 'dim'} title={def?.description}>
                      {slotName}: {def ? def.name : '없음'}
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
