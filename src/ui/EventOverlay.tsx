// 전투 내 이벤트 오버레이 (v1.1) — state.pendingEvents 큐 헤드(표시형)를 전장 위에 그린다.
// 계약: 헤드는 항상 dialogue/choice/duel 중 하나이고(executeQueue), 소비는 eventContinue 1회다.
// 이 컴포넌트는 상태 파생 렌더 + dispatch 콜백만 담당한다 — 판정·상태 변화는 전부 코어에 있다.

import type { ReactNode } from 'react'
import type { BattleState } from '../core/types'
import { OFFICERS } from '../data/officers'
import { ChoiceScreen } from './ChoiceScreen'
import { DialogueScreen } from './DialogueScreen'
import './battle.css'

interface Props {
  state: BattleState
  /** 대사 창 제목 — 보통 스테이지 이름 */
  title: string
  /** 큐 헤드 소비 (eventContinue). choice일 때만 선택 index를 넘긴다 */
  onContinue: (choice?: number) => void
}

const nameOf = (officerId: string): string => OFFICERS[officerId]?.name ?? officerId

export function EventOverlay({ state, title, onContinue }: Props) {
  const pending = state.pendingEvents[0]
  const head = pending?.queue[0]
  if (!pending || !head) return null

  // 큐가 한 칸 줄면(다음 표시형으로 이동) 대사 컴포넌트를 remount해 첫 줄부터 재생한다
  const playKey = `${pending.eventId}:${pending.queue.length}`

  let body: ReactNode = null
  switch (head.type) {
    case 'dialogue':
      body = (
        <DialogueScreen key={playKey} title={title} script={head.lines} onDone={() => onContinue()} overlay />
      )
      break

    case 'duel':
      // 결과(경험치·격파·퇴각 로그)는 코어가 eventContinue에서 적용한다 — UI는 대사만 재생한다
      body = (
        <DialogueScreen
          key={playKey}
          title={`일기토 · ${nameOf(head.a)} vs ${nameOf(head.b)}`}
          script={head.lines}
          onDone={() => onContinue()}
          overlay
        />
      )
      break

    case 'choice':
      body = (
        <ChoiceScreen
          key={playKey}
          title={title}
          prompt={head.prompt}
          speaker={head.speaker}
          options={head.options}
          onPick={(i) => onContinue(i)}
        />
      )
      break

    default:
      return null // 즉시형이 헤드에 남아 있으면 안 된다 (방어)
  }

  return (
    <div
      className="event-overlay"
      // 전장으로 클릭이 흘러가지 않게 막는다 (대상 지정 중 이벤트가 떠도 보드는 조작 불가)
      onClick={(e) => e.stopPropagation()}
      // 우클릭: 대사는 DialogueScreen이 한 줄 진행(overlay), 선택지는 무동작 — 브라우저 메뉴만 막는다
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-label="전투 이벤트"
    >
      {body}
    </div>
  )
}
