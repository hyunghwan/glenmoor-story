import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const outputDir = path.resolve('output/web-game/playthrough')
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

async function readState() {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()))
}

async function saveState(name) {
  fs.writeFileSync(path.join(outputDir, `${name}.json`), JSON.stringify(await readState(), null, 2))
}

async function saveShot(name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false })
}

async function advanceTime(ms) {
  await page.evaluate((value) => window.advanceTime(value), ms)
  await page.waitForTimeout(40)
}

async function advanceUntil(predicate, message, maxIterations = 24) {
  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const state = await readState()

    if (predicate(state)) {
      return state
    }

    await advanceTime(300)
  }

  throw new Error(message)
}

async function waitForDuelActivation() {
  return page.waitForFunction(() => JSON.parse(window.render_game_to_text()).telemetry.duel?.active === true)
}

async function captureDuelSequence(prefix) {
  await waitForDuelActivation()
  let state = await readState()
  await saveShot(`${prefix}-duel-start`)
  await saveState(`${prefix}-duel-start`)

  const midStep = Math.min(2, state.telemetry.duel.stepCount)
  state = await advanceUntil(
    (current) => current.telemetry.duel?.active === true && current.telemetry.duel.stepIndex >= midStep,
    `Timed out waiting for duel mid-step (${prefix})`,
  )
  await saveShot(`${prefix}-duel-mid`)
  await saveState(`${prefix}-duel-mid`)

  state = await advanceUntil(
    (current) =>
      current.telemetry.duel?.active === true &&
      current.telemetry.duel.stepIndex >= current.telemetry.duel.stepCount,
    `Timed out waiting for duel final step (${prefix})`,
  )
  await saveShot(`${prefix}-duel-end`)
  await saveState(`${prefix}-duel-end`)

  await advanceUntil(
    (current) => current.telemetry.duel?.active !== true,
    `Timed out waiting for duel completion (${prefix})`,
  )
}

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => Boolean(window.__glenmoorDebug))

await saveShot('01-briefing-en')
await saveState('01-briefing-en')

await page.evaluate(() => window.__glenmoorDebug.command('start-battle'))
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud.phase === 'active')
await saveShot('02-battle-en')
await saveState('02-battle-en')

await page.evaluate(() => window.__glenmoorDebug.locale('ko'))
await page.waitForTimeout(150)
await saveShot('03-battle-ko')
await saveState('03-battle-ko')

await page.evaluate(() => {
  window.__glenmoorDebug.locale('en')
  window.__glenmoorDebug.stage('engagement')
})
await page.waitForTimeout(120)
await saveShot('04-engagement-before')
await saveState('04-engagement-before')

await page.evaluate(() => {
  window.__glenmoorDebug.command('attack')
  window.__glenmoorDebug.tile(7, 7)
})
await captureDuelSequence('05-engagement')
await saveShot('06-engagement-after')
await saveState('06-engagement-after')

await page.evaluate(() => window.__glenmoorDebug.stage('skill-demo'))
await page.waitForTimeout(120)
await saveShot('07-skill-before')
await page.evaluate(() => {
  window.__glenmoorDebug.command('skill')
  window.__glenmoorDebug.tile(8, 7)
})
await captureDuelSequence('08-skill')
await saveShot('09-skill-after')
await saveState('09-skill-after')

await page.evaluate(() => window.__glenmoorDebug.stage('push-demo'))
await page.waitForTimeout(120)
await page.evaluate(() => {
  window.__glenmoorDebug.command('skill')
  window.__glenmoorDebug.tile(0, 0)
})
await captureDuelSequence('10-push')
await saveShot('10-push-after')
await saveState('10-push-after')

await page.evaluate(() => window.__glenmoorDebug.stage('victory-demo'))
await page.waitForTimeout(120)
await page.evaluate(() => {
  window.__glenmoorDebug.command('attack')
  window.__glenmoorDebug.tile(7, 7)
})
await captureDuelSequence('11-victory')
await saveShot('11-victory')
await saveState('11-victory')

await browser.close()
