import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'
import { clickProjectedTile, getUnitPosition, projectTilesToClient } from './projection.mjs'

const outputDir = path.resolve('output/web-game/hud-polish')
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
const reserveAnnouncement = 'Reserve horns are sounding beyond the ford. Captain Veyr is exposed.'
const reserveObjectiveEn = 'Reserve horns sound beyond the ford. Strike down Captain Veyr before the crossing closes.'
const reserveObjectiveKo = '나루 너머에서 예비대의 뿔나팔이 울린다. 도하선이 닫히기 전에 베이르 대장을 쓰러뜨려라.'

fs.rmSync(outputDir, { recursive: true, force: true })
fs.mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

async function readState(page) {
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()))
}

async function saveShot(page, name) {
  await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: false })
}

function saveJson(name, payload) {
  fs.writeFileSync(path.join(outputDir, `${name}.json`), JSON.stringify(payload, null, 2))
}

async function clickHudCommand(page, commandId) {
  await page.locator(`[data-command="${commandId}"]`).click()
  await page.waitForTimeout(120)
}

async function clickLocaleButton(page, localeId) {
  await page.locator(`[data-locale="${localeId}"]`).click()
  await page.waitForFunction((locale) => JSON.parse(window.render_game_to_text()).hud?.locale === locale, localeId)
  await page.waitForTimeout(120)
}

async function clickTargetUnit(page, unitId) {
  const state = await readState(page)
  const point = getUnitPosition(state, unitId)
  await clickProjectedTile(page, state, point)
}

async function startBattle(page, locale = 'en') {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__glenmoorDebug?.stage))
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text())
    return state.hud?.phase === 'briefing' && state.hud?.modal?.kind === 'briefing'
  })

  if (locale !== 'en') {
    await clickLocaleButton(page, locale)
  }

  await clickHudCommand(page, 'start-battle')
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.phase === 'active')
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text())
    return state.hud?.mode && state.hud.mode !== 'busy'
  })
  await page.waitForTimeout(120)
}

function buildMapPoints(state) {
  const boardProjection = state.telemetry?.boardProjection
  const points = []

  for (let y = 0; y < boardProjection.mapHeight; y += 1) {
    for (let x = 0; x < boardProjection.mapWidth; x += 1) {
      points.push({ x, y })
    }
  }

  return points
}

function buildInteractiveEntries(state) {
  if (state.hud.mode === 'move') {
    return (state.telemetry.reachableTiles ?? []).map((tile) => ({
      type: 'reachable',
      tile,
    }))
  }

  if (state.hud.mode === 'attack' || state.hud.mode === 'skill') {
    return (state.telemetry.targetableUnitIds ?? []).map((unitId) => ({
      type: 'targetable',
      tile: getUnitPosition(state, unitId),
      unitId,
    }))
  }

  return []
}

function isVisiblePoint(viewport, point) {
  return point.x >= 0 && point.x <= viewport.width && point.y >= 0 && point.y <= viewport.height
}

async function listTargetHoverPoints(page, state) {
  const unitIds = state.telemetry.targetableUnitIds ?? []
  const tiles = unitIds.map((unitId) => getUnitPosition(state, unitId))
  const projections = await projectTilesToClient(page, state, tiles)
  const viewport = page.viewportSize() ?? {
    width: Number.MAX_SAFE_INTEGER,
    height: Number.MAX_SAFE_INTEGER,
  }

  return unitIds.flatMap((unitId, index) => {
    const projection = projections[index]

    if (!projection || !isVisiblePoint(viewport, projection.client)) {
      return []
    }

    return [{
      unitId,
      tile: tiles[index],
      point: projection.client,
    }]
  })
}

