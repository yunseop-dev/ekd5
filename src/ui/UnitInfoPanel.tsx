import { classOf, effectiveStats, moveOf, officerOf, terrainEffectOf } from '../core/battle'
import type { BattleState, EquipInstance, EquipSlot, EquipmentDef, UnitState } from '../core/types'
import { EQUIP_EXP_PER_LEVEL, EQUIP_MAX_LEVEL_NORMAL, EQUIP_MAX_LEVEL_TREASURE } from '../core/types'
import { EQUIPMENT } from '../data/equipment'
import { STATUSES, statusName } from '../data/statuses'
import { TERRAIN } from '../data/terrain'

const SLOTS: EquipSlot[] = ['weapon', 'armor', 'accessory']

/** 장착 개체 + 정의 (미등록 id 는 조용히 무시 — 구버전 세이브 내성) */
function equippedInstances(unit: UnitState): Array<{ inst: EquipInstance; def: EquipmentDef }> {
  const out: Array<{ inst: EquipInstance; def: EquipmentDef }> = []
  for (const slot of SLOTS) {
    const inst = unit.equipment?.[slot]
    const def = inst ? EQUIPMENT[inst.itemId] : undefined
    if (inst && def) out.push({ inst, def })
  }
  return out
}

const maxLevelOf = (def: EquipmentDef): number =>
  def.isTreasure ? EQUIP_MAX_LEVEL_TREASURE : EQUIP_MAX_LEVEL_NORMAL

export function UnitInfoPanel({ state, unit }: { state: BattleState; unit: UnitState }) {
  const officer = officerOf(unit)
  const cls = classOf(unit)
  const stats = effectiveStats(unit)
  const tile = TERRAIN[state.map.tiles[unit.pos.y][unit.pos.x]]
  // 아군/적군/우군 공통 — 원작도 적장 장비를 정보 패널에서 확인 가능
  const items = equippedInstances(unit)

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
      <div
        className="equip-line"
        title={items
          .map(({ inst, def }) => {
            const lv =
              inst.level >= maxLevelOf(def)
                ? `Lv${inst.level} MAX`
                : `Lv${inst.level} · EXP ${inst.exp}/${EQUIP_EXP_PER_LEVEL}`
            return `${def.name} (${lv}): ${def.description}`
          })
          .join('\n')}
      >
        장비{' '}
        {items.length > 0
          ? items.map(({ inst, def }, i) => (
              <span key={`${def.id}-${i}`}>
                {i > 0 && ' · '}
                {def.name} <strong className="equip-lv">Lv{inst.level}</strong>
              </span>
            ))
          : '없음'}
      </div>
      {/* 상태이상 — 없으면 줄 자체를 내지 않는다 (평시 패널을 조용하게 유지) */}
      {unit.statuses.length > 0 && (
        <div className="status-line">
          상태:{' '}
          {unit.statuses.map((s, i) => (
            <span key={`${s.id}-${i}`}>
              {i > 0 && ' · '}
              <span
                className={`status-name s-${s.id}`}
                title={STATUSES[s.id]?.desc ?? statusName(s.id)}
              >
                {statusName(s.id)}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
