import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const outputDir = path.resolve('output/web-game/hud-polish')
const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'

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

async function startBattle(page, locale = 'en') {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => Boolean(window.__glenmoorDebug?.projectTile))
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text())
    return state.hud?.phase === 'briefing' && state.hud?.modal?.kind === 'briefing'
  })

  if (locale !== 'en') {
    await page.evaluate((nextLocale) => window.__glenmoorDebug.locale(nextLocale), locale)
    await page.waitForTimeout(120)
  }

  await page.evaluate(() => window.__glenmoorDebug.command('start-battle'))
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).hud?.phase === 'active')
  await page.waitForFunction(() => {
    const state = JSON.parse(window.render_game_to_text())
    return state.hud?.mode && state.hud.mode !== 'busy'
  })
  await page.waitForTimeout(120)
}

async function hoverFirstTarget(page) {
  const point = await page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text())
    const unitId = state.telemetry.targetableUnitIds?.[0]
    const unit = state.telemetry.units.find((entry) => entry.id === unitId)

    return unit ? window.__glenmoorDebug.projectTile(unit.position.x, unit.position.y)?.client ?? null : null
  })

  assert(point, 'Expected at least one targetable unit to hover')
  await page.mouse.move(point.x, point.y)
  await page.waitForTimeout(140)
}

async function listTargetHoverPoints(page) {
  return page.evaluate(() => {
    const state = JSON.parse(window.render_game_to_text())

    return (state.telemetry.targetableUnitIds ?? []).flatMap((unitId) => {
      const unit = state.telemetry.units.find((entry) => entry.id === unitId)
      const projection = unit
        ? window.__glenmoorDebug.projectTile(unit.position.x, unit.position.y)?.client ?? null
        : null

      return projection
        ? [
            {
              unitId,
              point: projection,
            },
          ]
        : []
    })
  })
}

async function collectHudMetrics(page) {
  return page.evaluate(() => {
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
    const visibleTileCenters = []

    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const projection = window.__glenmoorDebug.projectTile(x, y)

        if (!projection) {
          continue
        }

        const { x: clientX, y: clientY } = projection.client

        if (clientX < 0 || clientX > window.innerWidth || clientY < 0 || clientY > window.innerHeight) {
          continue
        }

        visibleTileCenters.push({
          tile: { x, y },
          client: { x: clientX, y: clientY },
          path: pathAt(clientX, clientY),
        })
      }
    }

    const passiveHits = visibleTileCenters.filter((entry) => {
      const hasInteractiveHit = interactiveTokens.some((token) => entry.path.some((item) => item.includes(token)))

      if (hasInteractiveHit) {
        return false
      }

      return passiveTokens.some((token) => entry.path.some((item) => item.includes(token)))
    })

    const interactivePoints =
      state.hud.mode === 'move'
        ? (state.telemetry.reachableTiles ?? []).map((tile) => ({ type: 'reachable', tile }))
        : state.hud.mode === 'attack' || state.hud.mode === 'skill'
          ? (state.telemetry.targetableUnitIds ?? []).flatMap((unitId) => {
              const unit = state.telemetry.units.find((entry) => entry.id === unitId)
              return unit ? [{ type: 'targetable', tile: unit.position, unitId }] : []
            })
          : []

    const actionMenuHits = interactivePoints.flatMap((entry) => {
      const projection = window.__glenmoorDebug.projectTile(entry.tile.x, entry.tile.y)

      if (!projection) {
        return []
      }

      const path = pathAt(projection.client.x, projection.client.y)
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
    const actionMenuRect = rectOf('.hud-action-menu')
    const actionMenuAnchor = getAnchor('.hud-action-menu')
    const targetDetailRect = rectOf('.hud-target-detail')

    return {
      locale: state.hud.locale,
      phase: state.hud.phase,
      mode: state.hud.mode,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rects: {
        actionMenu: actionMenuRect,
        activeCard: rectOf('.hud-active-card'),
        initiativeRail: rectOf('.hud-initiative-rail'),
        statusLine: rectOf('.hud-status-line'),
        targetDetail: targetDetailRect,
      },
      overflows: {
        activeCard: overflowOf('.hud-active-card'),
        initiativeRail: overflowOf('.hud-initiative-rail'),
        statusLine: overflowOf('.hud-status-line'),
      },
      actionMenu: actionMenuRect && actionMenuAnchor
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
  })
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
    id: '04-engagement-target-detail',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'engagement',
    command: 'attack',
    hoverFirstTarget: true,
    expectedMode: 'attack',
    expectTargetDetail: true,
  },
  {
    id: '05-skill-demo-target-detail',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'skill-demo',
    command: 'skill',
    hoverFirstTarget: true,
    expectedMode: 'skill',
    expectTargetDetail: true,
  },
  {
    id: '06-push-demo-edge',
    viewport: { width: 1600, height: 900 },
    locale: 'en',
    stage: 'push-demo',
    command: 'attack',
    hoverFirstTarget: true,
    expectedMode: 'attack',
    expectTargetDetail: true,
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
    await page.evaluate((command) => window.__glenmoorDebug.command(command), scenario.command)
    await page.waitForTimeout(140)
  }

  const hoverSamples = []

  if (scenario.hoverFirstTarget) {
    const hoverTargets = await listTargetHoverPoints(page)
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
      assertActionMenuNearAnchor(hoverMetrics, scenario.viewport.width <= 1280 ? 240 : 280)
      assertNoHits(hoverMetrics.passiveHits, `${scenario.id}/${hoverTarget.unitId} passive tile interceptions`)
      assertNoHits(hoverMetrics.actionMenuHits, `${scenario.id}/${hoverTarget.unitId} action menu interceptions`)

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
    assert(state.hud.mode === scenario.expectedMode, `Expected ${scenario.id} to settle in ${scenario.expectedMode}`)
    assertRectInsideViewport(metrics, 'actionMenu')
    assertRectInsideViewport(metrics, 'activeCard')
    assertRectInsideViewport(metrics, 'initiativeRail')
    assertRectInsideViewport(metrics, 'statusLine')
    assertNoOverflow(metrics, 'activeCard')
    assertNoOverflow(metrics, 'initiativeRail')
    assertNoOverflow(metrics, 'statusLine')
    assertActionMenuNearAnchor(metrics, scenario.viewport.width <= 1280 ? 240 : 280)
    assertNoHits(metrics.passiveHits, `${scenario.id} passive tile interceptions`)
    assertNoHits(metrics.actionMenuHits, `${scenario.id} action menu interceptions`)
  }

  if (hoverSamples.length > 0) {
    const mostConstrained = hoverSamples.reduce((best, sample) => {
      const sampleDistance = sample.metrics.popupSeparation?.distance ?? Number.MAX_SAFE_INTEGER
      const bestDistance = best.metrics.popupSeparation?.distance ?? Number.MAX_SAFE_INTEGER
      return sampleDistance < bestDistance ? sample : best
    })

    await page.mouse.move(mostConstrained.point.x, mostConstrained.point.y)
    await page.waitForTimeout(140)
  } else if (scenario.hoverFirstTarget) {
    await hoverFirstTarget(page)
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