async function collectHudMetrics(page) {
  const state = await readState(page)
  const viewport = page.viewportSize() ?? { width: 0, height: 0 }
  const allTileProjections = await projectTilesToClient(page, state, buildMapPoints(state))
  const projectedTileCenters = allTileProjections
    .filter((projection) => isVisiblePoint(viewport, projection.client))
    .map((projection) => ({
      tile: projection.point,
      client: {
        x: projection.client.x,
        y: projection.client.y,
      },
    }))
  const interactiveEntries = buildInteractiveEntries(state)
  const interactiveProjections =
    interactiveEntries.length > 0
      ? await projectTilesToClient(
          page,
          state,
          interactiveEntries.map((entry) => entry.tile),
        )
      : []
  const interactivePoints = interactiveEntries.flatMap((entry, index) => {
    const projection = interactiveProjections[index]

    if (!projection || !isVisiblePoint(viewport, projection.client)) {
      return []
    }

    return [{
      ...entry,
      client: {
        x: projection.client.x,
        y: projection.client.y,
      },
    }]
  })

  return page.evaluate(({ projectedTileCenters: tileCenters, interactivePoints: interactive }) => {
    const state = JSON.parse(window.render_game_to_text())
    const rectOf = (selector) => {
      const node = document.querySelector(selector)

      if (!node) {
        return null
      }

      const rect = node.getBoundingClientRect()

      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }
    const getAnchor = (selector) => {
      const node = document.querySelector(selector)

      if (!node) {
        return null
      }

      const x = Number(node.getAttribute('data-anchor-x'))
      const y = Number(node.getAttribute('data-anchor-y'))

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null
      }

      return {
        x: Math.round(x),
        y: Math.round(y),
        placement: node.getAttribute('data-placement'),
      }
    }
    const overflowOf = (selector) => {
      const node = document.querySelector(selector)

      if (!node) {
        return null
      }

      return {
        clientWidth: node.clientWidth,
        scrollWidth: node.scrollWidth,
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
      }
    }
    const pathAt = (clientX, clientY) => {
      const topNode = document.elementFromPoint(clientX, clientY)
      const path = []
      let current = topNode

      while (current && path.length < 6) {
        path.push(String(current.className || current.tagName))
        current = current.parentElement
      }

      return path
    }
    const distanceFromPointToRect = (point, rect) => {
      const dx =
        point.x < rect.left ? rect.left - point.x : point.x > rect.right ? point.x - rect.right : 0
      const dy =
        point.y < rect.top ? rect.top - point.y : point.y > rect.bottom ? point.y - rect.bottom : 0

      return Math.round(Math.hypot(dx, dy))
    }
    const rectSeparation = (left, right) => {
      const horizontalGap = Math.max(0, left.left - right.right, right.left - left.right)
      const verticalGap = Math.max(0, left.top - right.bottom, right.top - left.bottom)
      return Math.round(Math.hypot(horizontalGap, verticalGap))
    }
    const rectIntersectionArea = (left, right) => {
      const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left))
      const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top))
      return Math.round(width * height)
    }

    const passiveTokens = [
      'hud-bottom-shell',
      'hud-bottom-band',
      'hud-active-card',
      'hud-initiative-rail',
      'hud-status-line',
      'hud-target-marker',
      'hud-target-detail',
      'hud-topbar',
    ]
    const interactiveTokens = [
      'hud-action-menu',
      'hud-command-button',
      'hud-locale',
      'hud-icon-button',
      'hud-button',
    ]
    const actionMenuTokens = ['hud-action-menu', 'hud-command-button']

    const passiveHits = tileCenters.filter((entry) => {
      const path = pathAt(entry.client.x, entry.client.y)
      const hasInteractiveHit = interactiveTokens.some((token) => path.some((item) => item.includes(token)))

      if (hasInteractiveHit) {
        return false
      }

      return passiveTokens.some((token) => path.some((item) => item.includes(token)))
    })

    const actionMenuHits = interactive.flatMap((entry) => {
      const path = pathAt(entry.client.x, entry.client.y)
      const hitToken = actionMenuTokens.find((token) => path.some((item) => item.includes(token)))

      if (!hitToken) {
        return []
      }

      return [{
        ...entry,
        hitToken,
        path,
      }]
    })

    const viewClusterRect = rectOf('.hud-view-cluster')
    const statusLineRect = rectOf('.hud-status-line')
    const localesRect = rectOf('.hud-locales')
    const actionMenuRect = rectOf('.hud-action-menu')
    const actionMenuAnchor = getAnchor('.hud-action-menu')
    const targetDetailRect = rectOf('.hud-target-detail')
    const phaseAnnouncementRect = rectOf('.hud-phase-announcement')
    const modalCardRect = rectOf('.hud-modal-card')
    const activeCardRect = rectOf('.hud-active-card')
    const initiativeRailRect = rectOf('.hud-initiative-rail')
    const topbarBottom = Math.max(
      viewClusterRect?.bottom ?? 0,
      statusLineRect?.bottom ?? 0,
      localesRect?.bottom ?? 0,
    )
    const bottomBandTop = Math.min(
      activeCardRect?.top ?? Number.MAX_SAFE_INTEGER,
      initiativeRailRect?.top ?? Number.MAX_SAFE_INTEGER,
    )

    return {
      locale: state.hud.locale,
      phase: state.hud.phase,
      mode: state.hud.mode,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rects: {
        viewCluster: viewClusterRect,
        locales: localesRect,
        actionMenu: actionMenuRect,
        activeCard: activeCardRect,
        initiativeRail: initiativeRailRect,
        statusLine: statusLineRect,
        targetDetail: targetDetailRect,
        phaseAnnouncement: phaseAnnouncementRect,
        modalCard: modalCardRect,
      },
      overflows: {
        activeCard: overflowOf('.hud-active-card'),
        initiativeRail: overflowOf('.hud-initiative-rail'),
        statusLine: overflowOf('.hud-status-line'),
        modalCard: overflowOf('.hud-modal-card'),
      },
      compact: {
        topbarOccupiedHeight: Math.round(topbarBottom),
        bottomBandOccupiedHeight:
          Number.isFinite(bottomBandTop) ? Math.round(window.innerHeight - bottomBandTop) : null,
      },
      actionMenu:
        actionMenuRect && actionMenuAnchor
          ? {
              anchor: actionMenuAnchor,
              anchorDistance: distanceFromPointToRect(actionMenuAnchor, actionMenuRect),
            }
          : null,
      popupSeparation:
        actionMenuRect && targetDetailRect && state.hud.targetDetail
          ? {
              distance: rectSeparation(actionMenuRect, targetDetailRect),
              intersectionArea: rectIntersectionArea(actionMenuRect, targetDetailRect),
            }
          : null,
      passiveHits,
      actionMenuHits,
    }
  }, { projectedTileCenters, interactivePoints })
}

