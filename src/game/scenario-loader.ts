import type {
  BattleDefinition,
  BattleEventEffect,
  BattleEventTrigger,
  BattleObjectiveCondition,
  BattleObjectivePhaseDefinition,
  BattleScriptedEvent,
  Direction,
  GridPoint,
  Team,
  UnitBlueprint,
} from './types'

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object at ${path}`)
  }

  return value as Record<string, unknown>
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected non-empty string at ${path}`)
  }

  return value
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined
  }

  return expectString(value, path)
}

function expectInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Expected integer at ${path}`)
  }

  return value
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean at ${path}`)
  }

  return value
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array at ${path}`)
  }

  return value
}

function expectTeam(value: unknown, path: string): Team {
  if (value === 'allies' || value === 'enemies') {
    return value
  }

  throw new Error(`Expected team at ${path}`)
}

function optionalDirection(value: unknown, path: string): Direction | undefined {
  if (value === undefined) {
    return undefined
  }

  if (value === 'north' || value === 'south' || value === 'east' || value === 'west') {
    return value
  }

  throw new Error(`Expected direction at ${path}`)
}

function parsePoint(value: unknown, path: string): GridPoint {
  const record = expectRecord(value, path)

  return {
    x: expectInteger(record.x, `${path}.x`),
    y: expectInteger(record.y, `${path}.y`),
  }
}

function parseUnitBlueprint(value: unknown, path: string): UnitBlueprint {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`),
    nameKey: expectString(record.nameKey, `${path}.nameKey`),
    classId: expectString(record.classId, `${path}.classId`),
    team: expectTeam(record.team, `${path}.team`),
    position: parsePoint(record.position, `${path}.position`),
    aiProfileId: expectString(record.aiProfileId, `${path}.aiProfileId`),
    startingHp: record.startingHp === undefined ? undefined : expectInteger(record.startingHp, `${path}.startingHp`),
  }
}

function parseObjectiveCondition(value: unknown, path: string): BattleObjectiveCondition {
  const record = expectRecord(value, path)
  const type = expectString(record.type, `${path}.type`)

  if (type === 'eliminate-team') {
    return {
      type,
      team: expectTeam(record.team, `${path}.team`),
    }
  }

  if (type === 'defeat-unit') {
    return {
      type,
      unitId: expectString(record.unitId, `${path}.unitId`),
    }
  }

  if (type === 'turn-at-least') {
    return {
      type,
      turnIndex: expectInteger(record.turnIndex, `${path}.turnIndex`),
    }
  }

  throw new Error(`Unsupported objective condition at ${path}.type`)
}

