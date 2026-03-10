import { describe, expect, it } from 'vitest'
import mapData from '../public/data/maps/glenmoor-pass.json'
import { battleDefinition } from '../src/game/content'
import { BattleRuntime } from '../src/game/runtime'
import type { BattleDefinition, TiledMapData } from '../src/game/types'

function makeRuntime(definition: BattleDefinition = battleDefinition): BattleRuntime {
  return new BattleRuntime(mapData as TiledMapData, structuredClone(definition))
}

function makeScriptedDefinition(overrides: Partial<BattleDefinition> = {}): BattleDefinition {
  const rowan = structuredClone(battleDefinition.allies.find((unit) => unit.id === 'rowan')!)
  const talia = structuredClone(battleDefinition.allies.find((unit) => unit.id === 'talia')!)

  return {
    ...structuredClone(battleDefinition),
    id: 'scriptedTest',
    allies: [rowan, talia],
    enemies: [
      {
        id: 'captain',
        nameKey: 'unit.brigandCaptain',
        classId: 'vanguard',
        team: 'enemies',
        position: { x: 5, y: 4 },
        aiProfileId: 'spearhead',
        startingHp: 12,
      },
    ],
    objectivePhases: [
      {
        id: 'default-objective',
        objectiveKey: 'battle.glenmoorPass.objective',
        victoryConditions: [{ type: 'eliminate-team', team: 'enemies' }],
      },
    ],
    events: [],
    ...overrides,
  }
}

function setActive(runtime: BattleRuntime, unitId: string): void {
  runtime.state.phase = 'active'
  runtime.state.activeUnitId = unitId
  runtime.state.turnIndex = 1

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

function pointKey(x: number, y: number): string {
  return `${x},${y}`
}

function expectStepMetadata(step: NonNullable<ReturnType<BattleRuntime['commitAction']>['presentation']>['steps'][number]): void {
  expect(step.fxCueId).toEqual(expect.any(String))
  expect(step.fxCueId.length).toBeGreaterThan(0)
  expect(step.sourcePoint).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
  expect(step.targetPoint).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }))
  expect(step.durationMs).toBeGreaterThan(0)
}

