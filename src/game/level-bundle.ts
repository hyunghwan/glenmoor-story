import { loadBattleDefinition, validateBattleDefinitionContent } from './scenario-loader'
import type {
  BattleDefinition,
  BattleEventEffect,
  BattleEventTrigger,
  BattleObjectiveCondition,
  Direction,
  GridPoint,
  Locale,
  Team,
  TerrainKey,
  TiledMapData,
  UnitBlueprint,
} from './types'

export const LEVEL_BUNDLE_VERSION = 1
export const LEVEL_BUNDLE_PREVIEW_MESSAGE = 'glenmoor:preview-level-bundle'

const terrainValueMap: Record<TerrainKey, number> = {
  grass: 1,
  road: 2,
  forest: 3,
  water: 4,
  stone: 5,
  bridge: 6,
  ruins: 7,
}

export interface LevelBundleMeta {
  author?: string
  description?: string
  tags?: string[]
}

export interface LevelBundleLocalePhaseText {
  objective: string
  briefing?: string
  victory?: string
  defeat?: string
  announcement?: string
}

export interface LevelBundleLocaleText {
  title: string
  objective: string
  briefing: string
  victory: string
  defeat: string
  units: Record<string, string>
  phases: Record<string, LevelBundleLocalePhaseText>
}

export interface LevelBundleText {
  ko: LevelBundleLocaleText
  en?: Partial<Omit<LevelBundleLocaleText, 'units' | 'phases'>> & {
    units?: Record<string, string>
    phases?: Record<string, Partial<LevelBundleLocalePhaseText>>
  }
}

export interface LevelBundleMap {
  width: number
  height: number
  tileWidth: number
  tileHeight: number
  terrain: TerrainKey[][]
  elevation: number[][]
}

export interface LevelBundlePlacedUnit {
  id: string
  classId: string
  position: GridPoint
  facing?: Direction
  aiProfileId: string
  startingHp?: number
}

export interface LevelBundleObjectivePhase {
  id: string
  announcementCueId?: string
  victoryConditions: BattleObjectiveCondition[]
  defeatConditions?: BattleObjectiveCondition[]
}

export interface LevelBundleObjective {
  initialPhaseId?: string
  phases: LevelBundleObjectivePhase[]
}

export interface LevelBundleDeployUnit extends LevelBundlePlacedUnit {
  team: Team
}

export type LevelBundleEventEffect =
  | {
      type: 'set-objective-phase'
      objectivePhaseId: string
    }
  | {
      type: 'deploy-unit'
      unit: LevelBundleDeployUnit
      nextActAt?: number
    }

export interface LevelBundleEvent {
  id: string
  once?: boolean
  trigger: BattleEventTrigger
  effects: LevelBundleEventEffect[]
}

export interface LevelBundleV1 {
  version: 1
  id: string
  slug: string
  meta?: LevelBundleMeta
  text: LevelBundleText
  map: LevelBundleMap
  units: {
    allies: LevelBundlePlacedUnit[]
    enemies: LevelBundlePlacedUnit[]
  }
  objective: LevelBundleObjective
  events: LevelBundleEvent[]
}

export interface CompiledLevelBundle {
  bundle: LevelBundleV1
  mapData: TiledMapData
  battleDefinition: BattleDefinition
  localeOverlay: Partial<Record<Locale, Record<string, string>>>
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
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected non-empty string at ${path}`)
  }

  return value.trim()
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null || value === '') {
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

function optionalInteger(value: unknown, path: string): number | undefined {
  if (value === undefined) {
    return undefined
  }

  return expectInteger(value, path)
}

function expectBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Expected boolean at ${path}`)
  }

  return value
}

