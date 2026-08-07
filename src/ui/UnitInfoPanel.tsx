import { classOf, effectiveStats, equippedItems, moveOf, officerOf, terrainEffectOf } from '../core/battle'
import type { BattleState, UnitState } from '../core/types'
import { TERRAIN } from '../data/terrain'

export function UnitInfoPanel({ state, unit }: { state: BattleState; unit: UnitState }) {
  const officer = officerOf(unit)
  const cls = classOf(unit)
  const stats = effectiveStats(unit)
  const tile = TERRAIN[state.map.tiles[unit.pos.y][unit.pos.x]]
  // 아군/적군/우군 공통 — 원작도 적장 장비를 정보 패널에서 확인 가능
  const items = equippedItems(unit)

  return (
    <div className="panel-box">
      <h3>
        {officer.name} — {cls.name} Lv{unit.level}
      </h3>
      <div className="stat-grid">
        <span>
          HP {unit.hp}/{unit.maxHp}
        </span>
        <span>
          MP {unit.mp}/{unit.maxMp}
        </span>
        <span>공격 {stats.atk}</span>
        <span>방어 {stats.def}</span>
        <span>정신 {stats.mind}</span>
        <span>순발 {stats.agi}</span>
        <span>사기 {stats.morale}</span>
        <span>EXP {unit.exp}/100</span>
        <span>
          지형 {tile.name} {terrainEffectOf(state, unit)}%
        </span>
        <span>이동 {moveOf(unit)}</span>
      </div>
      <div className="equip-line" title={items.map((i) => `${i.name}: ${i.description}`).join('\n')}>
        장비 {items.length > 0 ? items.map((i) => i.name).join(' · ') : '없음'}
      </div>
    </div>
  )
}
