// 전투 내 이벤트 오버레이 (v1.2) — state.pendingEvents 큐 헤드(표시형)를 전장 **위에** 그린다.
// 계약: 헤드는 항상 dialogue/choice/duel/giveItem 중 하나이고(executeQueue), 소비는 eventContinue 1회다.
// 이 컴포넌트는 상태 파생 렌더 + dispatch 콜백만 담당한다 — 판정·상태 변화는 전부 코어에 있다.
//
// v1.2 원작 재현: 대사는 전면 화면(DialogueScreen)이 아니라 **맵 위 말풍선**(SpeechBubble)이다.
//   DialogueScreen은 캠페인 전용(전투 전/후 스토리)으로 존속하고, 전투 경로에서는 쓰지 않는다.
//   렌더 위치도 BattleBoard의 children으로 옮겨서 보드 좌표계·스크롤을 그대로 물려받는다.

import { useEffect, type ReactNode } from 'react'
import type { BattleState } from '../core/types'
import { CONSUMABLES } from '../data/consumables'
import { EQUIPMENT } from '../data/equipment'
import { OFFICERS } from '../data/officers'
import { ChoiceScreen } from './ChoiceScreen'
import { eulReul } from './josa'
import { BubbleDialoguePlayer } from './SpeechBubble'
import './battle.css'

interface Props {
  state: BattleState
  /** 대사 창 제목 — 보통 스테이지 이름 */
  title: string
  /** 큐 헤드 소비 (eventContinue). choice일 때만 선택 index를 넘긴다 */
  onContinue: (choice?: number) => void
}

const nameOf = (officerId: string): string => OFFICERS[officerId]?.name ?? officerId

/** 아이템 표시명 — kind별로 조회 대상 테이블이 다르다 (없으면 id 노출: 데이터 사고를 숨기지 않는다) */
function itemNameOf(itemId: string, kind: 'equipment' | 'consumable'): string {
  const def = kind === 'equipment' ? EQUIPMENT[itemId] : CONSUMABLES[itemId]
  return def?.name ?? itemId
}

/**
 * 아이템 획득 — 원작은 초상 없는 **중앙 1줄 창**으로 「{아이템}을(를) 손에 넣었습니다!」만 띄운다.
 * 실제 적재는 eventContinue를 받은 코어(battle.ts)가 한다.
 */
function ItemGetModal({
  itemId,
  kind,
  onDone,
}: {
  itemId: string
  kind: 'equipment' | 'consumable'
  onDone: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Spacebar') return
      if (document.activeElement instanceof HTMLButtonElement) return
      e.preventDefault()
      onDone()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  return (
    <>
      <div
        className="sb-catcher"
        onClick={onDone}
        onContextMenu={(e) => {
          e.preventDefault()
          onDone()
        }}
      />
      <div className="item-get-window" onClick={onDone}>
        {`${eulReul(itemNameOf(itemId, kind))} 손에 넣었습니다!`}
      </div>
    </>
  )
}

export function EventOverlay({ state, title, onContinue }: Props) {
  const pending = state.pendingEvents[0]
  const head = pending?.queue[0]
  if (!pending || !head) return null

  // 큐가 한 칸 줄면(다음 표시형으로 이동) 표시 컴포넌트를 remount해 첫 줄부터 재생한다
  const playKey = `${pending.eventId}:${pending.queue.length}`

  let body: ReactNode = null
  switch (head.type) {
    case 'dialogue':
      body = (
        <BubbleDialoguePlayer
          key={playKey}
          lines={head.lines}
          state={state}
          title={title}
          onDone={() => onContinue()}
        />
      )
      break

    case 'duel':
      // 결과(경험치·격파·퇴각 로그)는 코어가 eventContinue에서 적용한다 — UI는 대사만 재생한다
      body = (
        <BubbleDialoguePlayer
          key={playKey}
          lines={head.lines}
          state={state}
          title={`일기토 · ${nameOf(head.a)} vs ${nameOf(head.b)}`}
          onDone={() => onContinue()}
        />
      )
      break

    case 'choice':
      // 전투 내 선택지는 전면 dim이 아니라 보드 하단 소형 크림 창이다 (CSS 오버라이드, 구조는 공용)
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

    case 'giveItem':
      body = <ItemGetModal key={playKey} itemId={head.itemId} kind={head.kind} onDone={() => onContinue()} />
      break

    default:
      return null // 즉시형이 헤드에 남아 있으면 안 된다 (방어)
  }

  return (
    <>
      {/*
        (a) 입력 차단막 — position:fixed 라서 보드 안에 있어도 뷰포트 기준이다(조상에 transform 없음).
        전장·측면 패널·헤더 클릭이 이벤트 중에 먹지 않게 막는 투명 레이어다.
      */}
      <div className="event-overlay" onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()} />
      {/* (b) 보드 좌표계 표시 레이어 — 차단막보다 위에 와야 말풍선/버튼이 실제로 눌린다 */}
      <div
        className="event-layer"
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        role="dialog"
        aria-modal="true"
        aria-label="전투 이벤트"
      >
        {body}
      </div>
    </>
  )
}