function assertRectInsideViewport(metrics, key) {
  const rect = metrics.rects[key]

  assert(rect, `Expected ${key} rect to exist`)
  assert(rect.left >= 0, `Expected ${key} left bound to be visible`)
  assert(rect.top >= 0, `Expected ${key} top bound to be visible`)
  assert(rect.right <= metrics.viewport.width, `Expected ${key} right bound to be visible`)
  assert(rect.bottom <= metrics.viewport.height, `Expected ${key} bottom bound to be visible`)
}

function assertNoOverflow(metrics, key) {
  const overflow = metrics.overflows[key]

  assert(overflow, `Expected ${key} overflow metrics`)
  assert(
    overflow.scrollWidth <= overflow.clientWidth,
    `Expected ${key} horizontal overflow to be resolved (${overflow.scrollWidth} > ${overflow.clientWidth})`,
  )
  assert(
    overflow.scrollHeight <= overflow.clientHeight,
    `Expected ${key} vertical overflow to be resolved (${overflow.scrollHeight} > ${overflow.clientHeight})`,
  )
}

function assertNoHits(items, label) {
  assert(items.length === 0, `Expected no ${label}; found ${JSON.stringify(items.slice(0, 5), null, 2)}`)
}

function assertActionMenuNearAnchor(metrics, maxDistance) {
  assert(metrics.actionMenu, 'Expected action menu anchor metrics')
  assert(
    metrics.actionMenu.anchorDistance <= maxDistance,
    `Expected action menu to remain near its unit anchor (${metrics.actionMenu.anchorDistance} > ${maxDistance})`,
  )
}