function expectTerrainKey(value: unknown, path: string): TerrainKey {
  if (
    value === 'grass' ||
    value === 'road' ||
    value === 'forest' ||
    value === 'water' ||
    value === 'stone' ||
    value === 'bridge' ||
    value === 'ruins'
  ) {
    return value
  }

  throw new Error(`Expected terrain key at ${path}`)
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

  if (value === 'north' || value === 'east' || value === 'south' || value === 'west') {
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
      turnIndex: optionalInteger(record.turnIndex, `${path}.turnIndex`),
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

function parsePlacedUnit(value: unknown, path: string): LevelBundlePlacedUnit {
  const record = expectRecord(value, path)

  return {
    id: expectString(record.id, `${path}.id`),
    classId: expectString(record.classId, `${path}.classId`),
    position: parsePoint(record.position, `${path}.position`),
    facing: optionalDirection(record.facing, `${path}.facing`),
    aiProfileId: expectString(record.aiProfileId, `${path}.aiProfileId`),
    startingHp: optionalInteger(record.startingHp, `${path}.startingHp`),
  }
}

function parseDeployUnit(value: unknown, path: string): LevelBundleDeployUnit {
  const record = expectRecord(value, path)
  const unit = parsePlacedUnit(value, path)

  return {
    ...unit,
    team: expectTeam(record.team, `${path}.team`),
  }
}

function parseEventEffect(value: unknown, path: string): LevelBundleEventEffect {
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
      unit: parseDeployUnit(record.unit, `${path}.unit`),
      nextActAt: optionalInteger(record.nextActAt, `${path}.nextActAt`),
    }
  }

  throw new Error(`Unsupported event effect at ${path}.type`)
}

function parsePhaseText(
  value: unknown,
  path: string,
  required = true,
): LevelBundleLocalePhaseText | Partial<LevelBundleLocalePhaseText> {
  const record = expectRecord(value, path)
  const objective = required ? expectString(record.objective, `${path}.objective`) : optionalString(record.objective, `${path}.objective`)

  return {
    ...(objective ? { objective } : {}),
    briefing: optionalString(record.briefing, `${path}.briefing`),
    victory: optionalString(record.victory, `${path}.victory`),
    defeat: optionalString(record.defeat, `${path}.defeat`),
    announcement: optionalString(record.announcement, `${path}.announcement`),
  }
}

function parseLocaleText(value: unknown, path: string, required = true): LevelBundleLocaleText | LevelBundleText['en'] {
  const record = expectRecord(value, path)
  const phasesRecord = expectRecord(record.phases, `${path}.phases`)
  const unitsRecord = expectRecord(record.units, `${path}.units`)

  const units = Object.fromEntries(
    Object.entries(unitsRecord).map(([unitId, unitName]) => [unitId, expectString(unitName, `${path}.units.${unitId}`)]),
  )
  const phases = Object.fromEntries(
    Object.entries(phasesRecord).map(([phaseId, phaseValue]) => [
      phaseId,
      parsePhaseText(phaseValue, `${path}.phases.${phaseId}`, required),
    ]),
  )

  return {
    ...(required ? { title: expectString(record.title, `${path}.title`) } : { title: optionalString(record.title, `${path}.title`) }),
    ...(required ? { objective: expectString(record.objective, `${path}.objective`) } : { objective: optionalString(record.objective, `${path}.objective`) }),
    ...(required ? { briefing: expectString(record.briefing, `${path}.briefing`) } : { briefing: optionalString(record.briefing, `${path}.briefing`) }),
    ...(required ? { victory: expectString(record.victory, `${path}.victory`) } : { victory: optionalString(record.victory, `${path}.victory`) }),
    ...(required ? { defeat: expectString(record.defeat, `${path}.defeat`) } : { defeat: optionalString(record.defeat, `${path}.defeat`) }),
    units,
    phases,
  } as LevelBundleLocaleText | LevelBundleText['en']
}

