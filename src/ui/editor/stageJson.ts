// 에디터 ↔ 데이터 계층 접합부.
//
// 문자↔지형 대응의 단일 출처는 src/data/stages/parseMap.ts(CHAR_TO_TERRAIN)이고,
// StageDef → JSON 직렬화는 src/data/stages/validateStage.ts(stageToJson)다.
// (v1.1 작업 중 W4 완료 전까지 이 파일에 있던 에디터 로컬 역맵/직렬화는 제거되었다 — 표가 갈라지는 사고 방지)

import type { StageDef, TerrainId } from '../../core/types'
import { CHAR_TO_TERRAIN } from '../../data/stages/parseMap'
import { stageToJson } from '../../data/stages/validateStage'

export { CHAR_TO_TERRAIN, TERRAIN_TO_CHAR, mapToRows } from '../../data/stages/parseMap'
export { stageToJson }

/** 지형 팔레트 목록 — 문자표에서 파생 (지형이 추가되면 팔레트에 자동 반영) */
export const PALETTE_TERRAINS: TerrainId[] = Object.values(CHAR_TO_TERRAIN)

/** 내보내기/클립보드용 텍스트 — 번들 스테이지 JSON과 같은 필드 순서 */
export function stageJsonText(stage: StageDef): string {
  return JSON.stringify(stageToJson(stage), null, 2)
}