function parseObjectivePhase(value: unknown, path: string): BattleObjectivePhaseDefinition {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`),
    objectiveKey: expectString(record.objectiveKey, `${path}.objectiveKey`),
    briefingKey: optionalString(record.briefingKey, `${path}.briefingKey`),
    victoryKey: optionalString(record.victoryKey, `${path}.victoryKey`),
    defeatKey: optionalString(record.defeatKey, `${path}.defeatKey`),
    announcementKey: optionalString(record.announcementKey, `${path}.announcementKey`),
    announcementCueId: optionalString(record.announcementCueId, `${path}.announcementCueId`),
    victoryConditions: expectArray(record.victoryConditions, `${path}.victoryConditions`).map((condition, index) =>
      parseObjectiveCondition(condition, `${path}.victoryConditions[${index}]`),
    ),
    defeatConditions:
      record.defeatConditions === undefined
        ? undefined
        : expectArray(record.defeatConditions, `${path}.defeatConditions`).map((condition, index) =>
            parseObjectiveCondition(condition, `${path}.defeatConditions[${index}]`),
          ),
  }
}

function parseEventTrigger(value: unknown, path: string): BattleEventTrigger {
  const record = expectRecord(value, path)
  const type = expectString(record.type, `${path}.type`)
  const objectivePhaseId = optionalString(record.objectivePhaseId, `${path}.objectivePhaseId`)

  if (type === 'battle-start') {
    return {
      type,
      objectivePhaseId,
    }
  }

  if (type === 'turn-start') {
    return {
      type,
      turnIndex: record.turnIndex === undefined ? undefined : expectInteger(record.turnIndex, `${path}.turnIndex`),
      team: record.team === undefined ? undefined : expectTeam(record.team, `${path}.team`),
      unitId: optionalString(record.unitId, `${path}.unitId`),
      objectivePhaseId,
    }
  }

  if (type === 'unit-defeated') {
    return {
      type,
      team: record.team === undefined ? undefined : expectTeam(record.team, `${path}.team`),
      unitId: optionalString(record.unitId, `${path}.unitId`),
      objectivePhaseId,
    }
  }

  throw new Error(`Unsupported event trigger at ${path}.type`)
}

function parseEventEffect(value: unknown, path: string): BattleEventEffect {
  const record = expectRecord(value, path)
  const type = expectString(record.type, `${path}.type`)

  if (type === 'set-objective-phase') {
    return {
      type,
      objectivePhaseId: expectString(record.objectivePhaseId, `${path}.objectivePhaseId`),
    }
  }

  if (type === 'deploy-unit') {
    return {
      type,
      unit: parseUnitBlueprint(record.unit, `${path}.unit`),
      facing: optionalDirection(record.facing, `${path}.facing`),
      nextActAt: record.nextActAt === undefined ? undefined : expectInteger(record.nextActAt, `${path}.nextActAt`),
    }
  }

  throw new Error(`Unsupported event effect at ${path}.type`)
}

function parseScriptedEvent(value: unknown, path: string): BattleScriptedEvent {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`),
    once: record.once === undefined ? undefined : expectBoolean(record.once, `${path}.once`),
    trigger: parseEventTrigger(record.trigger, `${path}.trigger`),
    effects: expectArray(record.effects, `${path}.effects`).map((effect, index) =>
      parseEventEffect(effect, `${path}.effects[${index}]`),
    ),
  }
}

