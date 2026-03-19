import type { BattleMapData, GridPoint, HudViewModel, ImpactWeight, TerrainReactionId } from '../../types'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function getPulse(elapsedMs: number, periodMs = 860, phaseMs = 0): number {
  return (Math.sin(((elapsedMs + phaseMs) / periodMs) * Math.PI * 2) + 1) / 2
}

export function resolveToneColor(tone: string): number {
  switch (tone) {
    case 'ember':
      return 0xf08a4b
    case 'ward':
      return 0x7fd9ff
    case 'shadow':
      return 0x8b6bff
    case 'wind':
      return 0x90cfff
    case 'radiant':
      return 0xe7d88a
    case 'hazard':
      return 0xff9078
    case 'steel':
      return 0xf5d18c
    default:
      return 0xbec8d8
  }
}

export function resolveMarkerToneColor(
  tone: HudViewModel['targetMarkers'][number]['markerTone'],
): number {
  switch (tone) {
    case 'heal':
      return 0x7ed6ac
    case 'lethal':
      return 0xf6d88d
    case 'counter':
      return 0xd7525f
    case 'status':
      return 0x7fd9ff
    case 'effect':
      return 0xd8bf84
    default:
      return 0xff8870
  }
}

export function resolveCueColor(fxCueId: string): number {
  if (fxCueId.includes('ember') || fxCueId.includes('burning')) {
    return 0xf09046
  }

  if (fxCueId.includes('ward') || fxCueId.includes('hymn') || fxCueId.includes('aegis')) {
    return 0x8bdcff
  }

  if (fxCueId.includes('shadow')) {
    return 0x9a77ff
  }

  if (fxCueId.includes('snare') || fxCueId.includes('slow') || fxCueId.includes('ranger')) {
    return 0x9cd3ff
  }

  if (fxCueId.includes('guard')) {
    return 0xffa37d
  }

  if (fxCueId.includes('bridge')) {
    return 0x92ccff
  }

  return 0xf5d18c
}

export function resolveTerrainReactionColor(reactionId: TerrainReactionId): number {
  switch (reactionId) {
    case 'forest-kindling':
      return 0xf09046
    case 'ruins-echo':
      return 0x8bdcff
    case 'bridge-drop':
      return 0x92ccff
  }
}

export function getBridgeDropPreviewPoint(
  map: BattleMapData,
  actorPoint: GridPoint,
  targetPoint: GridPoint,
): GridPoint | undefined {
  const dx = clamp(targetPoint.x - actorPoint.x, -1, 1)
  const dy = clamp(targetPoint.y - actorPoint.y, -1, 1)

  if (dx === 0 && dy === 0) {
    return undefined
  }

  const targetTile = map.tiles[targetPoint.y]?.[targetPoint.x]

  if (!targetTile || targetTile.terrainId !== 'bridge') {
    return undefined
  }

  const nextPoint = {
    x: targetPoint.x + dx,
    y: targetPoint.y + dy,
  }
  const nextTile = map.tiles[nextPoint.y]?.[nextPoint.x]

  return nextTile?.terrainId === 'water' ? nextPoint : undefined
}

export function resolveImpactScale(weight: ImpactWeight): number {
  switch (weight) {
    case 'light':
      return 0.9
    case 'medium':
      return 1
    case 'heavy':
      return 1.18
    case 'finisher':
      return 1.3
  }
}