function slugSegment(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function buildKey(slug: string, suffix: string): string {
  return `level.${slugSegment(slug)}.${suffix}`
}

function buildUnitBlueprint(
  slug: string,
  team: Team,
  unit: LevelBundlePlacedUnit,
): UnitBlueprint {
  return {
    id: unit.id,
    nameKey: buildKey(slug, `unit.${slugSegment(unit.id)}.name`),
    classId: unit.classId,
    team,
    position: { ...unit.position },
    facing: unit.facing,
    aiProfileId: unit.aiProfileId,
    startingHp: unit.startingHp,
  }
}

function buildDeployEffect(slug: string, effect: Extract<LevelBundleEventEffect, { type: 'deploy-unit' }>): Extract<BattleEventEffect, { type: 'deploy-unit' }> {
  return {
    type: 'deploy-unit',
    unit: {
      ...buildUnitBlueprint(slug, effect.unit.team, effect.unit),
      team: effect.unit.team,
    },
    facing: effect.unit.facing,
    nextActAt: effect.nextActAt,
  }
}

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getPhaseLocaleText(
  text: LevelBundleText,
  phaseId: string,
  locale: Locale,
): Partial<LevelBundleLocalePhaseText> {
  const primary = locale === 'en' ? text.en?.phases?.[phaseId] : text.ko.phases[phaseId]
  const fallback = text.ko.phases[phaseId]

  return {
    objective: primary?.objective ?? fallback?.objective,
    briefing: primary?.briefing ?? fallback?.briefing,
    victory: primary?.victory ?? fallback?.victory,
    defeat: primary?.defeat ?? fallback?.defeat,
    announcement: primary?.announcement ?? fallback?.announcement,
  }
}

function getLocaleValue(
  locale: Locale,
  text: LevelBundleText,
  key: keyof Omit<LevelBundleLocaleText, 'units' | 'phases'>,
): string {
  if (locale === 'en') {
    const englishValue = text.en?.[key]

    if (hasText(englishValue)) {
      return englishValue
    }
  }

  return text.ko[key]
}

export function createLevelLocaleOverlay(bundle: LevelBundleV1): Partial<Record<Locale, Record<string, string>>> {
  const overlay: Partial<Record<Locale, Record<string, string>>> = {
    ko: {},
    en: {},
  }

  for (const locale of ['ko', 'en'] as const) {
    const bundleOverlay = overlay[locale]!
    bundleOverlay[buildKey(bundle.slug, 'title')] = getLocaleValue(locale, bundle.text, 'title')
    bundleOverlay[buildKey(bundle.slug, 'objective')] = getLocaleValue(locale, bundle.text, 'objective')
    bundleOverlay[buildKey(bundle.slug, 'briefing')] = getLocaleValue(locale, bundle.text, 'briefing')
    bundleOverlay[buildKey(bundle.slug, 'victory')] = getLocaleValue(locale, bundle.text, 'victory')
    bundleOverlay[buildKey(bundle.slug, 'defeat')] = getLocaleValue(locale, bundle.text, 'defeat')

    for (const unit of [...bundle.units.allies, ...bundle.units.enemies]) {
      const unitName =
        (locale === 'en' ? bundle.text.en?.units?.[unit.id] : undefined) ??
        bundle.text.ko.units[unit.id]
      bundleOverlay[buildKey(bundle.slug, `unit.${slugSegment(unit.id)}.name`)] = unitName
    }

    for (const phase of bundle.objective.phases) {
      const phaseText = getPhaseLocaleText(bundle.text, phase.id, locale)
      bundleOverlay[buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.objective`)] = phaseText.objective ?? bundle.text.ko.objective

      if (hasText(phaseText.briefing)) {
        bundleOverlay[buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.briefing`)] = phaseText.briefing
      }

      if (hasText(phaseText.victory)) {
        bundleOverlay[buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.victory`)] = phaseText.victory
      }

      if (hasText(phaseText.defeat)) {
        bundleOverlay[buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.defeat`)] = phaseText.defeat
      }

      if (hasText(phaseText.announcement)) {
        bundleOverlay[buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.announcement`)] = phaseText.announcement
      }
    }
  }

  return overlay
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

function assertPointInBounds(point: GridPoint, map: LevelBundleMap, label: string, sourceName: string): void {
  if (point.x < 0 || point.y < 0 || point.x >= map.width || point.y >= map.height) {
    throw new Error(`${label} at ${point.x},${point.y} is out of bounds in ${sourceName}`)
  }
}

function validateMatrixDimensions<T>(matrix: T[][], width: number, height: number, path: string): void {
  if (matrix.length !== height) {
    throw new Error(`Expected ${height} rows at ${path}`)
  }

  matrix.forEach((row, rowIndex) => {
    if (row.length !== width) {
      throw new Error(`Expected ${width} columns at ${path}[${rowIndex}]`)
    }
  })
}

export function loadLevelBundle(raw: unknown, sourceName: string): LevelBundleV1 {
  const record = expectRecord(raw, sourceName)
  const mapRecord = expectRecord(record.map, `${sourceName}.map`)
  const objectiveRecord = expectRecord(record.objective, `${sourceName}.objective`)
  const unitsRecord = expectRecord(record.units, `${sourceName}.units`)
  const meta = record.meta === undefined ? undefined : expectRecord(record.meta, `${sourceName}.meta`)

  const bundle: LevelBundleV1 = {
    version: expectInteger(record.version, `${sourceName}.version`) as LevelBundleV1['version'],
    id: expectString(record.id, `${sourceName}.id`),
    slug: expectString(record.slug, `${sourceName}.slug`),
    meta:
      meta === undefined
        ? undefined
        : {
            author: optionalString(meta.author, `${sourceName}.meta.author`),
            description: optionalString(meta.description, `${sourceName}.meta.description`),
            tags:
              meta.tags === undefined
                ? undefined
                : expectArray(meta.tags, `${sourceName}.meta.tags`).map((tag, index) =>
                    expectString(tag, `${sourceName}.meta.tags[${index}]`),
                  ),
          },
    text: {
      ko: parseLocaleText(record.text ? expectRecord(record.text, `${sourceName}.text`).ko : undefined, `${sourceName}.text.ko`) as LevelBundleLocaleText,
      en:
        record.text && expectRecord(record.text, `${sourceName}.text`).en !== undefined
          ? (parseLocaleText(expectRecord(record.text, `${sourceName}.text`).en, `${sourceName}.text.en`, false) as LevelBundleText['en'])
          : undefined,
    },
    map: {
      width: expectInteger(mapRecord.width, `${sourceName}.map.width`),
      height: expectInteger(mapRecord.height, `${sourceName}.map.height`),
      tileWidth: expectInteger(mapRecord.tileWidth, `${sourceName}.map.tileWidth`),
      tileHeight: expectInteger(mapRecord.tileHeight, `${sourceName}.map.tileHeight`),
      terrain: expectArray(mapRecord.terrain, `${sourceName}.map.terrain`).map((row, rowIndex) =>
        expectArray(row, `${sourceName}.map.terrain[${rowIndex}]`).map((cell, columnIndex) =>
          expectTerrainKey(cell, `${sourceName}.map.terrain[${rowIndex}][${columnIndex}]`),
        ),
      ),
      elevation: expectArray(mapRecord.elevation, `${sourceName}.map.elevation`).map((row, rowIndex) =>
        expectArray(row, `${sourceName}.map.elevation[${rowIndex}]`).map((cell, columnIndex) =>
          Math.max(0, expectInteger(cell, `${sourceName}.map.elevation[${rowIndex}][${columnIndex}]`)),
        ),
      ),
    },
    units: {
      allies: expectArray(unitsRecord.allies, `${sourceName}.units.allies`).map((unit, index) =>
        parsePlacedUnit(unit, `${sourceName}.units.allies[${index}]`),
      ),
      enemies: expectArray(unitsRecord.enemies, `${sourceName}.units.enemies`).map((unit, index) =>
        parsePlacedUnit(unit, `${sourceName}.units.enemies[${index}]`),
      ),
    },
    objective: {
      initialPhaseId: optionalString(objectiveRecord.initialPhaseId, `${sourceName}.objective.initialPhaseId`),
      phases: expectArray(objectiveRecord.phases, `${sourceName}.objective.phases`).map((phase, index) => {
        const phaseRecord = expectRecord(phase, `${sourceName}.objective.phases[${index}]`)

        return {
          id: expectString(phaseRecord.id, `${sourceName}.objective.phases[${index}].id`),
          announcementCueId: optionalString(
            phaseRecord.announcementCueId,
            `${sourceName}.objective.phases[${index}].announcementCueId`,
          ),
          victoryConditions: expectArray(
            phaseRecord.victoryConditions,
            `${sourceName}.objective.phases[${index}].victoryConditions`,
          ).map((condition, conditionIndex) =>
            parseObjectiveCondition(
              condition,
              `${sourceName}.objective.phases[${index}].victoryConditions[${conditionIndex}]`,
            ),
          ),
          defeatConditions:
            phaseRecord.defeatConditions === undefined
              ? undefined
              : expectArray(
                  phaseRecord.defeatConditions,
                  `${sourceName}.objective.phases[${index}].defeatConditions`,
                ).map((condition, conditionIndex) =>
                  parseObjectiveCondition(
                    condition,
                    `${sourceName}.objective.phases[${index}].defeatConditions[${conditionIndex}]`,
                  ),
                ),
        }
      }),
    },
    events: expectArray(record.events ?? [], `${sourceName}.events`).map((event, index) => {
      const eventRecord = expectRecord(event, `${sourceName}.events[${index}]`)

      return {
        id: expectString(eventRecord.id, `${sourceName}.events[${index}].id`),
        once: eventRecord.once === undefined ? undefined : expectBoolean(eventRecord.once, `${sourceName}.events[${index}].once`),
        trigger: parseEventTrigger(eventRecord.trigger, `${sourceName}.events[${index}].trigger`),
        effects: expectArray(eventRecord.effects, `${sourceName}.events[${index}].effects`).map((effect, effectIndex) =>
          parseEventEffect(effect, `${sourceName}.events[${index}].effects[${effectIndex}]`),
        ),
      }
    }),
  }

  if (bundle.version !== LEVEL_BUNDLE_VERSION) {
    throw new Error(`Unsupported level bundle version ${bundle.version} in ${sourceName}`)
  }

  return bundle
}

export function validateLevelBundleContent(
  bundle: LevelBundleV1,
  options: {
    classIds: Iterable<string>
    aiProfileIds: Iterable<string>
  },
): LevelBundleV1 {
  validateMatrixDimensions(bundle.map.terrain, bundle.map.width, bundle.map.height, `${bundle.id}.map.terrain`)
  validateMatrixDimensions(bundle.map.elevation, bundle.map.width, bundle.map.height, `${bundle.id}.map.elevation`)

  if (bundle.map.tileWidth <= 0 || bundle.map.tileHeight <= 0) {
    throw new Error(`Map tile dimensions must be positive in level bundle "${bundle.id}"`)
  }

  if (bundle.objective.phases.length === 0) {
    throw new Error(`Level bundle "${bundle.id}" must define at least one objective phase`)
  }

  assertUnique(bundle.objective.phases.map((phase) => phase.id), 'objective phase id', bundle.id)
  assertUnique(bundle.events.map((event) => event.id), 'event id', bundle.id)
  assertUnique(
    [
      ...bundle.units.allies.map((unit) => unit.id),
      ...bundle.units.enemies.map((unit) => unit.id),
      ...bundle.events.flatMap((event) =>
        event.effects.flatMap((effect) => (effect.type === 'deploy-unit' ? [effect.unit.id] : [])),
      ),
    ],
    'unit id',
    bundle.id,
  )

  const knownUnitIds = new Set([
    ...bundle.units.allies.map((unit) => unit.id),
    ...bundle.units.enemies.map((unit) => unit.id),
    ...bundle.events.flatMap((event) =>
      event.effects.flatMap((effect) => (effect.type === 'deploy-unit' ? [effect.unit.id] : [])),
    ),
  ])
  const phaseIds = new Set(bundle.objective.phases.map((phase) => phase.id))

  for (const unit of [...bundle.units.allies, ...bundle.units.enemies]) {
    assertPointInBounds(unit.position, bundle.map, `Unit "${unit.id}"`, bundle.id)

    if (!hasText(bundle.text.ko.units[unit.id])) {
      throw new Error(`Missing Korean unit name for "${unit.id}" in level bundle "${bundle.id}"`)
    }
  }

  for (const phase of bundle.objective.phases) {
    if (!hasText(bundle.text.ko.phases[phase.id]?.objective)) {
      throw new Error(`Missing Korean objective text for phase "${phase.id}" in level bundle "${bundle.id}"`)
    }

    for (const condition of [...phase.victoryConditions, ...(phase.defeatConditions ?? [])]) {
      if (condition.type === 'defeat-unit' && !knownUnitIds.has(condition.unitId)) {
        throw new Error(`Unknown objective unitId "${condition.unitId}" in level bundle "${bundle.id}"`)
      }
    }
  }

  if (bundle.objective.initialPhaseId && !phaseIds.has(bundle.objective.initialPhaseId)) {
    throw new Error(`Unknown initialPhaseId "${bundle.objective.initialPhaseId}" in level bundle "${bundle.id}"`)
  }

  for (const event of bundle.events) {
    if (
      (event.trigger.type === 'turn-start' || event.trigger.type === 'unit-defeated') &&
      event.trigger.unitId &&
      !knownUnitIds.has(event.trigger.unitId)
    ) {
      throw new Error(`Unknown trigger unitId "${event.trigger.unitId}" in level bundle "${bundle.id}"`)
    }

    if (event.trigger.objectivePhaseId && !phaseIds.has(event.trigger.objectivePhaseId)) {
      throw new Error(`Unknown trigger objectivePhaseId "${event.trigger.objectivePhaseId}" in level bundle "${bundle.id}"`)
    }

    for (const effect of event.effects) {
      if (effect.type === 'set-objective-phase' && !phaseIds.has(effect.objectivePhaseId)) {
        throw new Error(`Unknown effect objectivePhaseId "${effect.objectivePhaseId}" in level bundle "${bundle.id}"`)
      }

      if (effect.type === 'deploy-unit') {
        assertPointInBounds(effect.unit.position, bundle.map, `Deploy unit "${effect.unit.id}"`, bundle.id)
      }
    }
  }

  validateBattleDefinitionContent(compileLevelBundle(bundle).battleDefinition, options)

  return bundle
}

export function compileLevelBundle(bundle: LevelBundleV1): CompiledLevelBundle {
  const localeOverlay = createLevelLocaleOverlay(bundle)
  const rawBattleDefinition = {
    id: bundle.id,
    titleKey: buildKey(bundle.slug, 'title'),
    objectiveKey: buildKey(bundle.slug, 'objective'),
    briefingKey: buildKey(bundle.slug, 'briefing'),
    victoryKey: buildKey(bundle.slug, 'victory'),
    defeatKey: buildKey(bundle.slug, 'defeat'),
    mapId: bundle.slug,
    objectivePhases: bundle.objective.phases.map((phase) => {
      const phaseText = getPhaseLocaleText(bundle.text, phase.id, 'ko')

      return {
        id: phase.id,
        objectiveKey: buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.objective`),
        briefingKey: hasText(phaseText.briefing)
          ? buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.briefing`)
          : undefined,
        victoryKey: hasText(phaseText.victory)
          ? buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.victory`)
          : undefined,
        defeatKey: hasText(phaseText.defeat)
          ? buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.defeat`)
          : undefined,
        announcementKey: hasText(phaseText.announcement)
          ? buildKey(bundle.slug, `phase.${slugSegment(phase.id)}.announcement`)
          : undefined,
        announcementCueId: phase.announcementCueId,
        victoryConditions: phase.victoryConditions,
        defeatConditions: phase.defeatConditions,
      }
    }),
    events: bundle.events.map((event) => ({
      id: event.id,
      once: event.once,
      trigger: event.trigger,
      effects: event.effects.map((effect) =>
        effect.type === 'deploy-unit' ? buildDeployEffect(bundle.slug, effect) : effect,
      ),
    })),
    allies: bundle.units.allies.map((unit) => buildUnitBlueprint(bundle.slug, 'allies', unit)),
    enemies: bundle.units.enemies.map((unit) => buildUnitBlueprint(bundle.slug, 'enemies', unit)),
  }

  const battleDefinition = loadBattleDefinition(rawBattleDefinition, `${bundle.slug}.level.json`)
  const mapData: TiledMapData = {
    type: 'map',
    orientation: 'isometric',
    width: bundle.map.width,
    height: bundle.map.height,
    tilewidth: bundle.map.tileWidth,
    tileheight: bundle.map.tileHeight,
    layers: [
      {
        name: 'terrain',
        type: 'tilelayer',
        width: bundle.map.width,
        height: bundle.map.height,
        data: bundle.map.terrain.flatMap((row) => row.map((terrain) => terrainValueMap[terrain])),
      },
      {
        name: 'height',
        type: 'tilelayer',
        width: bundle.map.width,
        height: bundle.map.height,
        data: bundle.map.elevation.flatMap((row) => row.map((height) => height + 1)),
      },
    ],
  }

  return {
    bundle,
    mapData,
    battleDefinition:
      bundle.objective.initialPhaseId && bundle.objective.initialPhaseId !== bundle.objective.phases[0]?.id
        ? {
            ...battleDefinition,
            objectivePhases: [
              ...battleDefinition.objectivePhases!.filter((phase) => phase.id === bundle.objective.initialPhaseId),
              ...battleDefinition.objectivePhases!.filter((phase) => phase.id !== bundle.objective.initialPhaseId),
            ],
          }
        : battleDefinition,
    localeOverlay,
  }
}
