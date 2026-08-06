import { useEffect, useRef } from 'react'
import type { LogEvent } from '../core/types'

export function BattleLog({ log }: { log: LogEvent[] }) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' })
  }, [log.length])

  return (
    <div className="panel-box">
      <h3>전투 기록</h3>
      <div className="battle-log">
        {log.slice(-40).map((e, i) => (
          <span key={i} className={`log-${e.type}`}>
            {e.message}
          </span>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  )
}
