import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { clickProjectedTile, getUnitPosition } from './projection.mjs'

const outputDir = path.resolve('output/web-game/playthrough')
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

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

function assertDuelTelemetry(state, label, { requireStepFields = true } = {}) {
  const duel = state.telemetry?.duel
  assert(duel?.active === true, `Expected duel telemetry to be active for ${label}`)
  assert(typeof duel.stepIndex === 'number' && duel.stepIndex >= 1, `Expected duel stepIndex for ${label}`)
  assert(
    typeof duel.stepCount === 'number' && duel.stepCount >= duel.stepIndex,
    `Expected duel stepCount >= stepIndex for ${label}`,
  )
  assert(typeof duel.actionLabel === 'string' && duel.actionLabel.length > 0, `Expected duel actionLabel for ${label}`)

  if (requireStepFields) {
    assert(typeof duel.stepKind === 'string' && duel.stepKind.length > 0, `Expected duel stepKind for ${label}`)
    assert(typeof duel.fxCueId === 'string' && duel.fxCueId.length > 0, `Expected duel fxCueId for ${label}`)
    assert(
      typeof duel.targetUnitId === 'string' && duel.targetUnitId.length > 0,
      `Expected duel targetUnitId for ${label}`,
    )
    return
  }

  if (duel.stepKind !== undefined) {
    assert(typeof duel.stepKind === 'string' && duel.stepKind.length > 0, `Expected optional duel stepKind for ${label}`)
  }

  if (duel.fxCueId !== undefined) {
    assert(typeof duel.fxCueId === 'string' && duel.fxCueId.length > 0, `Expected optional duel fxCueId for ${label}`)
  }

  if (duel.targetUnitId !== undefined) {
    assert(
      typeof duel.targetUnitId === 'string' && duel.targetUnitId.length > 0,
      `Expected optional duel targetUnitId for ${label}`,
    )
  }
}

async function captureFinalDuelState(prefix) {
  let lastActiveState

  for (let iteration = 0; iteration < 40; iteration += 1) {
    const current = await readState()

    if (current.telemetry.duel?.active === true) {
      lastActiveState = current

      if (current.telemetry.duel.stepIndex >= current.telemetry.duel.stepCount) {
        return current
      }
    } else if (lastActiveState) {
      return lastActiveState
    }

    await advanceTime(200)
  }

  throw new Error(`Timed out waiting for duel final step (${prefix})`)
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

async function captureCommitFeedback(prefix, startedAt) {
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const state = await readState()

    if (state.hud?.mode === 'busy' && state.telemetry?.duel?.active !== true) {
      const elapsedMs = Date.now() - startedAt
      assert(elapsedMs <= 150, `Expected ${prefix} commit feedback within 150ms (${elapsedMs}ms)`)
      await saveShot(`${prefix}-commit`)
      await saveState(`${prefix}-commit`)
      return
    }

    await page.waitForTimeout(8)
  }

  throw new Error(`Timed out waiting for ${prefix} commit feedback before duel start`)
}

async function captureDuelSequence(prefix) {
  await waitForDuelActivation()
  let state = await readState()
  assertDuelTelemetry(state, `${prefix} start`)
  await saveShot(`${prefix}-duel-start`)
  await saveState(`${prefix}-duel-start`)

  const midStep = Math.min(2, state.telemetry.duel.stepCount)
  state = await advanceUntil(
    (current) => current.telemetry.duel?.active === true && current.telemetry.duel.stepIndex >= midStep,
    `Timed out waiting for duel mid-step (${prefix})`,
  )
  assertDuelTelemetry(state, `${prefix} mid`)
  await saveShot(`${prefix}-duel-mid`)
  await saveState(`${prefix}-duel-mid`)

  state = await captureFinalDuelState(prefix)
  assertDuelTelemetry(state, `${prefix} final`, { requireStepFields: false })
  assert(state.telemetry.duel?.stepIndex >= state.telemetry.duel?.stepCount, `Expected final duel step (${prefix})`)
  await saveShot(`${prefix}-duel-end`)
  await saveState(`${prefix}-duel-end`)

  await advanceTime(16)
  const holdState = await readState()

  if (holdState.telemetry.duel?.active === true) {
    assertDuelTelemetry(holdState, `${prefix} hold`, { requireStepFields: false })
    assert(
      holdState.telemetry.duel.stepIndex === holdState.telemetry.duel.stepCount,
      `Expected final duel step hold before completion (${prefix})`,
    )
    await saveState(`${prefix}-duel-hold`)
  }

  await advanceUntil(
    (current) => current.telemetry.duel?.active !== true,
    `Timed out waiting for duel completion (${prefix})`,
  )
}

