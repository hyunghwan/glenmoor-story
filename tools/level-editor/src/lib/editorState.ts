import type {
  LevelBundleDeployUnit,
  LevelBundleLocalePhaseText,
  LevelBundlePlacedUnit,
  LevelBundleV1,
} from '../../../../src/game/level-bundle'
import { validateLevelBundleContent } from '../../../../src/game/level-bundle'
import { aiProfiles, classDefinitions } from '../../../../src/game/content'
import type { Direction, GridPoint, Team, TerrainKey } from '../../../../src/game/types'
import type { EditorHistoryEntry, UnitStampPreset, ValidationSummary } from '../types'

export function cloneLevelBundle(bundle: LevelBundleV1): LevelBundleV1 {
  return structuredClone(bundle)
}

export function pointKey(point: GridPoint): string {
  return `${point.x},${point.y}`
}

export function enumerateBrushPoints(
  center: GridPoint,
  brushSize: number,
  width: number,
  height: number,
): GridPoint[] {
  const radius = Math.max(0, Math.floor(brushSize / 2))
  const points: GridPoint[] = []

  for (let y = Math.max(0, center.y - radius); y <= Math.min(height - 1, center.y + radius); y += 1) {
    for (let x = Math.max(0, center.x - radius); x <= Math.min(width - 1, center.x + radius); x += 1) {
      points.push({ x, y })
    }
  }

  return points
}

export function applyTerrainAtPoints(
  bundle: LevelBundleV1,
  points: GridPoint[],
  terrain: TerrainKey,
): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)

  for (const point of points) {
    next.map.terrain[point.y]![point.x] = terrain
  }

  return next
}

export function applyElevationAtPoints(
  bundle: LevelBundleV1,
  points: GridPoint[],
  delta: number,
): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)

  for (const point of points) {
    next.map.elevation[point.y]![point.x] = Math.max(0, next.map.elevation[point.y]![point.x]! + delta)
  }

  return next
}

export function findStartingUnitAtPoint(
  bundle: LevelBundleV1,
  point: GridPoint,
): { team: Team; unit: LevelBundlePlacedUnit; index: number } | undefined {
  const allyIndex = bundle.units.allies.findIndex((unit) => unit.position.x === point.x && unit.position.y === point.y)

  if (allyIndex >= 0) {
    return {
      team: 'allies',
      unit: bundle.units.allies[allyIndex]!,
      index: allyIndex,
    }
  }

  const enemyIndex = bundle.units.enemies.findIndex((unit) => unit.position.x === point.x && unit.position.y === point.y)

  if (enemyIndex >= 0) {
    return {
      team: 'enemies',
      unit: bundle.units.enemies[enemyIndex]!,
      index: enemyIndex,
    }
  }

  return undefined
}

export function findDeployUnitAtPoint(
  bundle: LevelBundleV1,
  point: GridPoint,
): { eventId: string; unit: LevelBundleDeployUnit } | undefined {
  for (const event of bundle.events) {
    for (const effect of event.effects) {
      if (
        effect.type === 'deploy-unit' &&
        effect.unit.position.x === point.x &&
        effect.unit.position.y === point.y
      ) {
        return {
          eventId: event.id,
          unit: effect.unit,
        }
      }
    }
  }

  return undefined
}

function clampPoint(point: GridPoint, width: number, height: number): GridPoint {
  return {
    x: Math.max(0, Math.min(width - 1, point.x)),
    y: Math.max(0, Math.min(height - 1, point.y)),
  }
}

