// 지형 정보 패널 — 원작 "패널 데이터" 창 재현 (docs/research/ux.md §4)
// 지형효과 심볼: 80%=X, 90%=△, 100%=○, 110%=◎, 120%=★
// 이동 코스트 색상: 1=파랑, 2=초록, 3=주황

import type { MoveProfileId, TerrainDef } from '../core/types'

const PROFILES: { id: MoveProfileId; label: string }[] = [
  { id: 'foot', label: '보병' },
  { id: 'horse', label: '기병' },
  { id: 'wheel', label: '차량' },
  { id: 'mage', label: '문관' },
]

function effectSymbol(effect: number): string {
  if (effect >= 120) return '★'
  if (effect >= 110) return '◎'
  if (effect >= 100) return '○'
  if (effect >= 90) return '△'
  return 'X'
}

export function TerrainInfoPanel({ terrain }: { terrain: TerrainDef }) {
  return (
    <div className="panel-box">
      <h3>지형: {terrain.name}</h3>
      <table className="terrain-table">
        <thead>
          <tr>
            <th />
            {PROFILES.map((p) => (
              <th key={p.id}>{p.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>이동</td>
            {PROFILES.map((p) => {
              const cost = terrain.cost[p.id]
              return (
                <td key={p.id} className={cost === null ? 'cost-x' : `cost-${Math.min(cost, 3)}`}>
                  {cost === null ? '—' : cost}
                </td>
              )
            })}
          </tr>
          <tr>
            <td>효과</td>
            {PROFILES.map((p) => {
              const cost = terrain.cost[p.id]
              const eff = terrain.effect[p.id]
              return (
                <td key={p.id}>
                  {cost === null ? '—' : `${effectSymbol(eff)} ${eff}%`}
                </td>
              )
            })}
          </tr>
        </tbody>
      </table>
      {terrain.healPerTurn && <div className="terrain-heal">매턴 최대 HP {terrain.healPerTurn}% 회복</div>}
    </div>
  )
}
