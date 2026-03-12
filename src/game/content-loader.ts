import type {
  AIProfile,
  AttackFlavor,
  CameraCue,
  ClassDefinition,
  ImpactWeight,
  MatterProfile,
  PresentationProfile,
  PresentationTone,
  SkillDefinition,
  SkillEffect,
  SkillTargetType,
  Stats,
  StatusDefinition,
  StatusKey,
  TelegraphStyle,
} from './types'

export interface LoadedContentDefinitions {
  statusDefinitions: Record<string, StatusDefinition>
  skillDefinitions: Record<string, SkillDefinition>
  classDefinitions: Record<string, ClassDefinition>
  aiProfiles: Record<string, AIProfile>
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Expected object at ${path}`)
  }

  return value as Record<string, unknown>
}

function expectArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array at ${path}`)
  }

  return value
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected non-empty string at ${path}`)
  }

  return value
}

function expectInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Expected integer at ${path}`)
  }

  return value
}

function expectNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Expected number at ${path}`)
  }

  return value
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean at ${path}`)
  }

  return value
}

function expectAttackFlavor(value: unknown, path: string): AttackFlavor {
  if (value === 'power' || value === 'magic') {
    return value
  }

  throw new Error(`Expected attack flavor at ${path}`)
}

function expectSkillTargetType(value: unknown, path: string): SkillTargetType {
  if (value === 'enemy' || value === 'ally' || value === 'self') {
    return value
  }

  throw new Error(`Expected skill target type at ${path}`)
}

function expectTelegraphStyle(value: unknown, path: string): TelegraphStyle {
  if (value === 'attack' || value === 'skill' || value === 'support' || value === 'status' || value === 'move' || value === 'counter') {
    return value
  }

  throw new Error(`Expected telegraph style at ${path}`)
}

function expectImpactWeight(value: unknown, path: string): ImpactWeight {
  if (value === 'light' || value === 'medium' || value === 'heavy' || value === 'finisher') {
    return value
  }

  throw new Error(`Expected impact weight at ${path}`)
}

function expectPresentationTone(value: unknown, path: string): PresentationTone {
  if (
    value === 'steel' ||
    value === 'ember' ||
    value === 'ward' ||
    value === 'shadow' ||
    value === 'wind' ||
    value === 'radiant' ||
    value === 'hazard' ||
    value === 'neutral'
  ) {
    return value
  }

  throw new Error(`Expected presentation tone at ${path}`)
}

function expectCameraCue(value: unknown, path: string): CameraCue {
  if (
    value === 'none' ||
    value === 'impact-light' ||
    value === 'impact-heavy' ||
    value === 'support-pulse' ||
    value === 'counter-jolt' ||
    value === 'defeat-drop'
  ) {
    return value
  }

  throw new Error(`Expected camera cue at ${path}`)
}

function expectMatterProfile(value: unknown, path: string): MatterProfile {
  if (
    value === 'slash-spark' ||
    value === 'shock-ring' ||
    value === 'arrow-streak' ||
    value === 'ember-plume' ||
    value === 'light-shards' ||
    value === 'dash-burst' ||
    value === 'ward-orbit' ||
    value === 'slow-haze' ||
    value === 'guard-fragments' ||
    value === 'magic-bolt'
  ) {
    return value
  }

  throw new Error(`Expected matter profile at ${path}`)
}

function parsePresentationProfile(value: unknown, path: string): PresentationProfile {
  const record = expectRecord(value, path)

  return {
    fxCueId: expectString(record.fxCueId, `${path}.fxCueId`),
    sfxCueId: expectString(record.sfxCueId, `${path}.sfxCueId`),
    telegraphStyle: expectTelegraphStyle(record.telegraphStyle, `${path}.telegraphStyle`),
    impactWeight: expectImpactWeight(record.impactWeight, `${path}.impactWeight`),
    castMs: expectInteger(record.castMs, `${path}.castMs`),
    impactMs: expectInteger(record.impactMs, `${path}.impactMs`),
    hitStopMs: expectInteger(record.hitStopMs, `${path}.hitStopMs`),
    lingerMs: expectInteger(record.lingerMs, `${path}.lingerMs`),
    cameraCue: expectCameraCue(record.cameraCue, `${path}.cameraCue`),
    matterProfile: expectMatterProfile(record.matterProfile, `${path}.matterProfile`),
    tone: expectPresentationTone(record.tone, `${path}.tone`),
  }
}