export function createStampedUnitId(bundle: LevelBundleV1, team: Team, classId: string): string {
  const normalized = classId
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  const existingIds = new Set([
    ...bundle.units.allies.map((unit) => unit.id),
    ...bundle.units.enemies.map((unit) => unit.id),
    ...bundle.events.flatMap((event) =>
      event.effects.flatMap((effect) => (effect.type === 'deploy-unit' ? [effect.unit.id] : [])),
    ),
  ])
  let index = 1
  let candidate = `${team === 'allies' ? 'ally' : 'enemy'}-${normalized}-${index}`

  while (existingIds.has(candidate)) {
    index += 1
    candidate = `${team === 'allies' ? 'ally' : 'enemy'}-${normalized}-${index}`
  }

  return candidate
}

export function stampUnitAtPoint(
  bundle: LevelBundleV1,
  point: GridPoint,
  preset: UnitStampPreset,
): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)
  const occupied = findStartingUnitAtPoint(next, point)
  const teamUnits = preset.team === 'allies' ? next.units.allies : next.units.enemies

  if (occupied && occupied.team === preset.team) {
    teamUnits[occupied.index] = {
      ...teamUnits[occupied.index]!,
      classId: preset.classId,
      aiProfileId: preset.aiProfileId,
      facing: preset.facing,
      startingHp: preset.startingHp === '' ? undefined : preset.startingHp,
      position: { ...point },
    }

    if (!next.text.ko.units[occupied.unit.id]) {
      next.text.ko.units[occupied.unit.id] = occupied.unit.id
    }

    return next
  }

  if (occupied) {
    const occupiedUnits = occupied.team === 'allies' ? next.units.allies : next.units.enemies
    occupiedUnits.splice(occupied.index, 1)
  }

  const id = createStampedUnitId(next, preset.team, preset.classId)
  const newUnit: LevelBundlePlacedUnit = {
    id,
    classId: preset.classId,
    position: { ...point },
    aiProfileId: preset.aiProfileId,
    facing: preset.facing,
    startingHp: preset.startingHp === '' ? undefined : preset.startingHp,
  }
  teamUnits.push(newUnit)
  next.text.ko.units[id] = next.text.ko.units[id] ?? id

  return next
}

export function removeAtPoint(bundle: LevelBundleV1, point: GridPoint): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)
  const occupied = findStartingUnitAtPoint(next, point)

  if (occupied) {
    const units = occupied.team === 'allies' ? next.units.allies : next.units.enemies
    units.splice(occupied.index, 1)
    delete next.text.ko.units[occupied.unit.id]
    delete next.text.en?.units?.[occupied.unit.id]
    return next
  }

  next.map.terrain[point.y]![point.x] = 'grass'
  next.map.elevation[point.y]![point.x] = 0
  return next
}

export function moveStartingUnit(
  bundle: LevelBundleV1,
  team: Team,
  unitId: string,
  point: GridPoint,
): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)
  const units = team === 'allies' ? next.units.allies : next.units.enemies
  const unit = units.find((candidate) => candidate.id === unitId)

  if (!unit) {
    return next
  }

  const occupied = findStartingUnitAtPoint(next, point)

  if (occupied && occupied.unit.id !== unitId) {
    return next
  }

  unit.position = { ...point }
  return next
}

export function updateStartingUnit(
  bundle: LevelBundleV1,
  team: Team,
  unitId: string,
  updates: Partial<LevelBundlePlacedUnit>,
): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)
  const units = team === 'allies' ? next.units.allies : next.units.enemies
  const unit = units.find((candidate) => candidate.id === unitId)

  if (!unit) {
    return next
  }

  Object.assign(unit, updates)
  return next
}

export function renameUnit(
  bundle: LevelBundleV1,
  unitId: string,
  locale: 'ko' | 'en',
  value: string,
): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)

  if (locale === 'ko') {
    next.text.ko.units[unitId] = value
  } else {
    next.text.en = next.text.en ?? { units: {}, phases: {} }
    next.text.en.units = next.text.en.units ?? {}
    next.text.en.units[unitId] = value
  }

  return next
}