async function clickHudCommand(commandId) {
  await page.locator(`[data-command="${commandId}"]`).click()
  await page.waitForTimeout(120)
}

async function clickLocaleButton(localeId) {
  await page.locator(`[data-locale="${localeId}"]`).click()
  await page.waitForFunction((locale) => JSON.parse(window.render_game_to_text()).hud?.locale === locale, localeId)
  await page.waitForTimeout(120)
}

async function selectAction(commandId) {
  await clickHudCommand(commandId)
  await page.waitForFunction((mode) => JSON.parse(window.render_game_to_text()).hud?.mode === mode, commandId)
}

async function clickTargetUnit(unitId, pauseMs = 150) {
  const state = await readState()
  const point = getUnitPosition(state, unitId)
  await clickProjectedTile(page, state, point, pauseMs)
}

function getUnitState(state, unitId) {
  const unit = state.telemetry?.units?.find((entry) => entry.id === unitId)
  assert(unit, `Expected telemetry for unit ${unitId}`)
  return unit
}

async function commitTargetedAction(prefix, unitId) {
  const startedAt = Date.now()
  await clickTargetUnit(unitId, 0)
  await captureCommitFeedback(prefix, startedAt)
  await captureDuelSequence(prefix)
}

async function waitForSettledModal(kind, settleMs = 320) {
  await page.waitForFunction((expectedKind) => {
    const state = JSON.parse(window.render_game_to_text())
    return state.hud?.modal?.kind === expectedKind && state.telemetry?.duel?.active !== true
  }, kind)
  await page.waitForTimeout(settleMs)
  return readState()
}

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => Boolean(window.__glenmoorDebug))
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.modal?.kind === 'briefing')

let state = await readState()
assert(state.hud.modal?.phaseLabel === 'Battle Phase 1/2', 'Expected briefing modal phase progress label')
assert(state.hud.modal?.objectiveLabel === 'Break the shield wall at the ridge.', 'Expected briefing modal objective callout')
await saveShot('01-briefing-en')
await saveState('01-briefing-en')

await clickHudCommand('start-battle')
await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud.phase === 'active')
state = await readState()
assertPresentationTelemetry(state, ['active-unit', 'move-range'])
assert(state.hud.statusLine.objectivePhaseLabel === 'Battle Phase 1/2', 'Expected opening HUD phase progress label')
await saveShot('02-battle-en')
await saveState('02-battle-en')

await clickLocaleButton('ko')
await saveShot('03-battle-ko')
await saveState('03-battle-ko')