function parseStatusDefinition(value: unknown, path: string): StatusDefinition {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`) as StatusDefinition['id'],
    labelKey: expectString(record.labelKey, `${path}.labelKey`),
    descriptionKey: expectString(record.descriptionKey, `${path}.descriptionKey`),
    maxStacks: expectInteger(record.maxStacks, `${path}.maxStacks`),
    presentation: parsePresentationProfile(record.presentation, `${path}.presentation`),
  }
}

function parseSkillEffect(value: unknown, path: string): SkillEffect {
  const record = expectRecord(value, path)
  const type = expectString(record.type, `${path}.type`)

  if (type === 'damage') {
    return {
      type,
      amount: expectInteger(record.amount, `${path}.amount`),
      flavor: expectAttackFlavor(record.flavor, `${path}.flavor`),
    }
  }

  if (type === 'heal') {
    return {
      type,
      amount: expectInteger(record.amount, `${path}.amount`),
    }
  }

  if (type === 'status') {
    return {
      type,
      statusId: expectString(record.statusId, `${path}.statusId`) as StatusKey,
      stacks: expectInteger(record.stacks, `${path}.stacks`),
      duration: expectInteger(record.duration, `${path}.duration`),
    }
  }

  if (type === 'push') {
    return {
      type,
      distance: expectInteger(record.distance, `${path}.distance`),
    }
  }

  throw new Error(`Unsupported skill effect at ${path}.type`)
}

function parseSkillDefinition(value: unknown, path: string): SkillDefinition {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`),
    nameKey: expectString(record.nameKey, `${path}.nameKey`),
    descriptionKey: expectString(record.descriptionKey, `${path}.descriptionKey`),
    targetType: expectSkillTargetType(record.targetType, `${path}.targetType`),
    rangeMin: expectInteger(record.rangeMin, `${path}.rangeMin`),
    rangeMax: expectInteger(record.rangeMax, `${path}.rangeMax`),
    effects: expectArray(record.effects, `${path}.effects`).map((effect, index) =>
      parseSkillEffect(effect, `${path}.effects[${index}]`),
    ),
    counterable: expectBoolean(record.counterable, `${path}.counterable`),
    presentation: parsePresentationProfile(record.presentation, `${path}.presentation`),
  }
}

function parseStats(value: unknown, path: string): Stats {
  const record = expectRecord(value, path)

  return {
    maxHp: expectInteger(record.maxHp, `${path}.maxHp`),
    power: expectInteger(record.power, `${path}.power`),
    magic: expectInteger(record.magic, `${path}.magic`),
    defense: expectInteger(record.defense, `${path}.defense`),
    resistance: expectInteger(record.resistance, `${path}.resistance`),
    speed: expectInteger(record.speed, `${path}.speed`),
    move: expectInteger(record.move, `${path}.move`),
    maxClimb: expectInteger(record.maxClimb, `${path}.maxClimb`),
  }
}

