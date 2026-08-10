// 스테이지 정의 → JSON 내보내기 + 왕복 검증 (v1.1 JSON 이관 도구)
//
// 실행: npx vite-node scripts/export-stages.mjs
//       (TS 소스를 그대로 import 하기 위해 vite-node를 쓴다 — Vite 해석 규칙이 그대로 적용된다)
//
// 하는 일:
//  1. STAGES를 읽어 src/data/stages/json/<id>.json 을 쓴다 (맵은 mapToRows로 문자 그리드 복원)
//  2. notes 필드는 stage<NN>.ts 상단 블록 주석에서 가져온다.
//     .ts가 이미 삭제된 뒤라면 기존 JSON의 notes를 그대로 유지한다 (이관 후에도 멱등)
//  3. 쓴 JSON을 다시 읽어 validateStage → 원본 StageDef와 정규화 비교 (왕복 무손실 검증)
//
// 수작업 전사 금지 — 스테이지 데이터가 바뀌면 이 스크립트를 다시 돌린다.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { STAGES } from '../src/data/stages/index.ts'
import { stageToJson, validateStageVerbose } from '../src/data/stages/validateStage.ts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const stagesDir = resolve(root, 'src/data/stages')
const outDir = resolve(stagesDir, 'json')

/** stage<NN>.ts 상단의 연속된 `//` 주석 블록 → notes 문자열 */
function notesFromSource(stageId) {
  const tsPath = resolve(stagesDir, `${stageId}.ts`)
  if (!existsSync(tsPath)) return null
  const lines = []
  for (const line of readFileSync(tsPath, 'utf8').split('\n')) {
    if (!line.startsWith('//')) break
    lines.push(line.replace(/^\/\/ ?/, '').trimEnd())
  }
  return lines.length > 0 ? lines.join('\n') : null
}

/** 기존 JSON의 notes (소스 .ts가 사라진 뒤에도 유지하기 위해) */
function notesFromExistingJson(jsonPath) {
  if (!existsSync(jsonPath)) return null
  try {
    const notes = JSON.parse(readFileSync(jsonPath, 'utf8')).notes
    return typeof notes === 'string' && notes.length > 0 ? notes : null
  } catch {
    return null
  }
}

/**
 * 2-스페이스 JSON. 좌표({x, y})만은 한 줄로 접는다 — 4줄로 펼쳐지면 유닛/슬롯 목록이
 * 읽을 수 없게 길어진다. JSON 문법은 그대로다 (검증 단계에서 재파싱으로 보증).
 */
function formatJson(value) {
  const text = JSON.stringify(value, null, 2)
    .replace(/\{\n\s*"x": (-?\d+),\n\s*"y": (-?\d+)\n\s*\}/g, '{ "x": $1, "y": $2 }')
    // 인자 없는 유니온({ "type": "annihilation" } 류)도 한 줄로
    .replace(/\{\n\s*("type": "\w+")\n\s*\}/g, '{ $1 }')
  return `${text}\n`
}

/** 키 순서와 undefined를 지운 정규형 — 왕복 비교용 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) out[key] = canonical(value[key])
    }
    return out
  }
  return value
}

mkdirSync(outDir, { recursive: true })

let failures = 0
for (const stage of STAGES) {
  const jsonPath = resolve(outDir, `${stage.id}.json`)
  const notes = notesFromSource(stage.id) ?? notesFromExistingJson(jsonPath)
  const json = stageToJson(stage, notes ?? undefined)
  writeFileSync(jsonPath, formatJson(json), 'utf8')

  // 왕복 검증 — 쓴 파일을 다시 읽어 StageDef로 되돌리고 원본과 비교한다
  const reparsed = validateStageVerbose(JSON.parse(readFileSync(jsonPath, 'utf8')))
  if (!reparsed.stage) {
    failures += 1
    console.error(`✗ ${stage.id}: 검증 실패\n   - ${reparsed.errors.join('\n   - ')}`)
    continue
  }
  const before = JSON.stringify(canonical(stage))
  const after = JSON.stringify(canonical(reparsed.stage))
  if (before !== after) {
    failures += 1
    console.error(`✗ ${stage.id}: 왕복 불일치`)
    console.error(`   before: ${before}`)
    console.error(`   after : ${after}`)
    continue
  }
  console.log(`✓ ${stage.id} → json/${stage.id}.json (왕복 일치${notes ? ', notes 이관' : ''})`)
}

console.log(`\n${STAGES.length - failures}/${STAGES.length} 스테이지 내보내기 완료`)
if (failures > 0) process.exit(1)
