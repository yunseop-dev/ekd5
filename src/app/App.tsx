import { useState } from 'react'
import type { StageDef } from '../core/types'
import { STAGES } from '../data/stages'
import { BattleScreen } from '../ui/BattleScreen'

const STAGE_DESC: Record<string, string> = {
  stage01: '강과 다리 길목을 건너 황건적을 전멸시켜라. (이동/지형/상성/책략 기본기)',
  stage02: '8턴 방어 또는 적장 정원지 격파. 턴 3/5에 적 증원. (방어전/웨이브/2차 조건)',
}

export function App() {
  const [stage, setStage] = useState<StageDef | null>(null)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 2 ** 31))

  if (stage) {
    return (
      <BattleScreen
        key={`${stage.id}-${seed}`}
        stage={stage}
        seed={seed}
        onExit={() => setStage(null)}
        onRestart={() => setSeed(Math.floor(Math.random() * 2 ** 31))}
      />
    )
  }

  return (
    <div className="stage-select">
      <h1>ekd5 — 영걸전 스타일 웹 SRPG</h1>
      <p>스테이지를 선택하세요.</p>
      {STAGES.map((s) => (
        <button key={s.id} className="stage-card" onClick={() => setStage(s)}>
          <strong>{s.name}</strong>
          <div className="stage-desc">{STAGE_DESC[s.id]}</div>
        </button>
      ))}
    </div>
  )
}