function parseClassDefinition(value: unknown, path: string): ClassDefinition {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`),
    nameKey: expectString(record.nameKey, `${path}.nameKey`),
    roleKey: expectString(record.roleKey, `${path}.roleKey`),
    basicAttackNameKey: expectString(record.basicAttackNameKey, `${path}.basicAttackNameKey`),
    basicAttackPresentationId: expectString(record.basicAttackPresentationId, `${path}.basicAttackPresentationId`),
    basicAttackFlavor: expectAttackFlavor(record.basicAttackFlavor, `${path}.basicAttackFlavor`),
    basicAttackPower: expectInteger(record.basicAttackPower, `${path}.basicAttackPower`),
    basicAttackRangeMin: expectInteger(record.basicAttackRangeMin, `${path}.basicAttackRangeMin`),
    basicAttackRangeMax: expectInteger(record.basicAttackRangeMax, `${path}.basicAttackRangeMax`),
    signatureSkillId: expectString(record.signatureSkillId, `${path}.signatureSkillId`),
    stats: parseStats(record.stats, `${path}.stats`),
  }
}

function parseAIProfile(value: unknown, path: string): AIProfile {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`),
    aggression: expectNumber(record.aggression, `${path}.aggression`),
    support: expectNumber(record.support, `${path}.support`),
    riskTolerance: expectNumber(record.riskTolerance, `${path}.riskTolerance`),
    terrainBias: expectNumber(record.terrainBias, `${path}.terrainBias`),
    controlBias: expectNumber(record.controlBias, `${path}.controlBias`),
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

function loadDefinitionRecord<T extends { id: string }>(
  raw: unknown,
  sourceName: string,
  label: string,
  parser: (value: unknown, path: string) => T,
): Record<string, T> {
  const definitions = expectArray(raw, sourceName).map((value, index) => parser(value, `${sourceName}[${index}]`))

  assertUnique(
    definitions.map((definition) => definition.id),
    label,
    sourceName,
  )

  return Object.fromEntries(definitions.map((definition) => [definition.id, definition]))
}

export function loadStatusDefinitions(raw: unknown, sourceName: string): Record<string, StatusDefinition> {
  return loadDefinitionRecord(raw, sourceName, 'status id', parseStatusDefinition)
}

export function loadSkillDefinitions(raw: unknown, sourceName: string): Record<string, SkillDefinition> {
  return loadDefinitionRecord(raw, sourceName, 'skill id', parseSkillDefinition)
}

export function loadClassDefinitions(raw: unknown, sourceName: string): Record<string, ClassDefinition> {
  return loadDefinitionRecord(raw, sourceName, 'class id', parseClassDefinition)
}

export function loadAIProfiles(raw: unknown, sourceName: string): Record<string, AIProfile> {
  return loadDefinitionRecord(raw, sourceName, 'ai profile id', parseAIProfile)
}

export function validateContentDefinitions(
  definitions: LoadedContentDefinitions,
  options: {
    attackPresentationIds: Iterable<string>
  },
): LoadedContentDefinitions {
  const statusIds = new Set(Object.keys(definitions.statusDefinitions))
  const skillIds = new Set(Object.keys(definitions.skillDefinitions))
  const attackPresentationIds = new Set(options.attackPresentationIds)

  for (const skill of Object.values(definitions.skillDefinitions)) {
    if (skill.rangeMin > skill.rangeMax) {
      throw new Error(`Invalid range on skill "${skill.id}"`)
    }

    for (const effect of skill.effects) {
      if (effect.type === 'status' && !statusIds.has(effect.statusId)) {
        throw new Error(`Unknown skill statusId "${effect.statusId}" on skill "${skill.id}"`)
      }
    }
  }

  for (const classDefinition of Object.values(definitions.classDefinitions)) {
    if (!skillIds.has(classDefinition.signatureSkillId)) {
      throw new Error(`Unknown signatureSkillId "${classDefinition.signatureSkillId}" on class "${classDefinition.id}"`)
    }

    if (!attackPresentationIds.has(classDefinition.basicAttackPresentationId)) {
      throw new Error(
        `Unknown basicAttackPresentationId "${classDefinition.basicAttackPresentationId}" on class "${classDefinition.id}"`,
      )
    }

    if (classDefinition.basicAttackRangeMin > classDefinition.basicAttackRangeMax) {
      throw new Error(`Invalid attack range on class "${classDefinition.id}"`)
    }
  }

  return definitions
}
