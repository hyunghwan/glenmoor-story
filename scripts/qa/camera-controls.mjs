import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const outputDir = path.resolve('output/web-game/camera-controls')
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

async function clickTile(page, x, y) {
  const projection = await page.evaluate(
    ([tileX, tileY]) => window.__glenmoorDebug.projectTile(tileX, tileY),
    [x, y],
  )
  assert(projection, `Missing projection for tile ${x},${y}`)
  await page.mouse.click(projection.client.x, projection.client.y)
  await page.waitForTimeout(150)
}

async function startBattle(page) {
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__glenmoorDebug?.projectTile))
  await page.getByRole('button', { name: 'Commence Battle' }).click()
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud.phase === 'active')
}

async function runDesktop1600(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
  await startBattle(page)

  let state = await readState(page)
  assert(state.telemetry.mode === 'move', 'Expected allied turn to auto-open move mode at 1600x900')
  assert(state.telemetry.reachableTiles.length > 0, 'Expected reachable tiles at 1600x900 battle start')
  await saveShot(page, '01-battle-1600x900')
  await saveState(page, '01-battle-1600x900')

  await clickTile(page, 5, 12)
  state = await readState(page)
  assert(state.telemetry.units.find((unit) => unit.id === 'sable')?.position.x === 5, 'Expected Sable to move to x=5')
  assert(state.telemetry.units.find((unit) => unit.id === 'sable')?.position.y === 12, 'Expected Sable to stay on y=12')

  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 1, 'Expected rotation to advance to 90 degrees')

  await clickTile(page, 3, 12)
  state = await readState(page)
  assert(state.telemetry.units.find((unit) => unit.id === 'sable')?.position.x === 3, 'Expected rotated tile click to move Sable to x=3')
  assert(state.telemetry.units.find((unit) => unit.id === 'sable')?.position.y === 12, 'Expected rotated tile click to keep y=12')

  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 2, 'Expected rotation to advance to 180 degrees')

  await clickTile(page, 4, 12)
  state = await readState(page)
  assert(
    state.telemetry.units.find((unit) => unit.id === 'sable')?.position.x === 4 &&
      state.telemetry.units.find((unit) => unit.id === 'sable')?.position.y === 12,
    'Expected 180-degree tile click to move Sable back to 4,12',
  )

  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 3, 'Expected rotation to advance to 270 degrees')

  await clickTile(page, 5, 12)
  state = await readState(page)
  assert(
    state.telemetry.units.find((unit) => unit.id === 'sable')?.position.x === 5 &&
      state.telemetry.units.find((unit) => unit.id === 'sable')?.position.y === 12,
    'Expected 270-degree tile click to move Sable back to 5,12',
  )
  await saveShot(page, '02-rotated-1600x900')
  await saveState(page, '02-rotated-1600x900')

  await page.mouse.move(780, 400)
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(120)
  state = await readState(page)
  assert(state.telemetry.camera.zoom > 1, 'Expected wheel zoom to increase camera zoom')

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
  await saveShot(page, '03-zoom-pan-1600x900')
  await saveState(page, '03-zoom-pan-1600x900')

  await page.getByRole('button', { name: 'Pan' }).click()
  await page.waitForTimeout(120)
  state = await readState(page)
  assert(state.telemetry.camera.panModeActive, 'Expected Pan toggle to enable pan mode')

  await clickTile(page, 4, 12)
  const afterPanClick = await readState(page)
  const sablePosition = afterPanClick.telemetry.units.find((unit) => unit.id === 'sable')?.position
  assert(
    sablePosition?.x === 5 && sablePosition?.y === 12,
    'Expected tactical tile click to be suppressed while pan mode is active',
  )
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
  assert(state.telemetry.mode === 'move', 'Expected allied turn to auto-open move mode at 1280x720')
  assert(state.hud.initiative.slice(0, 4).length === 4, 'Expected initiative queue to expose the current actor plus three upcoming turns')

  await clickTile(page, 5, 12)
  await page.getByRole('button', { name: 'Rotate Right' }).click()
  await page.waitForTimeout(150)
  state = await readState(page)
  assert(state.telemetry.camera.rotationQuarterTurns === 1, 'Expected rotation to work at 1280x720')

  await clickTile(page, 3, 12)
  state = await readState(page)
  assert(state.telemetry.units.find((unit) => unit.id === 'sable')?.position.x === 3, 'Expected rotated tile click to work at 1280x720')
  await saveShot(page, '06-rotated-1280x720')
  await saveState(page, '06-rotated-1280x720')

  await page.close()
}

const browser = await chromium.launch({ headless: true })

try {
  await runDesktop1600(browser)
  await runDesktop1280(browser)
} finally {
  await browser.close()
}