function assertPopupSeparation(metrics, label) {
  assert(metrics.popupSeparation, `Expected popup separation metrics for ${label}`)
  assert(
    metrics.popupSeparation.intersectionArea === 0,
    `Expected action menu and target detail to not overlap for ${label}; area=${metrics.popupSeparation.intersectionArea}`,
  )
}

function assertShortHeightCompaction(metrics, label) {
  if (metrics.viewport.height > 720) {
    return
  }

  assert(
    metrics.compact.topbarOccupiedHeight <= 84,
    `Expected compact topbar occupancy for ${label} (${metrics.compact.topbarOccupiedHeight} > 84)`,
  )
  assert(
    metrics.compact.bottomBandOccupiedHeight !== null && metrics.compact.bottomBandOccupiedHeight <= 238,
    `Expected compact bottom HUD occupancy for ${label} (${metrics.compact.bottomBandOccupiedHeight} > 238)`,
  )
  assert(
    metrics.rects.activeCard.height <= 228,
    `Expected compact active card height for ${label} (${metrics.rects.activeCard.height} > 228)`,
  )
  assert(
    metrics.rects.initiativeRail.height <= 96,
    `Expected compact initiative rail height for ${label} (${metrics.rects.initiativeRail.height} > 96)`,
  )
  assert(
    metrics.rects.statusLine.height <= 68,
    `Expected compact status line height for ${label} (${metrics.rects.statusLine.height} > 68)`,
  )
}

function assertReadabilityState(state, label, { expectTargetDetail = false } = {}) {
  const active = state.hud?.activeUnitPanel
  assert(typeof active?.combatRoleLabel === 'string' && active.combatRoleLabel.length > 0, `Expected active role label for ${label}`)
  assert(typeof active?.roleFlavorLabel === 'string' && active.roleFlavorLabel.length > 0, `Expected active role flavor label for ${label}`)
  assert(typeof active?.unitIconId === 'string' && active.unitIconId.length > 0, `Expected active unit icon id for ${label}`)

  const entries = state.hud?.initiativeRail?.entries ?? []
  assert(entries.length > 0, `Expected initiative entries for ${label}`)
  for (const entry of entries.slice(0, 4)) {
    assert(typeof entry.combatRoleLabel === 'string' && entry.combatRoleLabel.length > 0, `Expected initiative role label for ${label}`)
    assert(typeof entry.unitIconId === 'string' && entry.unitIconId.length > 0, `Expected initiative icon id for ${label}`)
  }

  const telemetryUnits = state.telemetry?.units ?? []
  assert(telemetryUnits.length > 0, `Expected telemetry units for ${label}`)
  for (const unit of telemetryUnits.slice(0, 4)) {
    assert(typeof unit.combatRole === 'string' && unit.combatRole.length > 0, `Expected telemetry combatRole for ${label}`)
    assert(typeof unit.combatRoleLabel === 'string' && unit.combatRoleLabel.length > 0, `Expected telemetry combatRoleLabel for ${label}`)
    assert(typeof unit.unitIconId === 'string' && unit.unitIconId.length > 0, `Expected telemetry unitIconId for ${label}`)
  }

  if (expectTargetDetail) {
    assert(typeof state.hud?.targetDetail?.combatRoleLabel === 'string' && state.hud.targetDetail.combatRoleLabel.length > 0, `Expected target detail role label for ${label}`)
    assert(typeof state.hud?.targetDetail?.unitIconId === 'string' && state.hud.targetDetail.unitIconId.length > 0, `Expected target detail icon id for ${label}`)
  }
}

