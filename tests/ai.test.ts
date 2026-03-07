import { describe, expect, it } from 'vitest'
import mapData from '../public/data/maps/glenmoor-pass.json'
import { BattleRuntime } from '../src/game/runtime'
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

describe('Battle AI', () => {
  it('prefers lethal targets when available', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'hexbinder')
    place(runtime, 'hexbinder', 8, 6)
    place(runtime, 'rowan', 8, 4)
    place(runtime, 'osric', 10, 4)
    runtime.getUnit('rowan')!.hp = 6
    runtime.getUnit('osric')!.hp = 24

    const choice = runtime.chooseBestAction('hexbinder')

    expect(choice.action.targetId).toBe('rowan')
  })

  it('uses support skills on injured allies', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'fanatic')
    place(runtime, 'fanatic', 9, 4)
    place(runtime, 'brigandCaptain', 9, 5)
    runtime.getUnit('brigandCaptain')!.hp = 9

    const choice = runtime.chooseBestAction('fanatic')

    expect(choice.action.kind).toBe('skill')
    expect(choice.action.targetId).toBe('brigandCaptain')
  })

  it('falls back to a stable wait action when no targets are available', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'huntmaster')
    place(runtime, 'huntmaster', 14, 0)
    place(runtime, 'rowan', 0, 15)
    place(runtime, 'elira', 1, 15)
    place(runtime, 'maelin', 2, 15)

    const choice = runtime.chooseBestAction('huntmaster')

    expect(choice.action.kind).toBe('wait')
    expect(choice.action.destination).toBeDefined()
  })
})
