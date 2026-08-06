import { forecastAttack, officerOf } from '../core/battle'
import type { BattleState, UnitState } from '../core/types'

export function ForecastPanel({
  state,
  attacker,
  defender,
}: {
  state: BattleState
  attacker: UnitState
  defender: UnitState
}) {
  const fc = forecastAttack(state, attacker, defender)
  return (
    <div className="panel-box">
      <h3>전투 예측</h3>
      <div className="forecast-row">
        <span>{officerOf(attacker).name}</span>
        <span>
          {fc.damage} 데미지 · 명중 {fc.hitRate}%
        </span>
      </div>
      <div className="forecast-row">
        <span />
        <span>
          회심 {Math.round(fc.critRate)}% · 2회 {Math.round(fc.doubleRate)}%
        </span>
      </div>
      <div className="forecast-vs">▼ 반격</div>
      {fc.willCounter ? (
        <div className="forecast-row">
          <span>{officerOf(defender).name}</span>
          <span>
            {fc.counterDamage} 데미지 · 명중 {fc.counterHitRate}%
          </span>
        </div>
      ) : (
        <div className="forecast-row">
          <span>{officerOf(defender).name}</span>
          <span>반격 불가</span>
        </div>
      )}
    </div>
  )
}
