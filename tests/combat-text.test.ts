import { describe, expect, it } from 'vitest'
import mapData from '../public/data/maps/glenmoor-pass.json'
import { buildCombatForecastLines, formatBattleFeedEntry } from '../src/game/combat-text'
import { BattleRuntime } from '../src/game/runtime'
import { I18n } from '../src/game/i18n'
import type { TiledMapData } from '../src/game/types'

function makeRuntime(): BattleRuntime {
  return new BattleRuntime(mapData as TiledMapData)
}

function setActive(runtime: BattleRuntime, unitId: string): void {
  runtime.state.phase = 'active'
  runtime.state.activeUnitId = unitId

  for (const unit of Object.values(runtime.state.units)) {
    unit.hasMovedThisTurn = false
    unit.hasActedThisTurn = false
    unit.nextActAt = unit.id === unitId ? 0 : 500
  }
}

function place(runtime: BattleRuntime, unitId: string, x: number, y: number): void {
  const unit = runtime.getUnit(unitId)

  if (!unit) {
    throw new Error(`Missing unit ${unitId}`)
  }

  unit.position = { x, y }
  unit.defeated = false
}

describe('Combat text', () => {
  it('builds the new three-line forecast summary from presentation data', () => {
    const runtime = makeRuntime()
    const i18n = new I18n('en')
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 0, 1)
    place(runtime, 'brigandCaptain', 0, 0)

    const forecast = runtime.previewAction({
      actorId: 'rowan',
      kind: 'skill',
      skillId: 'shieldBash',
      targetId: 'brigandCaptain',
    })
    const lines = buildCombatForecastLines(forecast, {
      t: i18n.t.bind(i18n),
      getUnitName: (unitId) => i18n.t(runtime.getUnit(unitId)?.nameKey ?? unitId),
    })

    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('Shield Bash')
    expect(lines[1]).toContain('Effects')
    expect(lines[2]).toContain('Counter Risk')
  })

  it('builds battle-feed summaries from the same combat presentation', () => {
    const runtime = makeRuntime()
    const i18n = new I18n('en')
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 0, 1)
    place(runtime, 'brigandCaptain', 0, 0)

    const resolution = runtime.commitAction({
      actorId: 'rowan',
      kind: 'skill',
      skillId: 'shieldBash',
      targetId: 'brigandCaptain',
    })

    const line = formatBattleFeedEntry(
      {
        kind: 'presentation',
        presentation: resolution.presentation!,
      },
      {
        t: i18n.t.bind(i18n),
        getUnitName: (unitId) => i18n.t(runtime.getUnit(unitId)?.nameKey ?? unitId),
      },
    )

    expect(line).toContain('Shield Bash')
    expect(line).toContain('Guard Break')
    expect(line).toContain('Counterattack')
  })

  it('includes terrain reactions in forecast and battle-feed text', () => {
    const runtime = makeRuntime()
    const i18n = new I18n('en')
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 7, 8)
    place(runtime, 'brigandCaptain', 7, 7)

    const forecast = runtime.previewAction({
      actorId: 'rowan',
      kind: 'skill',
      skillId: 'shieldBash',
      targetId: 'brigandCaptain',
    })
    const lines = buildCombatForecastLines(forecast, {
      t: i18n.t.bind(i18n),
      getUnitName: (unitId) => i18n.t(runtime.getUnit(unitId)?.nameKey ?? unitId),
    })

    expect(lines[1]).toContain('Bridge Drop')

    const resolution = runtime.commitAction({
      actorId: 'rowan',
      kind: 'skill',
      skillId: 'shieldBash',
      targetId: 'brigandCaptain',
    })

    const line = formatBattleFeedEntry(
      {
        kind: 'presentation',
        presentation: resolution.presentation!,
      },
      {
        t: i18n.t.bind(i18n),
        getUnitName: (unitId) => i18n.t(runtime.getUnit(unitId)?.nameKey ?? unitId),
      },
    )

    expect(line).toContain('Bridge Drop')
  })
})
