// Playwright 스모크 검증 — dev server(5173)에 실제 브라우저로 접속해 핵심 흐름 확인.
// 실행: node scripts/pw-smoke.mjs  (npm run dev 상태 필요)
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'shots')

const BASE = process.env.EKD5_URL ?? 'http://localhost:5173'

async function shot(page, name) {
  if (!process.env.EKD5_NO_SHOTS) {
    await page.screenshot({ path: join(OUT, name), fullPage: true })
  }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.on('pageerror', (e) => console.log('  [PAGEERROR]', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('  [CONSOLE.ERROR]', m.text())
})

const results = []
const ok = (label, cond) => {
  results.push({ label, ok: !!cond })
  console.log(cond ? '  ✓' : '  ✗', label)
}

try {
  console.log('1) 타이틀 로드')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('.title-screen', { timeout: 8000 })
  ok('타이틀 화면 표시', true)
  await shot(page, 'title.png')
  console.log('  title:', await page.title())

  console.log('2) 새 게임 시작')
  // 세이브가 있을 수 있으므로 처음부터 버튼 클릭 (모달 확인 대비)
  const fresh = page.locator('button', { hasText: '처음부터' })
  await fresh.click()
  // 모달 if exists
  const modalNew = page.locator('.result-overlay button', { hasText: '새로 시작' })
  if (await modalNew.count()) { await modalNew.click() }
  await page.waitForSelector('.campaign-screen, .dialogue-screen', { timeout: 8000 })
  const url = page.url()
  ok('캠페인/스토리 화면 진입', url.startsWith(BASE))
  await shot(page, 'camp.png')

  console.log('3) 자유 전투 진입')
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  await page.waitForSelector('.title-screen')
  await page.locator('button', { hasText: '자유 전투' }).click()
  await page.waitForSelector('.stage-select .stage-card')
  const cardCount = await page.locator('.stage-select .stage-card').count()
  ok(`자유 전투 스테이지 카드 ${cardCount}개 표시`, cardCount > 0)
  await shot(page, 'stones.png')

  // 첫 스테이지 진입
  await page.locator('.stage-select .stage-card').first().click()
  await page.waitForSelector('.battle-screen .stage-name-bar', { timeout: 8000 })
  ok('전투 보드 진입', true)
  const battleName = (await page.locator('.battle-screen .stage-name-bar').textContent())?.trim()
  const turnText = (await page.locator('.battle-screen .turn-count').textContent())?.trim()
  const unitCount = await page.locator('.battle-screen .unit-token').count()
  const tileCount = await page.locator('.battle-screen .tile').count()
  console.log(`  전투명: ${battleName} | ${turnText} | 유닛 ${unitCount} | 타일 ${tileCount}`)
  ok('전투명 표시: ' + (battleName ?? ''), !!battleName)
  ok(`전투 유닛 렌더링 (${unitCount}기)`, unitCount > 0)
  ok(`전투 타일 렌더링 (${tileCount}칸)`, tileCount > 0)
  await shot(page, 'battle.png')

} finally {
  console.log('\n=== 결과 ===')
  const failed = results.filter((r) => !r.ok)
  console.log(`${results.length - failed.length}/${results.length} 통과`)
  await browser.close()
  if (failed.length > 0) process.exit(1)
}