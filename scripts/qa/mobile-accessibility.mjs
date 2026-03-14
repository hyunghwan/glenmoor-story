import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import { projectTilesToClient } from './projection.mjs'

const outputDir = path.resolve('output/web-game/mobile-accessibility')
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173'

fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function isVisiblePoint(viewport, point) {
  return point.x >= 0 && point.x <= viewport.width && point.y >= 0 && point.y <= viewport.height
}

async function readState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()))
}

async function saveShot(page, name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false })
}

async function saveJson(name, payload) {
  fs.writeFileSync(path.join(outputDir, `${name}.json`), JSON.stringify(payload, null, 2))
}

async function dragTouch(client, start, end, steps = 8) {
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: Math.round(start.x), y: Math.round(start.y), radiusX: 10, radiusY: 10, force: 1, id: 1 }],
  })

  for (let index = 1; index <= steps; index += 1) {
    const ratio = index / steps
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          x: Math.round(start.x + (end.x - start.x) * ratio),
          y: Math.round(start.y + (end.y - start.y) * ratio),
          radiusX: 10,
          radiusY: 10,
          force: 1,
          id: 1,
        },
      ],
    })
  }

  await client.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  })
}

async function startBattle(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.modal?.kind === 'briefing')
  await page.locator('[data-command="start-battle"]').tap()
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.phase === 'active')
  await page.waitForTimeout(150)
}

async function collectMetrics(page) {
  const state = await readState(page)
  const viewport = page.viewportSize()
  const battlefieldRect = state.telemetry.battlefieldRect
  const quickButtons = await page.locator('.hud-icon-button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    }),
  )
  const dockButtons = await page.locator('.hud-action-dock .hud-command-button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const rect = button.getBoundingClientRect()
      return { width: Math.round(rect.width), height: Math.round(rect.height) }
    }),
  )
  const board = state.telemetry.boardProjection
  const samplePoints = [
    { x: 7, y: 8 },
    { x: 8, y: 8 },
  ]
  const projections = await projectTilesToClient(page, state, samplePoints)
  const tileSpacing = Math.round(
    Math.hypot(
      projections[1].client.x - projections[0].client.x,
      projections[1].client.y - projections[0].client.y,
    ) * 10,
  ) / 10

  return {
    viewport,
    battlefieldRect,
    quickButtons,
    dockButtons,
    tileSpacing,
    board,
    liveMessage: state.hud?.accessiblePanel?.liveMessage ?? '',
    uiState: state.uiState,
  }
}

async function runAccessibleTurn(page) {
  await page.locator('[data-ui-toggle="accessible-panel"]').tap()
  await page.waitForSelector('.hud-access-panel')
  const moveOptions = page.locator('.hud-access-option')
  await moveOptions.first().tap()
  await page.waitForTimeout(120)
  await page.locator('.hud-access-panel [data-command="attack"]').tap()
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.mode === 'attack')
  const targetOptions = page.locator('.hud-access-option')
  await targetOptions.first().tap()
  await page.waitForTimeout(220)
}

async function assertTouchPan(page, client, scenarioId) {
  const before = await readState(page)
  const rect = before.telemetry.battlefieldRect
  const start = {
    x: rect.left + rect.width * 0.62,
    y: rect.top + rect.height * 0.48,
  }
  const end = {
    x: start.x - Math.min(96, rect.width * 0.18),
    y: start.y + Math.min(72, rect.height * 0.14),
  }

  await dragTouch(client, start, end)
  await page.waitForTimeout(120)

  const after = await readState(page)
  const deltaX = Math.abs((after.telemetry.camera?.scrollX ?? 0) - (before.telemetry.camera?.scrollX ?? 0))
  const deltaY = Math.abs((after.telemetry.camera?.scrollY ?? 0) - (before.telemetry.camera?.scrollY ?? 0))
  assert(deltaX > 4 || deltaY > 4, `Expected ${scenarioId} touch drag to pan the battlefield camera`)
}

async function assertViewClusterChrome(page, scenarioId) {
  const chrome = await page.locator('.hud-view-cluster').evaluate((element) => {
    const style = window.getComputedStyle(element)
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
    }
  })

  assert(
    chrome.backgroundImage === 'none' &&
      (chrome.backgroundColor === 'rgba(0, 0, 0, 0)' || chrome.backgroundColor === 'transparent'),
    `Expected ${scenarioId} view controls wrapper to render without a background`,
  )
  assert(chrome.boxShadow === 'none', `Expected ${scenarioId} view controls wrapper to render without a box shadow`)
}

const scenarios = [
  { id: 'iphone12-portrait', device: devices['iPhone 12'], minTileSpacing: 22, minBattlefieldRatio: 0.55 },
  {
    id: 'iphone12-landscape',
    device: { ...devices['iPhone 12'], viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
    minTileSpacing: 18,
    minBattlefieldRatio: 0.7,
  },
  { id: 'pixel7-portrait', device: devices['Pixel 7'], minTileSpacing: 22, minBattlefieldRatio: 0.55 },
]

const browser = await chromium.launch({ headless: true })

for (const scenario of scenarios) {
  const context = await browser.newContext({ ...scenario.device })
  const page = await context.newPage()
  const client = await context.newCDPSession(page)
  const consoleErrors = []

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })
  page.on('pageerror', (error) => {
    consoleErrors.push(String(error))
  })

  await startBattle(page)
  await saveShot(page, `${scenario.id}-battle`)

  const before = await collectMetrics(page)
  await saveJson(`${scenario.id}-metrics-before`, before)

  assert(consoleErrors.length === 0, `Expected no console errors for ${scenario.id}`)
  assert(before.tileSpacing >= scenario.minTileSpacing, `Expected ${scenario.id} tile spacing >= ${scenario.minTileSpacing}`)
  assert(
    before.battlefieldRect.height / before.viewport.height >= scenario.minBattlefieldRatio,
    `Expected ${scenario.id} battlefield ratio >= ${scenario.minBattlefieldRatio}`,
  )

  for (const button of [...before.quickButtons, ...before.dockButtons]) {
    assert(button.width >= 48 || button.height >= 48, `Expected ${scenario.id} controls to satisfy 48px touch target`)
  }

  await assertTouchPan(page, client, scenario.id)
  await assertViewClusterChrome(page, scenario.id)

  await page.locator('[data-locale="ko"]').tap()
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.locale === 'ko')
  await page.locator('[data-locale="en"]').tap()
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.locale === 'en')

  await page.evaluate(() => window.__glenmoorDebug.stage('engagement'))
  await page.waitForTimeout(150)
  await runAccessibleTurn(page)
  const after = await collectMetrics(page)
  await saveShot(page, `${scenario.id}-accessible-turn`)
  await saveJson(`${scenario.id}-metrics-after`, after)

  assert(after.uiState.accessibilityPanelOpen === true, `Expected ${scenario.id} accessibility panel to remain open`)
  assert(after.liveMessage.length > 0, `Expected ${scenario.id} live region message`)
  assert(isVisiblePoint(after.viewport, { x: after.battlefieldRect.left + 4, y: after.battlefieldRect.top + 4 }), `Expected ${scenario.id} battlefield to remain in viewport`)

  await context.close()
}

await browser.close()