export function updatePhaseText(
  bundle: LevelBundleV1,
  phaseId: string,
  locale: 'ko' | 'en',
  field: keyof LevelBundleLocalePhaseText,
  value: string,
): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)

  if (locale === 'ko') {
    next.text.ko.phases[phaseId] = {
      ...next.text.ko.phases[phaseId],
      [field]: value,
    } as LevelBundleLocalePhaseText
  } else {
    next.text.en = next.text.en ?? { units: {}, phases: {} }
    next.text.en.phases = next.text.en.phases ?? {}
    next.text.en.phases[phaseId] = {
      ...next.text.en.phases[phaseId],
      [field]: value,
    }
  }

  return next
}

export function resizeLevelMap(bundle: LevelBundleV1, width: number, height: number): LevelBundleV1 {
  const next = cloneLevelBundle(bundle)
  const currentTerrain = next.map.terrain
  const currentElevation = next.map.elevation
  const nextTerrain: TerrainKey[][] = []
  const nextElevation: number[][] = []

  for (let y = 0; y < height; y += 1) {
    const terrainRow: TerrainKey[] = []
    const elevationRow: number[] = []

    for (let x = 0; x < width; x += 1) {
      terrainRow.push(currentTerrain[y]?.[x] ?? 'grass')
      elevationRow.push(currentElevation[y]?.[x] ?? 0)
    }

    nextTerrain.push(terrainRow)
    nextElevation.push(elevationRow)
  }

  next.map.width = width
  next.map.height = height
  next.map.terrain = nextTerrain
  next.map.elevation = nextElevation

  for (const unit of [...next.units.allies, ...next.units.enemies]) {
    unit.position = clampPoint(unit.position, width, height)
  }

  for (const event of next.events) {
    for (const effect of event.effects) {
      if (effect.type === 'deploy-unit') {
        effect.unit.position = clampPoint(effect.unit.position, width, height)
      }
    }
  }

  return next
}

export function createHistoryEntry(label: string): EditorHistoryEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label,
    timestamp: new Date().toISOString(),
  }
}

export function summarizeValidation(bundle: LevelBundleV1): ValidationSummary {
  const warnings: string[] = []

  for (const unit of [...bundle.units.allies, ...bundle.units.enemies]) {
    if (!bundle.text.en?.units?.[unit.id]) {
      warnings.push(`Missing English unit name for "${unit.id}". Korean text will be reused.`)
    }
  }

  for (const phase of bundle.objective.phases) {
    if (!bundle.text.en?.phases?.[phase.id]?.objective) {
      warnings.push(`Phase "${phase.id}" is missing an English objective. Korean text will be reused.`)
    }
  }

  if (!bundle.text.en?.title) {
    warnings.push('Missing English title. Korean title will be reused.')
  }

  try {
    validateLevelBundleContent(bundle, {
      classIds: Object.keys(classDefinitions),
      aiProfileIds: Object.keys(aiProfiles),
    })

    return {
      errors: [],
      warnings,
    }
  } catch (error) {
    return {
      errors: [error instanceof Error ? error.message : String(error)],
      warnings,
    }
  }
}

export function sampleUnitPreset(
  bundle: LevelBundleV1,
  team: Team,
  unitId: string,
): UnitStampPreset | undefined {
  const units = team === 'allies' ? bundle.units.allies : bundle.units.enemies
  const unit = units.find((candidate) => candidate.id === unitId)

  if (!unit) {
    return undefined
  }

  return {
    team,
    classId: unit.classId,
    aiProfileId: unit.aiProfileId,
    facing: unit.facing ?? (team === 'allies' ? 'north' : 'south'),
    startingHp: unit.startingHp ?? '',
  }
}

export function defaultUnitPreset(): UnitStampPreset {
  return {
    team: 'allies',
    classId: Object.keys(classDefinitions)[0] ?? 'vanguard',
    aiProfileId: Object.keys(aiProfiles)[0] ?? 'spearhead',
    facing: 'north' satisfies Direction,
    startingHp: '',
  }
}