const scenarios = [
  {
    id: '01-battle-start-1600-en',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    expectedMode: 'move',
  },
  {
    id: '02-battle-start-1280-en',
    viewport: { width: 1280, height: 720 },
    locale: 'en',
    expectedMode: 'move',
  },
  {
    id: '03-battle-start-1280-ko',
    viewport: { width: 1280, height: 720 },
    locale: 'ko',
    expectedMode: 'move',
  },
  {
    id: '04-engagement-target-detail-1280-en',
    viewport: { width: 1280, height: 720 },
    locale: 'en',
    stage: 'engagement',
    command: 'attack',
    hoverFirstTarget: true,
    expectedMode: 'attack',
    expectTargetDetail: true,
  },
  {
    id: '05-skill-demo-target-detail-1280-ko',
    viewport: { width: 1280, height: 720 },
    locale: 'ko',
    stage: 'skill-demo',
    command: 'skill',
    hoverFirstTarget: true,
    expectedMode: 'skill',
    expectTargetDetail: true,
  },
  {
    id: '06-engagement-target-detail-1600-en',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'engagement',
    command: 'attack',
    hoverFirstTarget: true,
    expectedMode: 'attack',
    expectTargetDetail: true,
  },
  {
    id: '07-push-demo-edge-1600-en',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'push-demo',
    command: 'attack',
    hoverFirstTarget: true,
    expectedMode: 'attack',
    expectTargetDetail: true,
  },
  {
    id: '08-phase-shift-1600-en',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'phase-demo',
    command: 'attack',
    resolveTargetUnitId: 'shieldbearer',
    expectedMode: 'move',
    expectedObjectivePhaseLabel: 'Battle Phase 2/2',
    expectedAnnouncement: reserveAnnouncement,
  },
  {
    id: '09-victory-modal-1600-en',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'victory-demo',
    command: 'attack',
    resolveTargetUnitId: 'brigandCaptain',
    expectedPhase: 'victory',
    expectedModalKind: 'victory',
    expectedModalPhaseLabel: 'Battle Phase 2/2',
    expectedModalObjectiveLabel: reserveObjectiveEn,
    modalSettleMs: 340,
  },
  {
    id: '10-victory-modal-1280-ko',
    viewport: { width: 1280, height: 720 },
    locale: 'ko',
    stage: 'victory-demo',
    command: 'attack',
    resolveTargetUnitId: 'brigandCaptain',
    expectedPhase: 'victory',
    expectedModalKind: 'victory',
    expectedModalPhaseLabel: '전투 국면 2/2',
    expectedModalObjectiveLabel: reserveObjectiveKo,
    modalSettleMs: 340,
  },
  {
    id: '11-forest-reaction-target-detail-1600-en',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'forest-demo',
    command: 'skill',
    hoverFirstTarget: true,
    hoverUnitId: 'brigandCaptain',
    expectedMode: 'skill',
    expectTargetDetail: true,
    expectedVerdictChips: ['Forest Kindling'],
  },
  {
    id: '12-ruins-reaction-target-detail-1280-ko',
    viewport: { width: 1280, height: 720 },
    locale: 'ko',
    stage: 'ruins-demo',
    command: 'skill',
    hoverFirstTarget: true,
    hoverUnitId: 'osric',
    expectedMode: 'skill',
    expectTargetDetail: true,
    expectedVerdictChips: ['폐허 공명'],
  },
  {
    id: '13-bridge-reaction-target-detail-1280-en',
    viewport: { width: 1280, height: 720 },
    locale: 'en',
    stage: 'bridge-demo',
    command: 'skill',
    hoverFirstTarget: true,
    hoverUnitId: 'brigandCaptain',
    expectedMode: 'skill',
    expectTargetDetail: true,
    expectedVerdictChips: ['Lethal', 'Bridge Drop'],
  },
]

