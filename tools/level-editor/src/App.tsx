import {
  startTransition,
  type CSSProperties,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from 'react'
import seedLevelBundleJson from '../../../public/data/levels/glenmoor-pass.level.json'
import { aiProfiles, classDefinitions, terrainDefinitions } from '../../../src/game/content'
import {
  LEVEL_BUNDLE_PREVIEW_MESSAGE,
  loadLevelBundle,
  type LevelBundleV1,
} from '../../../src/game/level-bundle'
import type { BattleEventTrigger, Direction, Team, TerrainKey } from '../../../src/game/types'
import { createLevelEditorViewport, type LevelEditorViewportController } from './lib/editorScene'
import {
  applyElevationAtPoints,
  applyTerrainAtPoints,
  cloneLevelBundle,
  createHistoryEntry,
  defaultUnitPreset,
  moveStartingUnit,
  pointKey,
  removeAtPoint,
  renameUnit,
  resizeLevelMap,
  sampleUnitPreset,
  stampUnitAtPoint,
  summarizeValidation,
  updatePhaseText,
  updateStartingUnit,
} from './lib/editorState'
import { isFileSystemAccessSupported, pickWorkspaceDirectory, readJsonFile, writeJsonFile } from './lib/fsAccess'
import type {
  BottomPanelTab,
  EditorCanvasAction,
  EditorHistoryEntry,
  EditorSelection,
  EditorTool,
  LibraryTab,
  RightPanelTab,
  UnitStampPreset,
} from './types'
import { DEFAULT_LAYER_VISIBILITY } from './types'

const seedBundle = loadLevelBundle(seedLevelBundleJson, 'glenmoor-pass.level.json')
const SAVE_PATH_PREFIX = 'public/data/levels'
const GAME_BASE_URL_STORAGE_KEY = 'glenmoor-level-editor.game-base-url'
const BOTTOM_PANEL_HEIGHT_STORAGE_KEY = 'glenmoor-level-editor.bottom-panel-height'
const DEFAULT_GAME_PORT_BY_EDITOR_PORT: Record<string, string> = {
  '4174': '4173',
  '5174': '5173',
}

const TOOLBAR: Array<{ id: EditorTool; label: string; hotkey: string }> = [
  { id: 'move', label: 'Move', hotkey: 'V' },
  { id: 'select', label: 'Select', hotkey: 'S' },
  { id: 'terrain-brush', label: 'Terrain Brush', hotkey: 'T' },
  { id: 'height-brush', label: 'Height Brush', hotkey: 'H' },
  { id: 'unit-stamp', label: 'Unit Stamp', hotkey: 'U' },
  { id: 'erase', label: 'Erase', hotkey: 'E' },
  { id: 'eyedropper', label: 'Eyedropper', hotkey: 'I' },
  { id: 'marquee', label: 'Marquee', hotkey: 'M' },
  { id: 'pan', label: 'Pan', hotkey: 'Space' },
  { id: 'zoom', label: 'Zoom', hotkey: 'Z' },
]

function savePathForSlug(slug: string): string {
  return `${SAVE_PATH_PREFIX}/${slug}.level.json`
}

function inferDefaultGameBaseUrl(): string {
  const overridePort = DEFAULT_GAME_PORT_BY_EDITOR_PORT[window.location.port]

  if (overridePort) {
    return `${window.location.protocol}//${window.location.hostname}:${overridePort}`
  }

  const numericPort = Number(window.location.port)

  if (Number.isFinite(numericPort) && numericPort > 1) {
    return `${window.location.protocol}//${window.location.hostname}:${numericPort - 1}`
  }

  return window.location.origin
}

function clampBottomPanelHeight(nextHeight: number): number {
  const viewportLimit = typeof window === 'undefined' ? 520 : Math.floor(window.innerHeight * 0.6)
  return Math.max(180, Math.min(viewportLimit, nextHeight))
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="editor-menu-section">
      <span className="editor-menu-label">{label}</span>
      <div className="editor-menu-actions">{children}</div>
    </div>
  )
}

function ToolGlyph({ tool }: { tool: EditorTool }) {
  switch (tool) {
    case 'move':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M10 2v16M2 10h16M10 2l-2.5 2.5M10 2l2.5 2.5M18 10l-2.5-2.5M18 10l-2.5 2.5M10 18l-2.5-2.5M10 18l2.5-2.5M2 10l2.5-2.5M2 10l2.5 2.5" />
        </svg>
      )
    case 'select':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M4 3l9 8-4 1.2 1.8 4.8-2 0.8-1.8-4.8-3 3V3z" />
        </svg>
      )
    case 'terrain-brush':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M13.5 3.5l3 3-6.8 6.8-3.6.6.6-3.6 6.8-6.8zM5.5 14.5c-1.2 0-2 0.8-2 1.8 0 0.9 0.8 1.7 2.1 1.7 2.1 0 3.2-1.3 3.2-2.8-0.7 0.7-1.8 0.7-3.3 0.7z" />
        </svg>
      )
    case 'height-brush':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M4 14l6-8 6 8M6 14h8M8 10h4" />
        </svg>
      )
    case 'unit-stamp':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M10 4.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM5.5 16a4.5 4.5 0 019 0M15 4v4M13 6h4" />
        </svg>
      )
    case 'erase':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M8 4l8 8-4 4H7l-4-4 8-8zM6.5 14h7" />
        </svg>
      )
    case 'eyedropper':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M12.5 4.5l3 3-3 3-3-3 3-3zM10.5 9.5L5 15v2h2l5.5-5.5" />
        </svg>
      )
    case 'marquee':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M4 7V4h3M13 4h3v3M16 13v3h-3M7 16H4v-3" />
          <path d="M4 10h1.5M8 4v1.5M12 16v-1.5M16 10h-1.5" />
        </svg>
      )
    case 'pan':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M7 9V5.5a1 1 0 112 0V9M9 9V4.5a1 1 0 112 0V9M11 9V5.5a1 1 0 112 0V10M13 10V7a1 1 0 112 0v4.5c0 3.1-2 5.5-5 5.5-2.2 0-4-1.3-4.8-3.4L4 10.5a1 1 0 111.7-1L7 12V9z" />
        </svg>
      )
    case 'zoom':
      return (
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path d="M8.5 4a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM12 12l4 4M8.5 6.5v4M6.5 8.5h4" />
        </svg>
      )
    default:
      return null
  }
}

