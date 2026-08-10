// 스테이지 로더 — v1.1부터 스테이지 정의는 json/*.json 이다 (stageXX.ts 이관 완료).
// 번들 시점에 Vite가 json 전부를 인라인하고, validateStage를 통과한 것만 STAGES에 들어간다.
// 검증 실패는 데이터 사고이므로 dev에서 무엇이 틀렸는지 콘솔에 찍고, 프로덕션에서는 조용히 드롭한다
// (반쯤 깨진 스테이지로 전투를 시작하는 것보다 목록에서 사라지는 편이 안전하다).
//
// JSON을 손으로 고쳐도 되지만, 스테이지 데이터의 생성/재생성은 scripts/export-stages.mjs가 맡는다.

import type { StageDef } from '../../core/types'
import { reportInvalidStage, validateStageVerbose } from './validateStage'

const modules = import.meta.glob<{ default: unknown }>('./json/*.json', { eager: true })

function loadBundledStages(): StageDef[] {
  const stages: StageDef[] = []
  const seen = new Set<string>()
  for (const [path, mod] of Object.entries(modules)) {
    const { stage, errors } = validateStageVerbose(mod.default)
    if (!stage) {
      reportInvalidStage(errors, path)
      continue
    }
    if (seen.has(stage.id)) {
      reportInvalidStage([`스테이지 id '${stage.id}' 중복 — 먼저 읽은 정의를 유지한다`], path)
      continue
    }
    seen.add(stage.id)
    stages.push(stage)
  }
  return stages.sort((a, b) => a.id.localeCompare(b.id))
}

export const STAGES: StageDef[] = loadBundledStages()

/** id로 스테이지 찾기 — 번들 스테이지만 본다 (커스텀 스테이지는 persistence 경유) */
export function stageById(id: string): StageDef | undefined {
  return STAGES.find((s) => s.id === id)
}
