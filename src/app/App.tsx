import { useEffect, useState } from 'react'
import type { CampaignState } from '../core/campaign'
import {
  applyVictory,
  completeChoice,
  completeStory,
  currentNode,
  isCampaignFinished,
  newCampaign,
  scriptIdFor,
  stageForNode,
} from '../core/campaign'
import type { BattleState, StageDef } from '../core/types'
import { STAGES } from '../data/stages'
import { STORY_SCRIPTS } from '../data/story'
import { BattleScreen } from '../ui/BattleScreen'
import { CampaignScreen } from '../ui/CampaignScreen'
import '../ui/campaign.css'
import { ChoiceScreen } from '../ui/ChoiceScreen'
import { DeployScreen } from '../ui/DeployScreen'
import { DialogueScreen } from '../ui/DialogueScreen'
import { EditorScreen } from '../ui/editor/EditorScreen'
import { loadCampaign, loadCustomStages, loadSaveMeta, saveCampaign } from './persistence'

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

type Screen =
  | { s: 'title' }
  | { s: 'freeSelect' }
  | { s: 'freeBattle'; stage: StageDef; seed: number }
  | { s: 'camp'; campaign: CampaignState; savedAt: number | null }
  | { s: 'story'; campaign: CampaignState; savedAt: number | null }
  | { s: 'choice'; campaign: CampaignState; savedAt: number | null }
  | { s: 'deploy'; campaign: CampaignState; stage: StageDef; savedAt: number | null }
  | {
      s: 'campaignBattle'
      campaign: CampaignState
      stage: StageDef
      seed: number
      deployment: string[]
      savedAt: number | null
    }
  // 앱 내 스테이지 에디터 (개발 모드 전용 진입 — 설계 §6)
  | { s: 'editor' }
  | { s: 'editorTest'; stage: StageDef; seed: number }