await clickLocaleButton('en')
await page.evaluate(() => window.__glenmoorDebug.stage('engagement'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
await saveShot('04-engagement-before')
await saveState('04-engagement-before')

await selectAction('attack')
await commitTargetedAction('05-engagement', 'brigandCaptain')
state = await readState()
assertPresentationTelemetry(state)
await saveShot('06-engagement-after')
await saveState('06-engagement-after')

await page.evaluate(() => window.__glenmoorDebug.stage('skill-demo'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
await saveShot('07-skill-before')
await selectAction('skill')
await clickTargetUnit('brigandCaptain')
await captureDuelSequence('08-skill')
state = await readState()
assertPresentationTelemetry(state)
assert(state.telemetry.activeStatusAuraIds.includes('burning'), 'Expected burning status aura after ember sigil')
await saveShot('09-skill-after')
await saveState('09-skill-after')

await page.evaluate(() => window.__glenmoorDebug.stage('push-demo'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
await selectAction('skill')
await clickTargetUnit('brigandCaptain')
await captureDuelSequence('10-push')
state = await readState()
assertPresentationTelemetry(state)
assert(state.telemetry.activeStatusAuraIds.includes('guardBreak'), 'Expected guardBreak status aura after shield bash')
await saveShot('10-push-after')
await saveState('10-push-after')

await page.evaluate(() => window.__glenmoorDebug.stage('victory-demo'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
await selectAction('attack')
await commitTargetedAction('11-victory', 'brigandCaptain')
state = await waitForSettledModal('victory')
assert(state.hud.modal?.phaseLabel === 'Battle Phase 2/2', 'Expected victory wrapper phase progress label')
assert(
  state.hud.modal?.objectiveLabel === 'Reserve horns sound at the ford. Strike down Captain Veyr before the trap closes.',
  'Expected victory wrapper objective callout',
)
await saveShot('11-victory')
await saveState('11-victory')

await page.evaluate(() => window.__glenmoorDebug.stage('phase-demo'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
assert(state.telemetry.objectivePhaseId === 'break-the-line', 'Expected opening objective phase for phase demo')
await saveShot('12-phase-before')
await saveState('12-phase-before')

await selectAction('attack')
await clickTargetUnit('shieldbearer')
await captureDuelSequence('12-phase')
state = await readState()
assertPresentationTelemetry(state)
assert(state.telemetry.objectivePhaseId === 'hunt-the-captain', 'Expected reserve beat to shift objective phase')
assert(state.hud.statusLine.objectivePhaseLabel === 'Battle Phase 2/2', 'Expected reserve HUD phase progress label')
assert(
  state.hud?.statusLine?.objectiveLabel === 'Reserve horns sound at the ford. Strike down Captain Veyr before the trap closes.',
  'Expected reserve-phase objective label after shieldbearer collapse',
)
assert(
  state.hud?.phaseAnnouncement?.body === 'Reserve horns are sounding at the ford. Captain Veyr is exposed.',
  'Expected objective update announcement after shieldbearer collapse',
)
assert(getUnitPosition(state, 'fordStalker').x === 13 && getUnitPosition(state, 'fordStalker').y === 9, 'Expected fordStalker reinforcement deployment')
assert(getUnitPosition(state, 'roadReaver').x === 12 && getUnitPosition(state, 'roadReaver').y === 10, 'Expected roadReaver reinforcement deployment')
await saveShot('13-phase-after')
await saveState('13-phase-after')

await page.evaluate(() => window.__glenmoorDebug.stage('forest-demo'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
await saveShot('14-forest-before')
await saveState('14-forest-before')

await selectAction('skill')
await commitTargetedAction('14-forest', 'brigandCaptain')
state = await readState()
assertPresentationTelemetry(state)
assert(
  getUnitState(state, 'brigandCaptain').statuses.some((status) => status.id === 'burning' && status.stacks >= 2),
  'Expected forest demo to leave brigandCaptain with stacked burning',
)
assert(state.hud.statusLine.logLabel.includes('Forest Kindling'), 'Expected forest demo battle feed to mention Forest Kindling')
await saveShot('14-forest-after')
await saveState('14-forest-after')

await page.evaluate(() => window.__glenmoorDebug.stage('ruins-demo'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
await saveShot('15-ruins-before')
await saveState('15-ruins-before')

await selectAction('skill')
await commitTargetedAction('15-ruins', 'osric')
state = await readState()
assertPresentationTelemetry(state)
assert(
  getUnitState(state, 'osric').statuses.some((status) => status.id === 'warded' && status.stacks >= 2),
  'Expected ruins demo to strengthen warded on osric',
)
assert(state.hud.statusLine.logLabel.includes('Ruins Echo'), 'Expected ruins demo battle feed to mention Ruins Echo')
await saveShot('15-ruins-after')
await saveState('15-ruins-after')

await page.evaluate(() => window.__glenmoorDebug.stage('bridge-demo'))
await page.waitForTimeout(120)
state = await readState()
assertPresentationTelemetry(state)
await saveShot('16-bridge-before')
await saveState('16-bridge-before')

await selectAction('skill')
await commitTargetedAction('16-bridge', 'brigandCaptain')
state = await readState()
assertPresentationTelemetry(state)
assert(getUnitState(state, 'brigandCaptain').defeated === true, 'Expected bridge demo to defeat brigandCaptain with bridge drop')
assert(state.hud.statusLine.logLabel.includes('Bridge Drop'), 'Expected bridge demo battle feed to mention Bridge Drop')
await saveShot('16-bridge-after')
await saveState('16-bridge-after')

await browser.close()