function ToolbarButton({
  active,
  tool,
  label,
  hotkey,
  onClick,
}: {
  active: boolean
  tool: EditorTool
  label: string
  hotkey: string
  onClick: () => void
}) {
  return (
    <button
      aria-label={`${label} (${hotkey})`}
      aria-pressed={active}
      className={`tool-button ${active ? 'is-active' : ''}`}
      data-tooltip={`${label} [${hotkey}]`}
      onClick={onClick}
      title={`${label} (${hotkey})`}
      type="button"
    >
      <ToolGlyph tool={tool} />
    </button>
  )
}

function PanelTabs<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ id: T; label: string }>
  onChange: (value: T) => void
}) {
  return (
    <div className="panel-tabs" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          className={`panel-tab ${value === option.id ? 'is-active' : ''}`}
          onClick={() => onChange(option.id)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function LabeledField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function App() {
  const [bundle, setBundle] = useState<LevelBundleV1>(() => cloneLevelBundle(seedBundle))
  const [tool, setTool] = useState<EditorTool>('select')
  const [selection, setSelection] = useState<EditorSelection>(null)
  const [rightTab, setRightTab] = useState<RightPanelTab>('inspector')
  const [bottomTab, setBottomTab] = useState<BottomPanelTab>('validation')
  const [libraryTab, setLibraryTab] = useState<LibraryTab>('terrain')
  const [layers, setLayers] = useState(DEFAULT_LAYER_VISIBILITY)
  const [brushSize, setBrushSize] = useState(1)
  const [terrainBrush, setTerrainBrush] = useState<TerrainKey>('grass')
  const [heightDelta, setHeightDelta] = useState(1)
  const [unitPreset, setUnitPreset] = useState<UnitStampPreset>(() => defaultUnitPreset())
  const [workspaceHandle, setWorkspaceHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [historyEntries, setHistoryEntries] = useState<EditorHistoryEntry[]>([])
  const [past, setPast] = useState<LevelBundleV1[]>([])
  const [future, setFuture] = useState<LevelBundleV1[]>([])
  const [statusMessage, setStatusMessage] = useState<string>('Seed bundle loaded.')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [bottomPanelHeight, setBottomPanelHeight] = useState(() => {
    const stored = window.localStorage.getItem(BOTTOM_PANEL_HEIGHT_STORAGE_KEY)
    return clampBottomPanelHeight(stored ? Number(stored) : 260)
  })
  const [isResizingBottomPanel, setIsResizingBottomPanel] = useState(false)
  const [gameBaseUrl, setGameBaseUrl] = useState(
    () => window.localStorage.getItem(GAME_BASE_URL_STORAGE_KEY) ?? inferDefaultGameBaseUrl(),
  )
  const [mapWidthDraft, setMapWidthDraft] = useState(String(seedBundle.map.width))
  const [mapHeightDraft, setMapHeightDraft] = useState(String(seedBundle.map.height))
  const [previewReady, setPreviewReady] = useState(false)
  const viewportRootRef = useRef<HTMLDivElement | null>(null)
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const viewportControllerRef = useRef<LevelEditorViewportController | null>(null)
  const bottomResizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const bundleRef = useRef(bundle)
  const deferredBundleJson = useDeferredValue(JSON.stringify(bundle, null, 2))
  const validation = useMemo(() => summarizeValidation(bundle), [bundle])

  useEffect(() => {
    bundleRef.current = bundle
    setMapWidthDraft(String(bundle.map.width))
    setMapHeightDraft(String(bundle.map.height))
  }, [bundle])

  useEffect(() => {
    window.localStorage.setItem(GAME_BASE_URL_STORAGE_KEY, gameBaseUrl)
  }, [gameBaseUrl])

  useEffect(() => {
    window.localStorage.setItem(BOTTOM_PANEL_HEIGHT_STORAGE_KEY, String(bottomPanelHeight))
  }, [bottomPanelHeight])

  useEffect(() => {
    if (!isResizingBottomPanel) {
      return
    }

    function handlePointerMove(event: PointerEvent): void {
      const resizeState = bottomResizeStateRef.current

      if (!resizeState) {
        return
      }

      const delta = resizeState.startY - event.clientY
      setBottomPanelHeight(clampBottomPanelHeight(resizeState.startHeight + delta))
    }

    function handlePointerUp(): void {
      bottomResizeStateRef.current = null
      setIsResizingBottomPanel(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizingBottomPanel])

  const selectedTile = selection?.kind === 'tile' ? selection.point : null
  const selectedUnit =
    selection?.kind === 'unit'
      ? (selection.team === 'allies' ? bundle.units.allies : bundle.units.enemies).find(
          (unit) => unit.id === selection.unitId,
        ) ?? null
      : null
  const selectedPhase =
    selection?.kind === 'phase'
      ? bundle.objective.phases.find((phase) => phase.id === selection.phaseId) ?? null
      : null
  const selectedEvent =
    selection?.kind === 'event' ? bundle.events.find((event) => event.id === selection.eventId) ?? null : null

  const pushHistory = (label: string, nextBundle: LevelBundleV1) => {
    setPast((current) => [...current.slice(-39), cloneLevelBundle(bundleRef.current)])
    setFuture([])
    setHistoryEntries((current) => [createHistoryEntry(label), ...current].slice(0, 80))
    startTransition(() => {
      setBundle(nextBundle)
    })
  }

  const commitChange = (label: string, updater: (current: LevelBundleV1) => LevelBundleV1) => {
    const nextBundle = updater(bundleRef.current)
    pushHistory(label, nextBundle)
  }

  const postPreviewBundle = useEffectEvent(() => {
    previewFrameRef.current?.contentWindow?.postMessage(
      {
        type: LEVEL_BUNDLE_PREVIEW_MESSAGE,
        bundle: bundleRef.current,
      },
      '*',
    )
  })

  useEffect(() => {
    const viewportRoot = viewportRootRef.current

    if (!viewportRoot) {
      return
    }

    viewportControllerRef.current = createLevelEditorViewport(viewportRoot, {
      onAction(action) {
        handleCanvasAction(action)
      },
    })

    return () => {
      viewportControllerRef.current?.destroy()
      viewportControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    viewportControllerRef.current?.sync({
      bundle,
      tool,
      selection,
      layers,
      brushSize,
      terrainBrush,
      heightDelta,
      unitPreset,
    })
  }, [bundle, tool, selection, layers, brushSize, terrainBrush, heightDelta, unitPreset])

  useEffect(() => {
    if (!previewReady) {
      return
    }

    postPreviewBundle()
  }, [bundle, previewReady, postPreviewBundle])

  function handleCanvasAction(action: EditorCanvasAction): void {
    switch (action.type) {
      case 'select-tile':
        setSelection({ kind: 'tile', point: action.point })
        setRightTab('inspector')
        return
      case 'select-unit':
        setSelection({ kind: 'unit', team: action.team, unitId: action.unitId })
        setRightTab('inspector')
        return
      case 'move-unit':
        commitChange(`Move ${action.unitId}`, (current) =>
          moveStartingUnit(current, action.team, action.unitId, action.point),
        )
        setSelection({ kind: 'unit', team: action.team, unitId: action.unitId })
        setRightTab('inspector')
        return
      case 'paint-terrain':
        commitChange(`Paint ${terrainBrush}`, (current) => applyTerrainAtPoints(current, action.points, terrainBrush))
        return
      case 'paint-height':
        commitChange(
          heightDelta > 0 ? `Raise terrain (+${heightDelta})` : `Lower terrain (${heightDelta})`,
          (current) => applyElevationAtPoints(current, action.points, heightDelta),
        )
        return
      case 'stamp-unit':
        commitChange(`Stamp ${unitPreset.team} ${unitPreset.classId}`, (current) =>
          stampUnitAtPoint(current, action.point, unitPreset),
        )
        setSelection({ kind: 'tile', point: action.point })
        return
      case 'erase':
        commitChange(`Erase ${pointKey(action.point)}`, (current) => removeAtPoint(current, action.point))
        return
      case 'sample-tile': {
        const terrain = bundleRef.current.map.terrain[action.point.y]?.[action.point.x] ?? 'grass'
        setTerrainBrush(terrain)
        setTool('terrain-brush')
        setSelection({ kind: 'tile', point: action.point })
        setStatusMessage(`Sampled ${terrain} from ${pointKey(action.point)}.`)
        return
      }
      case 'sample-unit': {
        const sampledPreset = sampleUnitPreset(bundleRef.current, action.team, action.unitId)

        if (sampledPreset) {
          setUnitPreset(sampledPreset)
          setTool('unit-stamp')
          setSelection({ kind: 'unit', team: action.team, unitId: action.unitId })
          setStatusMessage(`Sampled unit stamp from ${action.unitId}.`)
        }
        return
      }
      default:
        return
    }
  }

  function handleUndo(): void {
    setPast((currentPast) => {
      const previous = currentPast.at(-1)

      if (!previous) {
        return currentPast
      }

      setFuture((currentFuture) => [cloneLevelBundle(bundleRef.current), ...currentFuture].slice(0, 40))
      startTransition(() => setBundle(cloneLevelBundle(previous)))
      return currentPast.slice(0, -1)
    })
  }

  function handleRedo(): void {
    setFuture((currentFuture) => {
      const [next, ...rest] = currentFuture

      if (!next) {
        return currentFuture
      }

      setPast((currentPast) => [...currentPast.slice(-39), cloneLevelBundle(bundleRef.current)])
      startTransition(() => setBundle(cloneLevelBundle(next)))
      return rest
    })
  }

  async function ensureWorkspace(): Promise<FileSystemDirectoryHandle | null> {
    if (workspaceHandle) {
      return workspaceHandle
    }

    if (!isFileSystemAccessSupported()) {
      setStatusMessage('File System Access API is unavailable. Use Import/Export in this browser.')
      return null
    }

    const nextHandle = await pickWorkspaceDirectory()
    setWorkspaceHandle(nextHandle)
    setStatusMessage(`Connected workspace: ${nextHandle.name}`)
    return nextHandle
  }

  async function handleSave(): Promise<void> {
    try {
      setSaveState('saving')
      const handle = await ensureWorkspace()

      if (!handle) {
        setSaveState('error')
        return
      }

      const path = savePathForSlug(bundle.slug)
      await writeJsonFile(handle, path, bundle)
      setSaveState('saved')
      setStatusMessage(`Saved ${path}`)
    } catch (error) {
      setSaveState('error')
      setStatusMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function handleLoadSaved(): Promise<void> {
    try {
      const handle = await ensureWorkspace()

      if (!handle) {
        return
      }

      const path = savePathForSlug(bundle.slug)
      const loaded = await readJsonFile<LevelBundleV1>(handle, path)

      if (!loaded) {
        setStatusMessage(`No saved file at ${path}`)
        return
      }

      startTransition(() => setBundle(loadLevelBundle(loaded, path)))
      setStatusMessage(`Loaded ${path}`)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error))
    }
  }

  function handleImportFile(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    void file.text().then((raw) => {
      const loaded = loadLevelBundle(JSON.parse(raw), file.name)
      startTransition(() => setBundle(loaded))
      setStatusMessage(`Imported ${file.name}`)
    })
  }

  function handleReset(): void {
    startTransition(() => setBundle(cloneLevelBundle(seedBundle)))
    setPast([])
    setFuture([])
    setHistoryEntries([])
    setSelection(null)
    setStatusMessage('Reset to the Glenmoor seed bundle.')
  }

  function handleResizeMapApply(): void {
    const nextWidth = Math.max(4, Number(mapWidthDraft) || bundle.map.width)
    const nextHeight = Math.max(4, Number(mapHeightDraft) || bundle.map.height)
    commitChange(`Resize map to ${nextWidth}x${nextHeight}`, (current) => resizeLevelMap(current, nextWidth, nextHeight))
  }

  function handleOpenInGame(mode: 'saved' | 'preview'): void {
    const base = new URL(gameBaseUrl, window.location.href)

    if (mode === 'saved') {
      window.open(`${base.toString().replace(/\/$/, '')}/?level=${encodeURIComponent(bundle.slug)}`, '_blank', 'noopener')
      return
    }

    const previewWindow = window.open(`${base.toString().replace(/\/$/, '')}/?preview=1`, '_blank', 'noopener')

    if (!previewWindow) {
      return
    }

    let attempts = 0
    const previewOrigin = base.origin
    const timer = window.setInterval(() => {
      previewWindow.postMessage(
        {
          type: LEVEL_BUNDLE_PREVIEW_MESSAGE,
          bundle: bundleRef.current,
        },
        previewOrigin,
      )
      attempts += 1

      if (attempts > 20 || previewWindow.closed) {
        window.clearInterval(timer)
      }
    }, 350)
  }

  function updateBundle(mutator: (draft: LevelBundleV1) => void, label: string): void {
    commitChange(label, (current) => {
      const next = cloneLevelBundle(current)
      mutator(next)
      return next
    })
  }

  function addPhase(): void {
    const nextId = `phase-${bundle.objective.phases.length + 1}`
    updateBundle((draft) => {
      draft.objective.phases.push({
        id: nextId,
        victoryConditions: [{ type: 'eliminate-team', team: 'enemies' }],
      })
      draft.text.ko.phases[nextId] = {
        objective: `Phase objective ${draft.objective.phases.length}`,
      }
    }, `Add ${nextId}`)
    setSelection({ kind: 'phase', phaseId: nextId })
  }

  function addEvent(kind: 'set-phase' | 'deploy-unit'): void {
    const nextId = `event-${bundle.events.length + 1}`
    updateBundle((draft) => {
      draft.events.push({
        id: nextId,
        trigger: { type: 'battle-start' },
        effects:
          kind === 'set-phase'
            ? [
                {
                  type: 'set-objective-phase',
                  objectivePhaseId: draft.objective.phases[0]?.id ?? 'default-objective',
                },
              ]
            : [
                {
                  type: 'deploy-unit',
                  unit: {
                    id: `deploy-${draft.events.length + 1}`,
                    team: 'enemies',
                    classId: unitPreset.classId,
                    aiProfileId: unitPreset.aiProfileId,
                    position: { x: 0, y: 0 },
                    facing: 'south',
                    startingHp: unitPreset.startingHp === '' ? undefined : unitPreset.startingHp,
                  },
                },
              ],
      })
    }, `Add ${nextId}`)
    setSelection({ kind: 'event', eventId: nextId })
  }

  const eventTemplateCount = bundle.events.filter((event) => event.effects.some((effect) => effect.type === 'deploy-unit')).length

  return (
    <main
      className={`editor-shell ${isResizingBottomPanel ? 'is-resizing-bottom-panel' : ''}`}
      style={{ '--bottom-panel-height': `${bottomPanelHeight}px` } as CSSProperties}
    >
      <input
        accept="application/json,.json"
        className="hidden-file-input"
        onChange={handleImportFile}
        ref={fileInputRef}
        type="file"
      />
      <header className="editor-option-bar">
        <div className="option-bar-row option-bar-row--top">
          <div className="option-bar-top-main">
            <div className="brand-block brand-block--compact">
              <p>Glenmoor Story</p>
              <h1>Level Editor</h1>
            </div>
            <MenuSection label="File">
              <button onClick={() => fileInputRef.current?.click()} type="button">
                Import
              </button>
              <button onClick={handleSave} type="button">
                Save
              </button>
              <button onClick={handleLoadSaved} type="button">
                Load
              </button>
            </MenuSection>
            <MenuSection label="Edit">
              <button disabled={past.length === 0} onClick={handleUndo} type="button">
                Undo
              </button>
              <button disabled={future.length === 0} onClick={handleRedo} type="button">
                Redo
              </button>
              <button onClick={handleReset} type="button">
                Reset
              </button>
            </MenuSection>
            <MenuSection label="Panels">
              <button onClick={() => setRightTab('layers')} type="button">
                Layers
              </button>
              <button onClick={() => setBottomTab('bundle')} type="button">
                JSON
              </button>
              <button onClick={() => setBottomTab('history')} type="button">
                History
              </button>
            </MenuSection>
            <MenuSection label="Level">
              <button onClick={addPhase} type="button">
                Phase
              </button>
              <button onClick={() => addEvent('set-phase')} type="button">
                Event
              </button>
              <button onClick={() => addEvent('deploy-unit')} type="button">
                Deploy
              </button>
            </MenuSection>
          </div>

          <div className="topbar-meta topbar-meta--compact">
            <span>{bundle.slug}</span>
            <strong>{saveState}</strong>
          </div>
        </div>

        <div className="option-bar-row option-bar-row--bottom">
          <LabeledField label="Brush">
            <input max={7} min={1} onChange={(event) => setBrushSize(Number(event.target.value))} type="range" value={brushSize} />
          </LabeledField>
          <LabeledField label="Terrain">
            <select onChange={(event) => setTerrainBrush(event.target.value as TerrainKey)} value={terrainBrush}>
              {Object.keys(terrainDefinitions).map((terrainId) => (
                <option key={terrainId} value={terrainId}>
                  {terrainId}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Height">
            <select onChange={(event) => setHeightDelta(Number(event.target.value))} value={heightDelta}>
              <option value={1}>+1</option>
              <option value={2}>+2</option>
              <option value={-1}>-1</option>
            </select>
          </LabeledField>
          <LabeledField label="Team">
            <select
              onChange={(event) =>
                setUnitPreset((current) => ({ ...current, team: event.target.value as Team, facing: event.target.value === 'allies' ? 'north' : 'south' }))
              }
              value={unitPreset.team}
            >
              <option value="allies">allies</option>
              <option value="enemies">enemies</option>
            </select>
          </LabeledField>
          <LabeledField label="Class">
            <select onChange={(event) => setUnitPreset((current) => ({ ...current, classId: event.target.value }))} value={unitPreset.classId}>
              {Object.keys(classDefinitions).map((classId) => (
                <option key={classId} value={classId}>
                  {classId}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="AI">
            <select onChange={(event) => setUnitPreset((current) => ({ ...current, aiProfileId: event.target.value }))} value={unitPreset.aiProfileId}>
              {Object.keys(aiProfiles).map((profileId) => (
                <option key={profileId} value={profileId}>
                  {profileId}
                </option>
              ))}
            </select>
          </LabeledField>
          <LabeledField label="Facing">
            <select onChange={(event) => setUnitPreset((current) => ({ ...current, facing: event.target.value as Direction }))} value={unitPreset.facing}>
              <option value="north">north</option>
              <option value="east">east</option>
              <option value="south">south</option>
              <option value="west">west</option>
            </select>
          </LabeledField>
        </div>
      </header>

      <section className="editor-body">
        <aside className="editor-toolbar">
          {TOOLBAR.map((entry) => (
            <ToolbarButton
              active={tool === entry.id}
              hotkey={entry.hotkey}
              key={entry.id}
              label={entry.label}
              tool={entry.id}
              onClick={() => setTool(entry.id)}
            />
          ))}
        </aside>

        <section className="editor-stage-stack">
          <div className="editor-stage-frame">
            <div className="stage-header">
              <div>
                <p>Canvas Stage</p>
                <strong>{bundle.map.width} x {bundle.map.height} tactical board</strong>
              </div>
              <div className="stage-header-tags">
                <span>{bundle.id}</span>
                <span>{validation.errors.length === 0 ? 'valid' : 'invalid'}</span>
              </div>
            </div>
            <div className="editor-canvas" ref={viewportRootRef} />
          </div>
        </section>

        <aside className="editor-sidebar">
          <PanelTabs
            onChange={setRightTab}
            options={[
              { id: 'inspector', label: 'Inspector' },
              { id: 'layers', label: 'Layers' },
              { id: 'library', label: 'Library' },
            ]}
            value={rightTab}
          />

          {rightTab === 'inspector' && (
            <div className="sidebar-panel">
              <section className="sidebar-card">
                <div className="card-heading">
                  <p>Status</p>
                  <strong>{statusMessage}</strong>
                </div>
                <p>Workspace: {workspaceHandle?.name ?? 'not connected'}</p>
                <p>Save path: {savePathForSlug(bundle.slug)}</p>
              </section>

              <section className="sidebar-card">
                <div className="card-heading">
                  <p>Phases</p>
                  <button onClick={addPhase} type="button">Add</button>
                </div>
                <div className="list-stack">
                  {bundle.objective.phases.map((phase) => (
                    <button
                      key={phase.id}
                      className={`list-item ${selection?.kind === 'phase' && selection.phaseId === phase.id ? 'is-active' : ''}`}
                      onClick={() => setSelection({ kind: 'phase', phaseId: phase.id })}
                      type="button"
                    >
                      <strong>{phase.id}</strong>
                      <small>{bundle.text.ko.phases[phase.id]?.objective ?? 'Untitled phase'}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sidebar-card">
                <div className="card-heading">
                  <p>Events</p>
                  <div className="inline-actions">
                    <button onClick={() => addEvent('set-phase')} type="button">Phase</button>
                    <button onClick={() => addEvent('deploy-unit')} type="button">Deploy</button>
                  </div>
                </div>
                <div className="list-stack">
                  {bundle.events.map((event) => (
                    <button
                      key={event.id}
                      className={`list-item ${selection?.kind === 'event' && selection.eventId === event.id ? 'is-active' : ''}`}
                      onClick={() => setSelection({ kind: 'event', eventId: event.id })}
                      type="button"
                    >
                      <strong>{event.id}</strong>
                      <small>{event.trigger.type}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section className="sidebar-card">
                <div className="card-heading">
                  <p>Selection</p>
                  <strong>{selection?.kind ?? 'level'}</strong>
                </div>

                {selectedTile && (
                  <div className="field-stack">
                    <LabeledField label="Tile">
                      <input readOnly value={pointKey(selectedTile)} />
                    </LabeledField>
                    <LabeledField label="Terrain">
                      <select
                        onChange={(event) =>
                          updateBundle((draft) => {
                            draft.map.terrain[selectedTile.y]![selectedTile.x] = event.target.value as TerrainKey
                          }, `Set terrain at ${pointKey(selectedTile)}`)
                        }
                        value={bundle.map.terrain[selectedTile.y]?.[selectedTile.x] ?? 'grass'}
                      >
                        {Object.keys(terrainDefinitions).map((terrainId) => (
                          <option key={terrainId} value={terrainId}>
                            {terrainId}
                          </option>
                        ))}
                      </select>
                    </LabeledField>
                    <LabeledField label="Elevation">
                      <input
                        min={0}
                        onChange={(event) =>
                          updateBundle((draft) => {
                            draft.map.elevation[selectedTile.y]![selectedTile.x] = Math.max(0, Number(event.target.value) || 0)
                          }, `Set elevation at ${pointKey(selectedTile)}`)
                        }
                        type="number"
                        value={bundle.map.elevation[selectedTile.y]?.[selectedTile.x] ?? 0}
                      />
                    </LabeledField>
                  </div>
                )}

                {selectedUnit && selection?.kind === 'unit' && (
                  <div className="field-stack">
                    <LabeledField label="Unit Id">
                      <input readOnly value={selectedUnit.id} />
                    </LabeledField>
                    <LabeledField label="Team">
                      <select
                        onChange={(event) =>
                          updateBundle((draft) => {
                            const sourceUnits = selection.team === 'allies' ? draft.units.allies : draft.units.enemies
                            const targetUnits = event.target.value === 'allies' ? draft.units.allies : draft.units.enemies
                            const index = sourceUnits.findIndex((unit) => unit.id === selectedUnit.id)

                            if (index >= 0) {
                              const [unit] = sourceUnits.splice(index, 1)
                              if (unit) {
                                targetUnits.push({ ...unit, facing: event.target.value === 'allies' ? 'north' : 'south' })
                              }
                            }
                          }, `Move ${selectedUnit.id} to ${selection.team}`)
                        }
                        value={selection.team}
                      >
                        <option value="allies">allies</option>
                        <option value="enemies">enemies</option>
                      </select>
                    </LabeledField>
                    <LabeledField label="Class">
                      <select
                        onChange={(event) =>
                          commitChange(`Set class for ${selectedUnit.id}`, (current) =>
                            updateStartingUnit(current, selection.team, selectedUnit.id, { classId: event.target.value }),
                          )
                        }
                        value={selectedUnit.classId}
                      >
                        {Object.keys(classDefinitions).map((classId) => (
                          <option key={classId} value={classId}>
                            {classId}
                          </option>
                        ))}
                      </select>
                    </LabeledField>
                    <LabeledField label="AI">
                      <select
                        onChange={(event) =>
                          commitChange(`Set AI for ${selectedUnit.id}`, (current) =>
                            updateStartingUnit(current, selection.team, selectedUnit.id, { aiProfileId: event.target.value }),
                          )
                        }
                        value={selectedUnit.aiProfileId}
                      >
                        {Object.keys(aiProfiles).map((profileId) => (
                          <option key={profileId} value={profileId}>
                            {profileId}
                          </option>
                        ))}
                      </select>
                    </LabeledField>
                    <LabeledField label="Facing">
                      <select
                        onChange={(event) =>
                          commitChange(`Set facing for ${selectedUnit.id}`, (current) =>
                            updateStartingUnit(current, selection.team, selectedUnit.id, { facing: event.target.value as Direction }),
                          )
                        }
                        value={selectedUnit.facing ?? (selection.team === 'allies' ? 'north' : 'south')}
                      >
                        <option value="north">north</option>
                        <option value="east">east</option>
                        <option value="south">south</option>
                        <option value="west">west</option>
                      </select>
                    </LabeledField>
                    <LabeledField label="Starting HP">
                      <input
                        min={0}
                        onChange={(event) =>
                          commitChange(`Set HP for ${selectedUnit.id}`, (current) =>
                            updateStartingUnit(current, selection.team, selectedUnit.id, {
                              startingHp: event.target.value === '' ? undefined : Number(event.target.value),
                            }),
                          )
                        }
                        type="number"
                        value={selectedUnit.startingHp ?? ''}
                      />
                    </LabeledField>
                    <LabeledField label="Korean Name">
                      <input
                        onChange={(event) =>
                          commitChange(`Rename ${selectedUnit.id}`, (current) =>
                            renameUnit(current, selectedUnit.id, 'ko', event.target.value),
                          )
                        }
                        value={bundle.text.ko.units[selectedUnit.id] ?? ''}
                      />
                    </LabeledField>
                    <LabeledField label="English Name">
                      <input
                        onChange={(event) =>
                          commitChange(`Rename ${selectedUnit.id} (EN)`, (current) =>
                            renameUnit(current, selectedUnit.id, 'en', event.target.value),
                          )
                        }
                        value={bundle.text.en?.units?.[selectedUnit.id] ?? ''}
                      />
                    </LabeledField>
                    <button
                      onClick={() => {
                        const nextPoint = selectedTile ?? { x: 0, y: 0 }
                        commitChange(`Move ${selectedUnit.id}`, (current) =>
                          moveStartingUnit(current, selection.team, selectedUnit.id, nextPoint),
                        )
                      }}
                      type="button"
                    >
                      Move to selected tile
                    </button>
                  </div>
                )}

                {selectedPhase && selection?.kind === 'phase' && (
                  <div className="field-stack">
                    <LabeledField label="Phase Id">
                      <input readOnly value={selectedPhase.id} />
                    </LabeledField>
                    <LabeledField label="Announcement Cue">
                      <input
                        onChange={(event) =>
                          updateBundle((draft) => {
                            const phase = draft.objective.phases.find((candidate) => candidate.id === selectedPhase.id)
                            if (phase) {
                              phase.announcementCueId = event.target.value || undefined
                            }
                          }, `Set cue for ${selectedPhase.id}`)
                        }
                        value={selectedPhase.announcementCueId ?? ''}
                      />
                    </LabeledField>
                    <LabeledField label="Korean Objective">
                      <input
                        onChange={(event) =>
                          commitChange(`Edit ${selectedPhase.id} objective`, (current) =>
                            updatePhaseText(current, selectedPhase.id, 'ko', 'objective', event.target.value),
                          )
                        }
                        value={bundle.text.ko.phases[selectedPhase.id]?.objective ?? ''}
                      />
                    </LabeledField>
                    <LabeledField label="English Objective">
                      <input
                        onChange={(event) =>
                          commitChange(`Edit ${selectedPhase.id} objective (EN)`, (current) =>
                            updatePhaseText(current, selectedPhase.id, 'en', 'objective', event.target.value),
                          )
                        }
                        value={bundle.text.en?.phases?.[selectedPhase.id]?.objective ?? ''}
                      />
                    </LabeledField>
                    {(['announcement', 'victory', 'defeat'] as const).map((field) => (
                      <LabeledField key={field} label={`Korean ${field}`}>
                        <textarea
                          onChange={(event) =>
                            commitChange(`Edit ${selectedPhase.id} ${field}`, (current) =>
                              updatePhaseText(current, selectedPhase.id, 'ko', field, event.target.value),
                            )
                          }
                          value={bundle.text.ko.phases[selectedPhase.id]?.[field] ?? ''}
                        />
                      </LabeledField>
                    ))}
                  </div>
                )}

                {selectedEvent && selection?.kind === 'event' && (
                  <div className="field-stack">
                    <LabeledField label="Event Id">
                      <input
                        onChange={(event) =>
                          updateBundle((draft) => {
                            const eventEntry = draft.events.find((candidate) => candidate.id === selectedEvent.id)
                            if (eventEntry) {
                              eventEntry.id = event.target.value
                            }
                          }, `Rename ${selectedEvent.id}`)
                        }
                        value={selectedEvent.id}
                      />
                    </LabeledField>
                    <LabeledField label="Trigger Type">
                      <select
                        onChange={(event) =>
                          updateBundle((draft) => {
                            const eventEntry = draft.events.find((candidate) => candidate.id === selectedEvent.id)
                            if (eventEntry) {
                              const nextType = event.target.value as BattleEventTrigger['type']
                              eventEntry.trigger =
                                nextType === 'battle-start'
                                  ? { type: 'battle-start' }
                                  : nextType === 'turn-start'
                                    ? { type: 'turn-start' }
                                    : { type: 'unit-defeated' }
                            }
                          }, `Set trigger for ${selectedEvent.id}`)
                        }
                        value={selectedEvent.trigger.type}
                      >
                        <option value="battle-start">battle-start</option>
                        <option value="turn-start">turn-start</option>
                        <option value="unit-defeated">unit-defeated</option>
                      </select>
                    </LabeledField>
                    {'turnIndex' in selectedEvent.trigger && (
                      <LabeledField label="Turn Index">
                        <input
                          min={1}
                          onChange={(event) =>
                            updateBundle((draft) => {
                              const eventEntry = draft.events.find((candidate) => candidate.id === selectedEvent.id)
                              if (eventEntry?.trigger.type === 'turn-start') {
                                eventEntry.trigger.turnIndex = event.target.value === '' ? undefined : Number(event.target.value)
                              }
                            }, `Set turn index for ${selectedEvent.id}`)
                          }
                          type="number"
                          value={selectedEvent.trigger.turnIndex ?? ''}
                        />
                      </LabeledField>
                    )}
                    {selectedEvent.effects.map((effect, effectIndex) => (
                      <div className="nested-card" key={`${selectedEvent.id}-${effectIndex}`}>
                        <div className="card-heading">
                          <p>Effect {effectIndex + 1}</p>
                          <strong>{effect.type}</strong>
                        </div>
                        {effect.type === 'set-objective-phase' ? (
                          <LabeledField label="Target Phase">
                            <select
                              onChange={(event) =>
                                updateBundle((draft) => {
                                  const eventEntry = draft.events.find((candidate) => candidate.id === selectedEvent.id)
                                  const targetEffect = eventEntry?.effects[effectIndex]
                                  if (targetEffect?.type === 'set-objective-phase') {
                                    targetEffect.objectivePhaseId = event.target.value
                                  }
                                }, `Update effect ${effectIndex + 1}`)
                              }
                              value={effect.objectivePhaseId}
                            >
                              {bundle.objective.phases.map((phase) => (
                                <option key={phase.id} value={phase.id}>
                                  {phase.id}
                                </option>
                              ))}
                            </select>
                          </LabeledField>
                        ) : (
                          <>
                            <LabeledField label="Deploy Team">
                              <select
                                onChange={(event) =>
                                  updateBundle((draft) => {
                                    const eventEntry = draft.events.find((candidate) => candidate.id === selectedEvent.id)
                                    const targetEffect = eventEntry?.effects[effectIndex]
                                    if (targetEffect?.type === 'deploy-unit') {
                                      targetEffect.unit.team = event.target.value as Team
                                    }
                                  }, `Update deploy effect ${effectIndex + 1}`)
                                }
                                value={effect.unit.team}
                              >
                                <option value="allies">allies</option>
                                <option value="enemies">enemies</option>
                              </select>
                            </LabeledField>
                            <LabeledField label="Deploy Class">
                              <select
                                onChange={(event) =>
                                  updateBundle((draft) => {
                                    const eventEntry = draft.events.find((candidate) => candidate.id === selectedEvent.id)
                                    const targetEffect = eventEntry?.effects[effectIndex]
                                    if (targetEffect?.type === 'deploy-unit') {
                                      targetEffect.unit.classId = event.target.value
                                    }
                                  }, `Update deploy effect ${effectIndex + 1}`)
                                }
                                value={effect.unit.classId}
                              >
                                {Object.keys(classDefinitions).map((classId) => (
                                  <option key={classId} value={classId}>
                                    {classId}
                                  </option>
                                ))}
                              </select>
                            </LabeledField>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!selectedTile && !selectedUnit && !selectedPhase && !selectedEvent && (
                  <div className="field-stack">
                    <LabeledField label="Level Id">
                      <input
                        onChange={(event) => updateBundle((draft) => { draft.id = event.target.value }, 'Edit level id')}
                        value={bundle.id}
                      />
                    </LabeledField>
                    <LabeledField label="Slug">
                      <input
                        onChange={(event) => updateBundle((draft) => { draft.slug = event.target.value }, 'Edit slug')}
                        value={bundle.slug}
                      />
                    </LabeledField>
                    <LabeledField label="Korean Title">
                      <input
                        onChange={(event) => updateBundle((draft) => { draft.text.ko.title = event.target.value }, 'Edit Korean title')}
                        value={bundle.text.ko.title}
                      />
                    </LabeledField>
                    <LabeledField label="English Title">
                      <input
                        onChange={(event) =>
                          updateBundle((draft) => {
                            draft.text.en = draft.text.en ?? { units: {}, phases: {} }
                            draft.text.en.title = event.target.value
                          }, 'Edit English title')
                        }
                        value={bundle.text.en?.title ?? ''}
                      />
                    </LabeledField>
                    <LabeledField label="Korean Briefing">
                      <textarea
                        onChange={(event) => updateBundle((draft) => { draft.text.ko.briefing = event.target.value }, 'Edit briefing')}
                        value={bundle.text.ko.briefing}
                      />
                    </LabeledField>
                    <div className="resize-grid">
                      <LabeledField label="Map Width">
                        <input min={4} onChange={(event) => setMapWidthDraft(event.target.value)} type="number" value={mapWidthDraft} />
                      </LabeledField>
                      <LabeledField label="Map Height">
                        <input min={4} onChange={(event) => setMapHeightDraft(event.target.value)} type="number" value={mapHeightDraft} />
                      </LabeledField>
                    </div>
                    <button onClick={handleResizeMapApply} type="button">
                      Apply Map Resize
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}

          {rightTab === 'layers' && (
            <div className="sidebar-panel">
              <section className="sidebar-card field-stack">
                {Object.entries(layers).map(([layerId, visible]) => (
                  <label className="layer-row" key={layerId}>
                    <span>{layerId}</span>
                    <input
                      checked={visible}
                      onChange={(event) => setLayers((current) => ({ ...current, [layerId]: event.target.checked }))}
                      type="checkbox"
                    />
                  </label>
                ))}
              </section>
            </div>
          )}

          {rightTab === 'library' && (
            <div className="sidebar-panel">
              <PanelTabs
                onChange={setLibraryTab}
                options={[
                  { id: 'terrain', label: 'Terrain' },
                  { id: 'classes', label: 'Classes' },
                  { id: 'ai', label: 'AI' },
                  { id: 'events', label: 'Events' },
                ]}
                value={libraryTab}
              />
              <section className="sidebar-card">
                {libraryTab === 'terrain' && (
                  <div className="terrain-swatch-grid">
                    {Object.entries(terrainDefinitions).map(([terrainId, terrain]) => (
                      <button
                        key={terrainId}
                        className={`terrain-swatch ${terrainBrush === terrainId ? 'is-active' : ''}`}
                        onClick={() => {
                          setTerrainBrush(terrainId as TerrainKey)
                          setTool('terrain-brush')
                        }}
                        style={{ ['--swatch-color' as string]: `#${terrain.tint.toString(16).padStart(6, '0')}` }}
                        type="button"
                      >
                        <strong>{terrainId}</strong>
                        <small>{terrain.moveCost} move</small>
                      </button>
                    ))}
                  </div>
                )}

                {libraryTab === 'classes' && (
                  <div className="list-stack">
                    {Object.entries(classDefinitions).map(([classId, classDef]) => (
                      <button
                        key={classId}
                        className={`list-item ${unitPreset.classId === classId ? 'is-active' : ''}`}
                        onClick={() => {
                          setUnitPreset((current) => ({ ...current, classId }))
                          setTool('unit-stamp')
                        }}
                        type="button"
                      >
                        <strong>{classId}</strong>
                        <small>{classDef.roleKey}</small>
                      </button>
                    ))}
                  </div>
                )}

                {libraryTab === 'ai' && (
                  <div className="list-stack">
                    {Object.entries(aiProfiles).map(([profileId, profile]) => (
                      <button
                        key={profileId}
                        className={`list-item ${unitPreset.aiProfileId === profileId ? 'is-active' : ''}`}
                        onClick={() => {
                          setUnitPreset((current) => ({ ...current, aiProfileId: profileId }))
                          setTool('unit-stamp')
                        }}
                        type="button"
                      >
                        <strong>{profileId}</strong>
                        <small>{`agg ${profile.aggression}, support ${profile.support}`}</small>
                      </button>
                    ))}
                  </div>
                )}

                {libraryTab === 'events' && (
                  <div className="list-stack">
                    <button className="list-item" onClick={() => addEvent('set-phase')} type="button">
                      <strong>Objective phase switch</strong>
                      <small>Switch to another phase when a trigger resolves.</small>
                    </button>
                    <button className="list-item" onClick={() => addEvent('deploy-unit')} type="button">
                      <strong>Deploy reinforcement</strong>
                      <small>Spawn a new ally or enemy unit from an event.</small>
                    </button>
                  </div>
                )}
              </section>
            </div>
          )}
        </aside>
      </section>

      <div
        aria-label="Resize bottom panel"
        className="bottom-panel-resize-handle"
        onPointerDown={(event) => {
          event.preventDefault()
          bottomResizeStateRef.current = {
            startY: event.clientY,
            startHeight: bottomPanelHeight,
          }
          setIsResizingBottomPanel(true)
        }}
        role="separator"
      />

      <section className="bottom-panel">
        <PanelTabs
          onChange={setBottomTab}
          options={[
            { id: 'validation', label: 'Validation' },
            { id: 'playtest', label: 'Playtest' },
            { id: 'bundle', label: 'Bundle JSON' },
            { id: 'history', label: 'History' },
          ]}
          value={bottomTab}
        />

        {bottomTab === 'validation' && (
          <div className="bottom-panel-content">
            <div className="validation-grid">
              <section>
                <h3>Errors</h3>
                {validation.errors.length === 0 ? <p>No blocking errors.</p> : validation.errors.map((error) => <p key={error}>{error}</p>)}
              </section>
              <section>
                <h3>Warnings</h3>
                {validation.warnings.length === 0 ? <p>No warnings.</p> : validation.warnings.map((warning) => <p key={warning}>{warning}</p>)}
              </section>
            </div>
          </div>
        )}

        {bottomTab === 'playtest' && (
          <div className="bottom-panel-content playtest-panel">
            <div className="playtest-toolbar">
              <LabeledField label="Main Game URL">
                <input onChange={(event) => setGameBaseUrl(event.target.value)} type="url" value={gameBaseUrl} />
              </LabeledField>
              <button onClick={() => setBottomTab('playtest')} type="button">
                Inline
              </button>
              <button onClick={() => handleOpenInGame('preview')} type="button">
                Open Preview
              </button>
              <button onClick={() => handleOpenInGame('saved')} type="button">
                Open Saved
              </button>
            </div>
            <iframe
              className="playtest-frame"
              onLoad={() => {
                setPreviewReady(true)
                postPreviewBundle()
              }}
              ref={previewFrameRef}
              src="/preview.html"
              title="Inline battle playtest"
            />
          </div>
        )}

        {bottomTab === 'bundle' && (
          <div className="bottom-panel-content">
            <pre className="bundle-preview">{deferredBundleJson}</pre>
          </div>
        )}

        {bottomTab === 'history' && (
          <div className="bottom-panel-content history-panel">
            <p>Undo stack: {past.length} snapshots</p>
            <p>Deploy-event templates in bundle: {eventTemplateCount}</p>
            {historyEntries.length === 0 ? (
              <p>No edits yet.</p>
            ) : (
              <ul>
                {historyEntries.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.label}</strong>
                    <small>{entry.timestamp}</small>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </main>
  )
}
