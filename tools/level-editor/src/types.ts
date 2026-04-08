import type { Direction, GridPoint, Team, TerrainKey } from '../../../src/game/types'

export type EditorTool =
  | 'move'
  | 'select'
  | 'terrain-brush'
  | 'height-brush'
  | 'unit-stamp'
  | 'erase'
  | 'eyedropper'
  | 'marquee'
  | 'pan'
  | 'zoom'

export type BottomPanelTab = 'validation' | 'playtest' | 'bundle' | 'history'
export type RightPanelTab = 'inspector' | 'layers' | 'library'
export type LibraryTab = 'terrain' | 'classes' | 'ai' | 'events'

export type EditorSelection =
  | { kind: 'tile'; point: GridPoint }
  | { kind: 'unit'; team: Team; unitId: string }
  | { kind: 'phase'; phaseId: string }
  | { kind: 'event'; eventId: string }
  | null

export interface EditorLayerVisibility {
  terrain: boolean
  height: boolean
  allies: boolean
  enemies: boolean
  phases: boolean
  events: boolean
  overlays: boolean
}

export interface UnitStampPreset {
  team: Team
  classId: string
  aiProfileId: string
  facing: Direction
  startingHp: number | ''
}

export interface EditorHistoryEntry {
  id: string
  label: string
  timestamp: string
}

export interface ValidationSummary {
  errors: string[]
  warnings: string[]
}

export type EditorCanvasAction =
  | { type: 'select-tile'; point: GridPoint }
  | { type: 'select-unit'; team: Team; unitId: string }
  | { type: 'move-unit'; team: Team; unitId: string; point: GridPoint }
  | { type: 'paint-terrain'; points: GridPoint[] }
  | { type: 'paint-height'; points: GridPoint[] }
  | { type: 'stamp-unit'; point: GridPoint }
  | { type: 'erase'; point: GridPoint }
  | { type: 'sample-tile'; point: GridPoint }
  | { type: 'sample-unit'; team: Team; unitId: string }

export const DEFAULT_LAYER_VISIBILITY: EditorLayerVisibility = {
  terrain: true,
  height: true,
  allies: true,
  enemies: true,
  phases: true,
  events: true,
  overlays: true,
}
