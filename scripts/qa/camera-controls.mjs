import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const outputDir = path.resolve('output/web-game/camera-controls')
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
const include1280Scenario = process.env.QA_CAMERA_INCLUDE_1280 === '1'
fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function readState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()))
}

async function saveState(page, name) {
  fs.writeFileSync(path.join(outputDir, `${name}.json`), JSON.stringify(await readState(page), null, 2))
}

async function saveShot(page, name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false })
}

function samePoint(left, right) {
  return left?.x === right?.x && left?.y === right?.y
}

function getUnit(state, unitId) {
  return state.telemetry.units.find((unit) => unit.id === unitId)
}

function getInitiativeEntries(state) {
  if (Array.isArray(state.hud?.initiative)) {
    return state.hud.initiative
  }

  if (Array.isArray(state.hud?.initiativeRail?.entries)) {
    return state.hud.initiativeRail.entries
  }

  return []
}

function pickReachableTile(state, unitId, exclusions = []) {
  const unit = getUnit(state, unitId)
  assert(unit, `Missing telemetry for unit ${unitId}`)
  const candidate = state.telemetry.reachableTiles.find(
    (tile) => !samePoint(tile, unit.position) && !exclusions.some((point) => samePoint(point, tile)),
  )
  assert(candidate, `Missing alternate reachable tile for ${unitId}`)
  return candidate
}

function assertPresentationTelemetry(state, expectedKinds = []) {
  assert(Array.isArray(state.telemetry?.activeStatusAuraIds), 'Expected activeStatusAuraIds telemetry array')
  assert(Array.isArray(state.telemetry?.activeTelegraphKinds), 'Expected activeTelegraphKinds telemetry array')

  for (const kind of expectedKinds) {
    assert(
      state.telemetry.activeTelegraphKinds.includes(kind),
      `Expected activeTelegraphKinds to include ${kind}`,
    )
  }
}

async function projectTile(page, x, y) {
  const projection = await page.evaluate(([tileX, tileY]) => window.__glenmoorDebug.projectTile(tileX, tileY), [x, y])
  assert(projection, `Missing projection for tile ${x},${y}`)
  return projection
}

async function clickTile(page, x, y) {
  const projection = await projectTile(page, x, y)
  await page.mouse.click(projection.client.x, projection.client.y)
  await page.waitForTimeout(150)
}

async function hoverTile(page, x, y) {
  const projection = await projectTile(page, x, y)
  await page.mouse.move(projection.client.x, projection.client.y)
  await page.waitForTimeout(150)
}

async function startBattle(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__glenmoorDebug?.projectTile))
  await page.evaluate(() => window.__glenmoorDebug.command('start-battle'))
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text())
    return state.hud?.phase === 'active' || state.telemetry?.phase === 'active'
  })
}