describe('Battle runtime', () => {
  it('orders turns by initiative speed', () => {
    const runtime = makeRuntime()
    runtime.startBattle()

    expect(runtime.getActiveUnit().id).toBe('elira')
    expect(runtime.getInitiativeOrder().map((unit) => unit.id).slice(0, 3)).toEqual([
      'elira',
      'sable',
      'huntmaster',
    ])
  })

  it('finds reachable tiles without crossing water', () => {
    const runtime = makeRuntime()
    const tiles = runtime.getReachableTiles('rowan')

    expect(tiles.some((tile) => tile.point.x === 3 && tile.point.y === 10)).toBe(true)
    expect(tiles.some((tile) => tile.point.x === 7 && tile.point.y === 7)).toBe(false)
  })

  it('applies deployment starting hp overrides for battle-specific balance', () => {
    const runtime = makeRuntime()

    expect(runtime.getUnit('brigandCaptain')?.hp).toBe(27)
    expect(runtime.getUnit('huntmaster')?.hp).toBe(20)
    expect(runtime.getUnit('hexbinder')?.hp).toBe(18)
    expect(runtime.getUnit('cutpurse')?.hp).toBe(21)
    expect(runtime.getUnit('rowan')?.hp).toBe(30)
  })

  it('locks updated neutral forecast numbers for rebalanced striker skills', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 7, 8)
    place(runtime, 'brigandCaptain', 7, 7)

    expect(
      runtime.previewAction({
        actorId: 'rowan',
        kind: 'skill',
        skillId: 'shieldBash',
        targetId: 'brigandCaptain',
      }).primary?.amount,
    ).toBe(4)

    setActive(runtime, 'elira')
    place(runtime, 'elira', 7, 8)
    place(runtime, 'brigandCaptain', 7, 7)
    expect(
      runtime.previewAction({
        actorId: 'elira',
        kind: 'skill',
        skillId: 'snareVolley',
        targetId: 'brigandCaptain',
      }).primary?.amount,
    ).toBe(3)

    setActive(runtime, 'maelin')
    place(runtime, 'maelin', 7, 8)
    place(runtime, 'brigandCaptain', 7, 7)
    expect(
      runtime.previewAction({
        actorId: 'maelin',
        kind: 'skill',
        skillId: 'emberSigil',
        targetId: 'brigandCaptain',
      }).primary?.amount,
    ).toBe(9)

    setActive(runtime, 'sable')
    place(runtime, 'sable', 7, 8)
    place(runtime, 'brigandCaptain', 7, 7)
    expect(
      runtime.previewAction({
        actorId: 'sable',
        kind: 'skill',
        skillId: 'shadowLunge',
        targetId: 'brigandCaptain',
      }).primary?.amount,
    ).toBe(5)
  })

  it('extends support skill ranges for warden and cleric', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'osric')
    place(runtime, 'osric', 7, 8)
    place(runtime, 'rowan', 7, 6)

    expect(
      runtime
        .getTargetsForAction({ actorId: 'osric', kind: 'skill', skillId: 'aegisField' })
        .map((target) => target.unitId),
    ).toContain('rowan')

    setActive(runtime, 'talia')
    place(runtime, 'talia', 7, 8)
    place(runtime, 'rowan', 7, 5)

    expect(
      runtime
        .getTargetsForAction({ actorId: 'talia', kind: 'skill', skillId: 'resolveHymn' })
        .map((target) => target.unitId),
    ).toContain('rowan')
  })

  it('matches forecast and committed attack results', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 5, 5)
    place(runtime, 'brigandCaptain', 5, 4)

    const forecast = runtime.previewAction({
      actorId: 'rowan',
      kind: 'attack',
      targetId: 'brigandCaptain',
    })
    const resolution = runtime.commitAction({
      actorId: 'rowan',
      kind: 'attack',
      targetId: 'brigandCaptain',
    })

    expect(forecast.primary?.amount).toBe(resolution.primary?.amount)
    expect(forecast.counter?.amount).toBe(resolution.counter?.amount)
    expect(runtime.getUnit('brigandCaptain')?.hp).toBe(runtime.state.units.brigandCaptain.hp)
  })

  it('caps stacked burn status and refreshes duration', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'maelin')
    place(runtime, 'maelin', 6, 6)
    place(runtime, 'brigandCaptain', 6, 4)

    runtime.commitAction({
      actorId: 'maelin',
      kind: 'skill',
      skillId: 'emberSigil',
      targetId: 'brigandCaptain',
    })

    setActive(runtime, 'maelin')
    runtime.commitAction({
      actorId: 'maelin',
      kind: 'skill',
      skillId: 'emberSigil',
      targetId: 'brigandCaptain',
    })

    const burn = runtime.getUnit('brigandCaptain')?.statuses.find((status) => status.id === 'burning')
    expect(burn?.stacks).toBe(2)
    expect(burn?.duration).toBe(3)
  })

  it('reports blocked push when the target is at the map edge', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 0, 1)
    place(runtime, 'brigandCaptain', 0, 0)

    const resolution = runtime.commitAction({
      actorId: 'rowan',
      kind: 'skill',
      skillId: 'shieldBash',
      targetId: 'brigandCaptain',
    })

    expect(resolution.primary?.push?.attempted).toBe(true)
    expect(resolution.primary?.push?.succeeded).toBe(false)
    expect(resolution.primary?.push?.blockedReason).toBe('edge')
  })

  it('builds ordered presentation steps for offensive skills with status, push, and counter', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 0, 1)
    place(runtime, 'brigandCaptain', 0, 0)

    const resolution = runtime.commitAction({
      actorId: 'rowan',
      kind: 'skill',
      skillId: 'shieldBash',
      targetId: 'brigandCaptain',
    })

    const steps = resolution.presentation?.steps ?? []

    expect(steps.map((step) => step.kind)).toEqual([
      'announce',
      'cast',
      'hit',
      'status',
      'push',
      'counter',
      'recover',
    ])
    for (const step of steps) {
      expectStepMetadata(step)
    }
    expect(steps.find((step) => step.kind === 'status')?.statusChanges[0]?.statusId).toBe('guardBreak')
    expect(steps.find((step) => step.kind === 'push')?.push).toMatchObject({
      attempted: true,
      succeeded: false,
      blockedReason: 'edge',
    })
    expect(steps.find((step) => step.kind === 'hit')).toMatchObject({
      fxCueId: 'skill.shieldBash',
      sourcePoint: { x: 0, y: 1 },
      targetPoint: { x: 0, y: 0 },
    })
    expect(steps.find((step) => step.kind === 'counter')).toMatchObject({
      valueKind: 'damage',
      targetId: 'rowan',
    })
  })

  it('builds ordered presentation steps for healing skills', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'talia')
    place(runtime, 'talia', 7, 8)
    place(runtime, 'rowan', 7, 7)
    runtime.getUnit('rowan')!.hp = 18

    const resolution = runtime.commitAction({
      actorId: 'talia',
      kind: 'skill',
      skillId: 'resolveHymn',
      targetId: 'rowan',
    })

    const steps = resolution.presentation?.steps ?? []

    expect(steps.map((step) => step.kind)).toEqual([
      'announce',
      'cast',
      'projectile',
      'hit',
      'status',
      'recover',
    ])
    for (const step of steps) {
      expectStepMetadata(step)
    }
    expect(steps.find((step) => step.kind === 'projectile')).toMatchObject({
      targetId: 'rowan',
    })
    expect(steps.find((step) => step.kind === 'hit')).toMatchObject({
      valueKind: 'heal',
      amount: resolution.primary?.amount,
    })
    expect(steps.find((step) => step.kind === 'status')?.statusChanges[0]?.statusId).toBe('warded')
  })

  it('can lose the attacker to a counterattack', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 7, 7)
    place(runtime, 'brigandCaptain', 7, 6)
    runtime.getUnit('rowan')!.hp = 4
    runtime.getUnit('brigandCaptain')!.hp = 30

    const resolution = runtime.commitAction({
      actorId: 'rowan',
      kind: 'attack',
      targetId: 'brigandCaptain',
    })

    expect(resolution.counter?.amount).toBeGreaterThan(0)
    expect(runtime.getUnit('rowan')?.defeated).toBe(true)
  })

  it('detects victory when the last enemy falls', () => {
    const runtime = makeRuntime()

    for (const enemyId of ['huntmaster', 'hexbinder', 'shieldbearer', 'cutpurse', 'fanatic']) {
      runtime.getUnit(enemyId)!.defeated = true
      runtime.getUnit(enemyId)!.hp = 0
    }

    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 5, 5)
    place(runtime, 'brigandCaptain', 5, 4)
    runtime.getUnit('brigandCaptain')!.hp = 2

    runtime.commitAction({
      actorId: 'rowan',
      kind: 'attack',
      targetId: 'brigandCaptain',
    })

    expect(runtime.state.phase).toBe('victory')
  })

  it('can shift objective phase and deploy reinforcements before victory resolves', () => {
    const runtime = makeRuntime(
      makeScriptedDefinition({
        objectivePhases: [
          {
            id: 'assassinate-captain',
            objectiveKey: 'battle.test.objective.assassinate',
            victoryKey: 'battle.test.victory.assassinate',
            victoryConditions: [{ type: 'defeat-unit', unitId: 'captain' }],
          },
          {
            id: 'hold-bridge',
            objectiveKey: 'battle.test.objective.holdBridge',
            victoryKey: 'battle.test.victory.holdBridge',
            victoryConditions: [{ type: 'eliminate-team', team: 'enemies' }],
          },
        ],
        events: [
          {
            id: 'captain-falls',
            trigger: {
              type: 'unit-defeated',
              unitId: 'captain',
              objectivePhaseId: 'assassinate-captain',
            },
            effects: [
              { type: 'set-objective-phase', objectivePhaseId: 'hold-bridge' },
              {
                type: 'deploy-unit',
                unit: {
                  id: 'reinforcement',
                  nameKey: 'unit.cutpurse',
                  classId: 'skirmisher',
                  team: 'enemies',
                  position: { x: 8, y: 4 },
                  aiProfileId: 'opportunist',
                  startingHp: 16,
                },
              },
            ],
          },
        ],
      }),
    )

    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 5, 5)
    place(runtime, 'captain', 5, 4)
    runtime.getUnit('captain')!.hp = 2

    runtime.commitAction({
      actorId: 'rowan',
      kind: 'attack',
      targetId: 'captain',
    })

    expect(runtime.state.phase).toBe('active')
    expect(runtime.state.objectivePhaseId).toBe('hold-bridge')
    expect(runtime.state.objectiveKey).toBe('battle.test.objective.holdBridge')
    expect(runtime.state.victoryKey).toBe('battle.test.victory.holdBridge')
    expect(runtime.getUnit('reinforcement')).toMatchObject({
      team: 'enemies',
      defeated: false,
      hp: 16,
      position: { x: 8, y: 4 },
    })
  })

  it('supports turn-based victory conditions on objective phases', () => {
    const runtime = makeRuntime(
      makeScriptedDefinition({
        objectivePhases: [
          {
            id: 'hold-two-turns',
            objectiveKey: 'battle.test.objective.holdTwoTurns',
            victoryConditions: [{ type: 'turn-at-least', turnIndex: 2 }],
          },
        ],
      }),
    )

    setActive(runtime, 'rowan')

    runtime.commitAction({
      actorId: 'rowan',
      kind: 'wait',
    })

    expect(runtime.state.phase).toBe('victory')
    expect(runtime.state.objectivePhaseId).toBe('hold-two-turns')
  })

  it('supports phase-specific defeat conditions beyond ally wipeout', () => {
    const runtime = makeRuntime(
      makeScriptedDefinition({
        objectivePhases: [
          {
            id: 'protect-rowan',
            objectiveKey: 'battle.test.objective.protectRowan',
            victoryConditions: [{ type: 'eliminate-team', team: 'enemies' }],
            defeatConditions: [{ type: 'defeat-unit', unitId: 'rowan' }],
          },
        ],
      }),
    )

    setActive(runtime, 'captain')
    place(runtime, 'captain', 5, 4)
    place(runtime, 'rowan', 5, 5)
    runtime.getUnit('rowan')!.hp = 1

    runtime.commitAction({
      actorId: 'captain',
      kind: 'attack',
      targetId: 'rowan',
    })

    expect(runtime.getUnit('rowan')?.defeated).toBe(true)
    expect(runtime.getUnit('talia')?.defeated).toBe(false)
    expect(runtime.state.phase).toBe('defeat')
  })

  it('authors the Glenmoor Pass reserve beat around the shieldbearer collapse', () => {
    const runtime = makeRuntime()

    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 11, 5)
    place(runtime, 'shieldbearer', 11, 4)
    runtime.getUnit('shieldbearer')!.hp = 1

    runtime.commitAction({
      actorId: 'rowan',
      kind: 'attack',
      targetId: 'shieldbearer',
    })

    expect(runtime.getUnit('shieldbearer')?.defeated).toBe(true)
    expect(runtime.state.phase).toBe('active')
    expect(runtime.state.objectivePhaseId).toBe('hunt-the-captain')
    expect(runtime.state.objectiveKey).toBe('battle.glenmoorPass.phaseHuntCaptain.objective')
    expect(runtime.state.victoryKey).toBe('battle.glenmoorPass.phaseHuntCaptain.victory')
    expect(runtime.state.defeatKey).toBe('battle.glenmoorPass.phaseHuntCaptain.defeat')
    expect(runtime.getUnit('fordStalker')).toMatchObject({
      team: 'enemies',
      defeated: false,
      hp: 18,
      position: { x: 13, y: 9 },
    })
    expect(runtime.getUnit('roadReaver')).toMatchObject({
      team: 'enemies',
      defeated: false,
      hp: 19,
      position: { x: 12, y: 10 },
    })

    setActive(runtime, 'rowan')
    place(runtime, 'rowan', 12, 4)
    place(runtime, 'brigandCaptain', 12, 3)
    runtime.getUnit('brigandCaptain')!.hp = 1

    runtime.commitAction({
      actorId: 'rowan',
      kind: 'attack',
      targetId: 'brigandCaptain',
    })

    expect(runtime.getUnit('brigandCaptain')?.defeated).toBe(true)
    expect(runtime.getUnit('fordStalker')?.defeated).toBe(false)
    expect(runtime.getUnit('roadReaver')?.defeated).toBe(false)
    expect(runtime.state.phase).toBe('victory')
  })

  it('keeps the original move range available until an action is chosen', () => {
    const runtime = makeRuntime()
    setActive(runtime, 'rowan')

    const originalRange = runtime.getReachableTiles('rowan')
    const allowedPoints = originalRange.map((tile) => tile.point)
    const originalKeys = new Set(originalRange.map((tile) => pointKey(tile.point.x, tile.point.y)))
    const firstDestination = originalRange.find((tile) => tile.point.x === 3 && tile.point.y === 10)

    expect(firstDestination).toBeDefined()
    expect(runtime.repositionActiveUnit(firstDestination!.point, allowedPoints)).toBe(true)

    const secondDestination = originalRange.find((tile) => tile.point.x === 1 && tile.point.y === 11)
    expect(secondDestination).toBeDefined()
    expect(runtime.repositionActiveUnit(secondDestination!.point, allowedPoints)).toBe(true)
    expect(runtime.getUnit('rowan')?.position).toEqual(secondDestination!.point)

    const expandedOnlyFromNewPosition = runtime
      .getReachableTiles('rowan')
      .find((tile) => !originalKeys.has(pointKey(tile.point.x, tile.point.y)))

    expect(expandedOnlyFromNewPosition).toBeDefined()
    expect(runtime.repositionActiveUnit(expandedOnlyFromNewPosition!.point, allowedPoints)).toBe(false)
    expect(runtime.getUnit('rowan')?.position).toEqual(secondDestination!.point)
  })
})