function assertUnique(ids: string[], label: string, sourceName: string): void {
  const seen = new Set<string>()

  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate ${label} "${id}" in ${sourceName}`)
    }

    seen.add(id)
  }
}

export function loadBattleDefinition(raw: unknown, sourceName: string): BattleDefinition {
  const record = expectRecord(raw, sourceName)
  const objectivePhases =
    record.objectivePhases === undefined
      ? undefined
      : expectArray(record.objectivePhases, `${sourceName}.objectivePhases`).map((phase, index) =>
          parseObjectivePhase(phase, `${sourceName}.objectivePhases[${index}]`),
        )
  const events =
    record.events === undefined
      ? undefined
      : expectArray(record.events, `${sourceName}.events`).map((event, index) =>
          parseScriptedEvent(event, `${sourceName}.events[${index}]`),
        )

  const definition: BattleDefinition = {
    id: expectString(record.id, `${sourceName}.id`),
    titleKey: expectString(record.titleKey, `${sourceName}.titleKey`),
    objectiveKey: expectString(record.objectiveKey, `${sourceName}.objectiveKey`),
    briefingKey: expectString(record.briefingKey, `${sourceName}.briefingKey`),
    victoryKey: expectString(record.victoryKey, `${sourceName}.victoryKey`),
    defeatKey: expectString(record.defeatKey, `${sourceName}.defeatKey`),
    mapId: expectString(record.mapId, `${sourceName}.mapId`),
    objectivePhases,
    events,
    allies: expectArray(record.allies, `${sourceName}.allies`).map((unit, index) =>
      parseUnitBlueprint(unit, `${sourceName}.allies[${index}]`),
    ),
    enemies: expectArray(record.enemies, `${sourceName}.enemies`).map((unit, index) =>
      parseUnitBlueprint(unit, `${sourceName}.enemies[${index}]`),
    ),
  }

  assertUnique(
    [...definition.allies, ...definition.enemies, ...(definition.events ?? []).flatMap((event) =>
      event.effects.flatMap((effect) => (effect.type === 'deploy-unit' ? [effect.unit] : [])),
    )].map((unit) => unit.id),
    'unit id',
    sourceName,
  )

  if (definition.objectivePhases) {
    assertUnique(
      definition.objectivePhases.map((phase) => phase.id),
      'objective phase id',
      sourceName,
    )
  }

  if (definition.events) {
    assertUnique(
      definition.events.map((event) => event.id),
      'event id',
      sourceName,
    )
  }

  const phaseIds = new Set((definition.objectivePhases ?? []).map((phase) => phase.id))

  for (const event of definition.events ?? []) {
    if (event.trigger.objectivePhaseId && !phaseIds.has(event.trigger.objectivePhaseId)) {
      throw new Error(`Unknown objective phase "${event.trigger.objectivePhaseId}" in ${sourceName} event trigger`)
    }

    for (const effect of event.effects) {
      if (effect.type === 'set-objective-phase' && !phaseIds.has(effect.objectivePhaseId)) {
        throw new Error(`Unknown objective phase "${effect.objectivePhaseId}" in ${sourceName} event effect`)
      }
    }
  }

  return definition
}

export function validateBattleDefinitionContent(
  definition: BattleDefinition,
  options: {
    classIds: Iterable<string>
    aiProfileIds: Iterable<string>
  },
): BattleDefinition {
  const classIds = new Set(options.classIds)
  const aiProfileIds = new Set(options.aiProfileIds)
  const knownUnitIds = new Set(
    [...definition.allies, ...definition.enemies, ...(definition.events ?? []).flatMap((event) =>
      event.effects.flatMap((effect) => (effect.type === 'deploy-unit' ? [effect.unit] : [])),
    )].map((unit) => unit.id),
  )
  const phaseIds = new Set((definition.objectivePhases ?? []).map((phase) => phase.id))

  for (const unit of [...definition.allies, ...definition.enemies]) {
    if (!classIds.has(unit.classId)) {
      throw new Error(`Unknown classId "${unit.classId}" in battle definition "${definition.id}"`)
    }

    if (!aiProfileIds.has(unit.aiProfileId)) {
      throw new Error(`Unknown aiProfileId "${unit.aiProfileId}" in battle definition "${definition.id}"`)
    }
  }

  for (const event of definition.events ?? []) {
    if (
      (event.trigger.type === 'turn-start' || event.trigger.type === 'unit-defeated') &&
      event.trigger.unitId &&
      !knownUnitIds.has(event.trigger.unitId)
    ) {
      throw new Error(`Unknown trigger unitId "${event.trigger.unitId}" in battle definition "${definition.id}"`)
    }

    if (event.trigger.objectivePhaseId && !phaseIds.has(event.trigger.objectivePhaseId)) {
      throw new Error(`Unknown trigger objectivePhaseId "${event.trigger.objectivePhaseId}" in battle definition "${definition.id}"`)
    }

    for (const effect of event.effects) {
      if (effect.type === 'deploy-unit') {
        if (!classIds.has(effect.unit.classId)) {
          throw new Error(`Unknown deploy-unit classId "${effect.unit.classId}" in battle definition "${definition.id}"`)
        }

        if (!aiProfileIds.has(effect.unit.aiProfileId)) {
          throw new Error(`Unknown deploy-unit aiProfileId "${effect.unit.aiProfileId}" in battle definition "${definition.id}"`)
        }
      }

      if (effect.type === 'set-objective-phase' && !phaseIds.has(effect.objectivePhaseId)) {
        throw new Error(`Unknown effect objectivePhaseId "${effect.objectivePhaseId}" in battle definition "${definition.id}"`)
      }
    }
  }

  for (const phase of definition.objectivePhases ?? []) {
    for (const condition of [...phase.victoryConditions, ...(phase.defeatConditions ?? [])]) {
      if (condition.type === 'defeat-unit' && !knownUnitIds.has(condition.unitId)) {
        throw new Error(`Unknown objective unitId "${condition.unitId}" in battle definition "${definition.id}"`)
      }
    }
  }

  return definition
}