for (const scenario of scenarios) {
  const page = await browser.newPage({ viewport: scenario.viewport })
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })
  page.on('pageerror', (error) => {
    pageErrors.push(String(error))
  })

  await startBattle(page, scenario.locale)

  if (scenario.stage) {
    await page.evaluate((stage) => window.__glenmoorDebug.stage(stage), scenario.stage)
    await page.waitForTimeout(140)
  }

  if (scenario.command) {
    await clickHudCommand(page, scenario.command)
    await page.waitForFunction((mode) => JSON.parse(window.render_game_to_text()).hud?.mode === mode, scenario.command)
  }

  if (scenario.resolveTargetUnitId) {
    await clickTargetUnit(page, scenario.resolveTargetUnitId)
    if (scenario.expectedModalKind) {
      await page.waitForFunction((kind) => {
        const state = JSON.parse(window.render_game_to_text())
        return state.hud?.modal?.kind === kind && state.telemetry?.duel?.active !== true
      }, scenario.expectedModalKind)
      await page.waitForTimeout(scenario.modalSettleMs ?? 320)
    } else {
      await page.waitForFunction(() => {
        const state = JSON.parse(window.render_game_to_text())
        return state.hud?.phase === 'active' && state.hud?.mode !== 'busy'
      })
      await page.waitForTimeout(140)
    }
  }

  const hoverSamples = []

  if (scenario.hoverFirstTarget) {
    const preHoverState = await readState(page)
    let hoverTargets = await listTargetHoverPoints(page, preHoverState)

    if (scenario.hoverUnitId) {
      hoverTargets = hoverTargets.filter((hoverTarget) => hoverTarget.unitId === scenario.hoverUnitId)
    }

    assert(hoverTargets.length > 0, `Expected hover targets for ${scenario.id}`)

    for (const hoverTarget of hoverTargets) {
      await page.mouse.move(hoverTarget.point.x, hoverTarget.point.y)
      await page.waitForTimeout(140)

      const hoverState = await readState(page)
      const hoverMetrics = await collectHudMetrics(page)

      assert(
        hoverState.hud.mode === scenario.expectedMode,
        `Expected ${scenario.id}/${hoverTarget.unitId} to stay in ${scenario.expectedMode}`,
      )
      assertRectInsideViewport(hoverMetrics, 'actionMenu')
      assertRectInsideViewport(hoverMetrics, 'activeCard')
      assertRectInsideViewport(hoverMetrics, 'initiativeRail')
      assertRectInsideViewport(hoverMetrics, 'statusLine')
      assertNoOverflow(hoverMetrics, 'activeCard')
      assertNoOverflow(hoverMetrics, 'initiativeRail')
      assertNoOverflow(hoverMetrics, 'statusLine')
      assertActionMenuNearAnchor(hoverMetrics, scenario.viewport.width <= 1280 ? 224 : 280)
      assertNoHits(hoverMetrics.passiveHits, `${scenario.id}/${hoverTarget.unitId} passive tile interceptions`)
      assertNoHits(hoverMetrics.actionMenuHits, `${scenario.id}/${hoverTarget.unitId} action menu interceptions`)
      assertShortHeightCompaction(hoverMetrics, `${scenario.id}/${hoverTarget.unitId}`)
      assertReadabilityState(hoverState, `${scenario.id}/${hoverTarget.unitId}`, {
        expectTargetDetail: Boolean(scenario.expectTargetDetail),
      })

      if (scenario.expectTargetDetail) {
        assertRectInsideViewport(hoverMetrics, 'targetDetail')
        assertPopupSeparation(hoverMetrics, `${scenario.id}/${hoverTarget.unitId}`)
      }

      hoverSamples.push({
        unitId: hoverTarget.unitId,
        point: hoverTarget.point,
        state: hoverState,
        metrics: hoverMetrics,
      })
    }
  }

  const state = hoverSamples.at(-1)?.state ?? (await readState(page))
  const metrics = hoverSamples.at(-1)?.metrics ?? (await collectHudMetrics(page))

  if (!scenario.hoverFirstTarget) {
    if (scenario.expectedModalKind) {
      assert(state.hud.modal?.kind === scenario.expectedModalKind, `Expected ${scenario.id} modal kind`)
      assertRectInsideViewport(metrics, 'modalCard')
      assertNoOverflow(metrics, 'modalCard')
    } else {
      assert(state.hud.mode === scenario.expectedMode, `Expected ${scenario.id} to settle in ${scenario.expectedMode}`)
      assertRectInsideViewport(metrics, 'actionMenu')
      assertRectInsideViewport(metrics, 'activeCard')
      assertRectInsideViewport(metrics, 'initiativeRail')
      assertRectInsideViewport(metrics, 'statusLine')
      assertNoOverflow(metrics, 'activeCard')
      assertNoOverflow(metrics, 'initiativeRail')
      assertNoOverflow(metrics, 'statusLine')
      assertActionMenuNearAnchor(metrics, scenario.viewport.width <= 1280 ? 224 : 280)
      assertNoHits(metrics.passiveHits, `${scenario.id} passive tile interceptions`)
      assertNoHits(metrics.actionMenuHits, `${scenario.id} action menu interceptions`)
      assertShortHeightCompaction(metrics, scenario.id)
      assertReadabilityState(state, scenario.id)
    }
  }

  if (scenario.expectedPhase) {
    assert(state.hud.phase === scenario.expectedPhase, `Expected ${scenario.id} phase to match`)
  }

  if (scenario.expectedObjectivePhaseLabel) {
    assert(
      state.hud.statusLine.objectivePhaseLabel === scenario.expectedObjectivePhaseLabel,
      `Expected ${scenario.id} objective phase label to match`,
    )
  }

  if (scenario.expectedAnnouncement) {
    assert(
      state.hud.phaseAnnouncement?.body === scenario.expectedAnnouncement,
      `Expected ${scenario.id} phase announcement body`,
    )
    assertRectInsideViewport(metrics, 'phaseAnnouncement')
  }

  if (scenario.expectedVerdictChips) {
    const verdictLabels = state.hud.targetDetail?.verdictChips?.map((chip) => chip.label) ?? []

    for (const label of scenario.expectedVerdictChips) {
      assert(verdictLabels.includes(label), `Expected ${scenario.id} verdict chips to include ${label}`)
    }
  }

  if (scenario.expectedModalPhaseLabel) {
    assert(state.hud.modal?.phaseLabel === scenario.expectedModalPhaseLabel, `Expected ${scenario.id} modal phase label`)
  }

  if (scenario.expectedModalObjectiveLabel) {
    assert(
      state.hud.modal?.objectiveLabel === scenario.expectedModalObjectiveLabel,
      `Expected ${scenario.id} modal objective label`,
    )
  }

  if (hoverSamples.length > 0) {
    const mostConstrained = hoverSamples.reduce((best, sample) => {
      const sampleDistance = sample.metrics.popupSeparation?.distance ?? Number.MAX_SAFE_INTEGER
      const bestDistance = best.metrics.popupSeparation?.distance ?? Number.MAX_SAFE_INTEGER
      return sampleDistance < bestDistance ? sample : best
    })

    await page.mouse.move(mostConstrained.point.x, mostConstrained.point.y)
    await page.waitForTimeout(140)
  }

  assert(consoleErrors.length === 0, `Expected no console errors for ${scenario.id}`)
  assert(pageErrors.length === 0, `Expected no page errors for ${scenario.id}`)

  await saveShot(page, scenario.id)
  saveJson(scenario.id, {
    state,
    metrics,
    hoverSamples,
    consoleErrors,
    pageErrors,
  })

  await page.close()
}

await browser.close()