async function runDesktop1600(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await startBattle(page)

  let state = await readState(page)
  const activeUnitId = state.telemetry.activeUnitId
  assert(state.telemetry.mode === 'move', 'Expected allied turn to auto-open move mode at 1600x900')
  assert(state.telemetry.reachableTiles.length > 0, 'Expected reachable tiles at 1600x900 battle start')
  assertPresentationTelemetry(state, ['active-unit', 'move-range'])
  await saveShot(page, '01-battle-1600x900')
  await saveState(page, '01-battle-1600x900')

  let targetTile = pickReachableTile(state, activeUnitId)
  await hoverTile(page, targetTile.x, targetTile.y)
  state = await readState(page)
  assert(samePoint(state.telemetry.hoveredTile, targetTile), 'Expected hovered tile telemetry to match the hovered reachable tile')
  assertPresentationTelemetry(state, ['move-path'])

  await clickTile(page, targetTile.x, targetTile.y)
  state = await readState(page)
  assert(
    samePoint(getUnit(state, activeUnitId)?.position, targetTile),
    `Expected ${activeUnitId} to move to the selected reachable tile`,
  )
  assertPresentationTelemetry(state, ['active-unit'])

  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 1, 'Expected rotation to advance to 90 degrees')
  assertPresentationTelemetry(state, ['active-unit'])

  targetTile = pickReachableTile(state, activeUnitId)
  await clickTile(page, targetTile.x, targetTile.y)
  state = await readState(page)
  assert(
    samePoint(getUnit(state, activeUnitId)?.position, targetTile),
    'Expected rotated tile click to move the active unit to the selected tile',
  )
  assertPresentationTelemetry(state, ['active-unit'])

  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 2, 'Expected rotation to advance to 180 degrees')
  assertPresentationTelemetry(state, ['active-unit'])

  targetTile = pickReachableTile(state, activeUnitId)
  await clickTile(page, targetTile.x, targetTile.y)
  state = await readState(page)
  assert(
    samePoint(getUnit(state, activeUnitId)?.position, targetTile),
    'Expected 180-degree tile click to move the active unit to the selected tile',
  )
  assertPresentationTelemetry(state, ['active-unit'])

  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 3, 'Expected rotation to advance to 270 degrees')
  assertPresentationTelemetry(state, ['active-unit'])

  await page.mouse.move(780, 420)
  await page.waitForTimeout(120)
  state = await readState(page)
  assertPresentationTelemetry(state, ['active-unit'])
  await saveShot(page, '02-rotated-1600x900')
  await saveState(page, '02-rotated-1600x900')

  await page.mouse.move(780, 400)
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(120)
  state = await readState(page)

  if (!(state.telemetry.camera.zoom > 1)) {
    await page.getByRole('button', { name: 'Zoom In' }).click()
    await page.waitForTimeout(120)
    state = await readState(page)
  }

  assert(state.telemetry.camera.zoom > 1, 'Expected wheel zoom to increase camera zoom')
  assertPresentationTelemetry(state, ['active-unit'])

  const panBefore = state.telemetry.camera
  await page.mouse.move(820, 380)
  await page.mouse.down()
  await page.mouse.move(900, 430, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(120)
  state = await readState(page)
  assert(
    state.telemetry.camera.scrollX !== panBefore.scrollX || state.telemetry.camera.scrollY !== panBefore.scrollY,
    'Expected drag beyond threshold to pan the camera',
  )
  assertPresentationTelemetry(state, ['active-unit'])
  await saveShot(page, '03-zoom-pan-1600x900')
  await saveState(page, '03-zoom-pan-1600x900')

  await page.getByRole('button', { name: 'Pan' }).click()
  await page.waitForTimeout(120)
  state = await readState(page)
  assert(state.telemetry.camera.panModeActive, 'Expected Pan toggle to enable pan mode')
  assertPresentationTelemetry(state, ['active-unit'])

  const beforePanClickPosition = getUnit(state, activeUnitId)?.position
  targetTile = pickReachableTile(state, activeUnitId)
  await clickTile(page, targetTile.x, targetTile.y)
  const afterPanClick = await readState(page)
  assert(
    samePoint(getUnit(afterPanClick, activeUnitId)?.position, beforePanClickPosition),
    'Expected tactical tile click to be suppressed while pan mode is active',
  )
  assertPresentationTelemetry(afterPanClick, ['active-unit'])
  await saveShot(page, '04-pan-mode-1600x900')
  await saveState(page, '04-pan-mode-1600x900')

  await page.evaluate(() => window.__glenmoorDebug.command('restart-battle'))
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.hud.phase === 'briefing', 'Expected restart to return to briefing')
  assert(state.telemetry.camera.rotationQuarterTurns === 0, 'Expected restart to reset rotation')
  assert(state.telemetry.camera.zoom === 1, 'Expected restart to reset zoom')
  assert(state.telemetry.camera.panModeActive === false, 'Expected restart to disable pan mode')
  await saveState(page, '05-restart-reset-1600x900')

  await page.close()
}

async function runDesktop1280(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await startBattle(page)

  let state = await readState(page)
  const activeUnitId = state.telemetry.activeUnitId
  const initiativeEntries = getInitiativeEntries(state)
  assert(state.telemetry.mode === 'move', 'Expected allied turn to auto-open move mode at 1280x720')
  assert(
    initiativeEntries.slice(0, 4).length === 4,
    'Expected initiative queue to expose the current actor plus three upcoming turns',
  )
  assertPresentationTelemetry(state, ['active-unit', 'move-range'])

  let targetTile = pickReachableTile(state, activeUnitId)
  await clickTile(page, targetTile.x, targetTile.y)
  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 1, 'Expected rotation to work at 1280x720')
  assertPresentationTelemetry(state, ['active-unit'])

  targetTile = pickReachableTile(state, activeUnitId)
  await clickTile(page, targetTile.x, targetTile.y)
  state = await readState(page)
  assert(
    samePoint(getUnit(state, activeUnitId)?.position, targetTile),
    'Expected rotated tile click to work at 1280x720',
  )
  assertPresentationTelemetry(state, ['active-unit'])
  await saveShot(page, '06-rotated-1280x720')
  await saveState(page, '06-rotated-1280x720')

  await page.close()
}

const browser = await chromium.launch({ headless: true })

try {
  await runDesktop1600(browser)

  if (include1280Scenario) {
    await runDesktop1280(browser)
  }
} finally {
  await browser.close()
}