const STAGE_DESC: Record<string, string> = {
  stage01: '강과 다리 길목을 건너 황건적을 전멸시켜라. (이동/지형/상성/책략 기본기)',
  stage02: '8턴 방어 또는 적장 정원지 격파. 턴 3/5에 적 증원. (방어전/웨이브/2차 조건)',
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ s: 'title' })
  const [confirmNewGame, setConfirmNewGame] = useState(false)
  // 에디터 draft는 App이 보관한다 — 플레이테스트로 EditorScreen이 언마운트돼도 편집 내용이 살아야 한다
  const [editorDraft, setEditorDraft] = useState<StageDef | null>(null)
  const [customStages, setCustomStages] = useState<StageDef[]>([])

  // 자유 전투 목록 진입 시 커스텀 스테이지를 읽어 병합 (검증 통과분만 — loadCustomStages가 걸러 준다)
  useEffect(() => {
    if (screen.s !== 'freeSelect') return
    let alive = true
    void loadCustomStages().then((list) => {
      if (alive) setCustomStages(list)
    })
    return () => {
      alive = false
    }
  }, [screen.s])

  async function startNewCampaign() {
    setConfirmNewGame(false)
    const campaign = newCampaign()
    await saveCampaign(campaign)
    setScreen({ s: 'camp', campaign, savedAt: Date.now() })
  }

  async function continueCampaign() {
    const campaign = await loadCampaign()
    if (campaign) {
      setScreen({ s: 'camp', campaign, savedAt: loadSaveMeta()?.savedAt ?? null })
    } else {
      // 세이브 손상/버전 불일치 → 새 게임 유도
      setScreen({ s: 'title' })
    }
  }

  // ---------- 타이틀 ----------

  if (screen.s === 'title') {
    const meta = loadSaveMeta()
    return (
      <div className="title-screen">
        <h1>영걸전풍 SRPG</h1>
        <p className="subtitle">— 조조전 시스템 웹 리메이크 (개발 중) —</p>
        <div className="title-menu">
          <button disabled={!meta} onClick={continueCampaign} autoFocus={!!meta}>
            이어하기
            {meta && (
              <span className="continue-meta">
                {meta.stageName} · {new Date(meta.savedAt).toLocaleString('ko-KR')}
              </span>
            )}
          </button>
          <button
            autoFocus={!meta}
            onClick={() => (meta ? setConfirmNewGame(true) : startNewCampaign())}
          >
            처음부터
          </button>
          <button onClick={() => setScreen({ s: 'freeSelect' })}>자유 전투 (테스트)</button>
          {import.meta.env.DEV && (
            <button onClick={() => setScreen({ s: 'editor' })}>스테이지 에디터 (개발)</button>
          )}
        </div>

        {confirmNewGame && (
          <div className="result-overlay">
            <div className="result-box">
              <h2>새로 시작할까요?</h2>
              <p>진행 중인 기록이 있습니다. 새로 시작하면 자동 저장이 덮어써집니다.</p>
              <button autoFocus onClick={() => setConfirmNewGame(false)}>
                취소
              </button>
              <button onClick={startNewCampaign}>새로 시작</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ---------- 자유 전투 (기존 스테이지 선택) ----------

  if (screen.s === 'freeSelect') {
    return (
      <div className="stage-select">
        <h1>자유 전투</h1>
        <p>스테이지를 선택하세요.</p>
        {STAGES.map((s) => (
          <button key={s.id} className="stage-card" onClick={() => setScreen({ s: 'freeBattle', stage: s, seed: newSeed() })}>
            <strong>{s.name}</strong>
            <div className="stage-desc">{STAGE_DESC[s.id]}</div>
          </button>
        ))}
        {customStages.length > 0 && <h2>커스텀 스테이지</h2>}
        {customStages.map((s) => (
          <button key={s.id} className="stage-card" onClick={() => setScreen({ s: 'freeBattle', stage: s, seed: newSeed() })}>
            <strong>{s.name}</strong>
            <div className="stage-desc">에디터에서 만든 스테이지 ({s.id})</div>
          </button>
        ))}
        <button className="stage-card" onClick={() => setScreen({ s: 'title' })}>
          ← 타이틀로
        </button>
      </div>
    )
  }

  if (screen.s === 'freeBattle') {
    return (
      <BattleScreen
        key={`${screen.stage.id}-${screen.seed}`}
        stage={screen.stage}
        seed={screen.seed}
        onExit={() => setScreen({ s: 'freeSelect' })}
        onRestart={() => setScreen({ ...screen, seed: newSeed() })}
      />
    )
  }

  // ---------- 스테이지 에디터 (개발 모드) ----------

  if (screen.s === 'editor') {
    return (
      <EditorScreen
        initial={editorDraft ?? undefined}
        onPlaytest={(stage) => {
          setEditorDraft(stage)
          setScreen({ s: 'editorTest', stage, seed: newSeed() })
        }}
        onExit={(draft) => {
          setEditorDraft(draft)
          setScreen({ s: 'title' })
        }}
      />
    )
  }

  // 플레이테스트 — 자유 전투와 동일한 Props로 마운트하고, 나가면 draft를 유지한 에디터로 돌아간다
  if (screen.s === 'editorTest') {
    return (
      <BattleScreen
        key={`${screen.stage.id}-${screen.seed}`}
        stage={screen.stage}
        seed={screen.seed}
        onExit={() => setScreen({ s: 'editor' })}
        onRestart={() => setScreen({ ...screen, seed: newSeed() })}
      />
    )
  }

  // ---------- 캠페인 ----------

  if (screen.s === 'camp') {
    return (
      <CampaignScreen
        campaign={screen.campaign}
        savedAt={screen.savedAt}
        onUpdate={(next) => {
          // 거래/장착은 즉시 화면 반영, 저장 완료 시 인디케이터 갱신
          setScreen({ s: 'camp', campaign: next, savedAt: screen.savedAt })
          void saveCampaign(next).then(() => {
            setScreen((cur) =>
              cur.s === 'camp' && cur.campaign === next ? { ...cur, savedAt: Date.now() } : cur,
            )
          })
        }}
        onTitle={() => setScreen({ s: 'title' })}
        onSortie={() => {
          const node = currentNode(screen.campaign)
          if (!node || isCampaignFinished(screen.campaign)) return
          if (node.type === 'story') {
            setScreen({ s: 'story', campaign: screen.campaign, savedAt: screen.savedAt })
          } else if (node.type === 'choice') {
            setScreen({ s: 'choice', campaign: screen.campaign, savedAt: screen.savedAt })
          } else if (node.type === 'battle') {
            setScreen({ s: 'deploy', campaign: screen.campaign, stage: stageForNode(node), savedAt: screen.savedAt })
          }
        }}
      />
    )
  }

  if (screen.s === 'story') {
    const node = currentNode(screen.campaign)
    if (!node || node.type !== 'story') {
      setScreen({ s: 'camp', campaign: screen.campaign, savedAt: screen.savedAt })
      return null
    }
    return (
      <DialogueScreen
        title={node.title}
        script={STORY_SCRIPTS[scriptIdFor(node, screen.campaign) ?? node.scriptId] ?? []}
        onDone={() => {
          const next = completeStory(screen.campaign)
          void saveCampaign(next).then(() => {
            setScreen({ s: 'camp', campaign: next, savedAt: Date.now() })
          })
        }}
      />
    )
  }

  if (screen.s === 'choice') {
    const node = currentNode(screen.campaign)
    if (!node || node.type !== 'choice') {
      setScreen({ s: 'camp', campaign: screen.campaign, savedAt: screen.savedAt })
      return null
    }
    return (
      <ChoiceScreen
        title={node.title}
        prompt={node.prompt}
        speaker={node.speaker}
        options={node.options}
        onPick={(index) => {
          const next = completeChoice(screen.campaign, index)
          void saveCampaign(next).then(() => {
            setScreen({ s: 'camp', campaign: next, savedAt: Date.now() })
          })
        }}
      />
    )
  }

  if (screen.s === 'deploy') {
    return (
      <DeployScreen
        stage={screen.stage}
        roster={screen.campaign.roster}
        onBack={() => setScreen({ s: 'camp', campaign: screen.campaign, savedAt: screen.savedAt })}
        onConfirm={(deployment) =>
          setScreen({
            s: 'campaignBattle',
            campaign: screen.campaign,
            stage: screen.stage,
            seed: newSeed(),
            deployment,
            savedAt: screen.savedAt,
          })
        }
      />
    )
  }

  // campaignBattle
  function handleFinish(result: 'victory' | 'defeat', battleState: BattleState) {
    if (screen.s !== 'campaignBattle') return
    if (result === 'victory') {
      const next = applyVictory(screen.campaign, battleState)
      void saveCampaign(next).then(() => {
        setScreen({ s: 'camp', campaign: next, savedAt: Date.now() })
      })
    } else {
      setScreen({ s: 'camp', campaign: screen.campaign, savedAt: screen.savedAt })
    }
  }

  return (
    <BattleScreen
      key={`${screen.stage.id}-${screen.seed}`}
      stage={screen.stage}
      seed={screen.seed}
      roster={screen.campaign.roster}
      deployment={screen.deployment}
      consumables={screen.campaign.consumables}
      onFinish={handleFinish}
      onExit={() => setScreen({ s: 'camp', campaign: screen.campaign, savedAt: screen.savedAt })}
      onRestart={() => setScreen({ ...screen, seed: newSeed() })}
    />
  )
}
