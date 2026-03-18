import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import {
  CHECKLIST_TEMPLATES,
  DEFAULT_PREVIEW_STATE,
  GLENMOOR_ANIMATIONS,
  GLENMOOR_CONTRACT,
  GLENMOOR_DIRECTIONS,
  buildSyntheticAtlasManifest,
} from './contracts/glenmoor'
import { isFileSystemAccessSupported, pickWorkspaceDirectory } from './lib/fsAccess'
import { clampFrameCursor, getFrameAtCursor, getNextFrameCursor } from './lib/previewState'
import { disposeAssetResources, loadDemoWorkspaceManifest, scanDemoWorkspace, scanWorkspace } from './lib/scanWorkspace'
import {
  getWorkspaceEntry,
  loadDemoWorkspaceFile,
  loadWorkspaceFile,
  replaceWorkspaceSummary,
  saveDemoWorkspaceFile,
  saveWorkspaceFile,
  upsertWorkspaceEntry,
} from './lib/workspaceStore'
import type {
  AssetKind,
  AssetRecord,
  AtlasAnimation,
  AtlasFrame,
  DemoWorkspaceManifest,
  Direction,
  FindingSeverity,
  PreviewState,
  WorkspaceFile,
  WorkspaceScanSummary,
  WorkspaceSource,
} from './types'

const FILTER_ORDER: Array<AssetKind | 'all'> = [
  'all',
  'unitAtlas',
  'unitManifest',
  'portrait',
  'terrainBlock',
  'terrainOverlay',
  'vfxSheet',
  'referenceImage',
  'unknown',
]

const DEMO_ONBOARDING_STORAGE_KEY = 'glenmoor-asset-workbench.demo-onboarding-dismissed'
const CENTER_STAGE_MIN_HEIGHT = 220
const CENTER_DOCK_MIN_HEIGHT = 180
const CENTER_SPLIT_HANDLE_SIZE = 8
const DEFAULT_DOCK_RATIO = 0.42

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type ScanState = 'idle' | 'scanning' | 'error'

function App() {
  const [workspaceSource, setWorkspaceSource] = useState<WorkspaceSource | null>(null)
  const [rootHandle, setRootHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [demoManifest, setDemoManifest] = useState<DemoWorkspaceManifest | null>(null)
  const [workspace, setWorkspace] = useState<WorkspaceFile | null>(null)
  const [summary, setSummary] = useState<WorkspaceScanSummary | null>(null)
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState>(DEFAULT_PREVIEW_STATE)
  const [leftPaneWidth, setLeftPaneWidth] = useState(304)
  const [rightPaneWidth, setRightPaneWidth] = useState(368)
  const [bottomPaneHeight, setBottomPaneHeight] = useState(238)
  const [searchText, setSearchText] = useState('')
  const [kindFilter, setKindFilter] = useState<AssetKind | 'all'>('all')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showDemoOnboarding, setShowDemoOnboarding] = useState(false)
  const [showManifestRaw, setShowManifestRaw] = useState(false)
  const assetsRef = useRef<AssetRecord[]>([])
  const stageStackRef = useRef<HTMLElement | null>(null)
  const hasMeasuredBottomPaneRef = useRef(false)

  const deferredSearchText = useDeferredValue(searchText)

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  useEffect(() => {
    return () => {
      disposeAssetResources(assetsRef.current)
    }
  }, [])

  useEffect(() => {
    const stageStack = stageStackRef.current
    if (!stageStack || typeof ResizeObserver === 'undefined') {
      return
    }

    const syncBottomPaneHeight = (containerHeight: number) => {
      if (containerHeight <= 0) {
        return
      }

      setBottomPaneHeight((current) => {
        const desired = hasMeasuredBottomPaneRef.current ? current : containerHeight * DEFAULT_DOCK_RATIO
        const next = clampBottomPaneHeight(desired, containerHeight)
        hasMeasuredBottomPaneRef.current = true
        return Math.abs(next - current) < 1 ? current : next
      })
    }

    syncBottomPaneHeight(stageStack.getBoundingClientRect().height)

    const observer = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? stageStack.getBoundingClientRect().height
      syncBottomPaneHeight(height)
    })
    observer.observe(stageStack)

    return () => observer.disconnect()
  }, [showDemoOnboarding])

  useEffect(() => {
    setShowManifestRaw(false)
  }, [selectedAssetId])

  useEffect(() => {
    if (workspaceSource !== 'demo') {
      setShowDemoOnboarding(false)
      return
    }

    if (typeof window === 'undefined') {
      setShowDemoOnboarding(true)
      return
    }

    const dismissed = window.localStorage.getItem(DEMO_ONBOARDING_STORAGE_KEY) === '1'
    setShowDemoOnboarding(!dismissed)
  }, [workspaceSource, demoManifest?.rootName])

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])

  const workspaceName = useMemo(() => {
    if (workspaceSource === 'demo') {
      return demoManifest?.rootName ?? workspace?.rootName ?? 'Demo Workspace'
    }
    return rootHandle?.name ?? workspace?.rootName ?? 'No workspace'
  }, [demoManifest?.rootName, rootHandle?.name, workspace?.rootName, workspaceSource])

  const selectedAsset = useMemo(
    () => (selectedAssetId ? assetMap.get(selectedAssetId) ?? null : null),
    [assetMap, selectedAssetId],
  )

  const selectedEntry = selectedAsset ? getWorkspaceEntry(workspace, selectedAsset) : null

  const selectedVisualAsset = useMemo(() => {
    if (!selectedAsset) {
      return null
    }
    if (selectedAsset.kind === 'unitManifest' && selectedAsset.linkedAtlasId) {
      return assetMap.get(selectedAsset.linkedAtlasId) ?? null
    }
    return selectedAsset.imageUrl ? selectedAsset : null
  }, [assetMap, selectedAsset])

  const selectedReferenceAsset = useMemo(() => {
    if (!selectedEntry?.referenceAssetId) {
      return null
    }
    return assetMap.get(selectedEntry.referenceAssetId) ?? null
  }, [assetMap, selectedEntry?.referenceAssetId])

  const relatedPortraitAsset = useMemo(() => {
    const unitId = selectedVisualAsset?.meta.unitId ?? selectedAsset?.meta.unitId
    if (!unitId) {
      return null
    }
    return assets.find((asset) => asset.kind === 'portrait' && asset.meta.unitId === unitId) ?? null
  }, [assets, selectedAsset?.meta.unitId, selectedVisualAsset?.meta.unitId])

  const activeManifest = useMemo(() => {
    if (!selectedAsset) {
      return null
    }
    if (selectedAsset.kind === 'unitManifest') {
      return selectedAsset.manifest ?? null
    }
    if (selectedAsset.kind === 'unitAtlas') {
      return selectedAsset.manifest ?? buildSyntheticAtlasManifest(selectedAsset.meta.unitId ?? 'unknown')
    }
    return null
  }, [selectedAsset])

  const activeFrames = useMemo(() => {
    if (!activeManifest) {
      return []
    }
    return activeManifest.frames
      .filter((frame) => frame.direction === preview.direction && frame.animation === preview.animation)
      .sort((left, right) => left.index - right.index)
  }, [activeManifest, preview.animation, preview.direction])

  const selectedFrame = getFrameAtCursor(activeFrames, preview.frameCursor)

  const filteredAssets = useMemo(() => {
    const query = deferredSearchText.trim().toLowerCase()
    return assets.filter((asset) => {
      if (kindFilter !== 'all' && asset.kind !== kindFilter) {
        return false
      }

      if (!query) {
        return true
      }

      return (
        asset.name.toLowerCase().includes(query) ||
        asset.path.toLowerCase().includes(query) ||
        asset.kind.toLowerCase().includes(query) ||
        asset.meta.unitId?.toLowerCase().includes(query) ||
        asset.meta.terrainId?.toLowerCase().includes(query) ||
        asset.meta.cueId?.toLowerCase().includes(query)
      )
    })
  }, [assets, deferredSearchText, kindFilter])

  useEffect(() => {
    if (!activeManifest) {
      return
    }

    const nextDirection =
      activeManifest.directions.find((direction) => direction === DEFAULT_PREVIEW_STATE.direction) ??
      activeManifest.directions[0] ??
      DEFAULT_PREVIEW_STATE.direction
    const nextAnimation =
      GLENMOOR_ANIMATIONS.find((animation) => activeManifest.animations[animation] > 0) ??
      GLENMOOR_ANIMATIONS[0] ??
      DEFAULT_PREVIEW_STATE.animation

    setPreview((current) => ({
      ...current,
      direction: nextDirection,
      animation: nextAnimation,
      frameCursor: 0,
      isPlaying: true,
      viewMode: selectedAsset?.kind === 'portrait' ? 'frame' : selectedAsset?.kind === 'unitAtlas' ? 'sheet' : current.viewMode,
    }))
  }, [activeManifest, selectedAsset?.id, selectedAsset?.kind])

  useEffect(() => {
    if (!activeFrames.length) {
      return
    }

    setPreview((current) => {
      const nextFrameCursor = clampFrameCursor(current.frameCursor, activeFrames.length)
      return nextFrameCursor === current.frameCursor ? current : { ...current, frameCursor: nextFrameCursor }
    })
  }, [activeFrames.length])

  useEffect(() => {
    if (!preview.isPlaying || activeFrames.length <= 1) {
      return
    }

    const timer = window.setInterval(() => {
      setPreview((current) => ({
        ...current,
        frameCursor: getNextFrameCursor(current.frameCursor, activeFrames.length),
      }))
    }, 170)

    return () => window.clearInterval(timer)
  }, [activeFrames.length, preview.isPlaying])

  async function commitWorkspace(nextWorkspace: WorkspaceFile): Promise<void> {
    setWorkspace(nextWorkspace)
    setSaveState('saving')

    try {
      if (workspaceSource === 'demo') {
        saveDemoWorkspaceFile(nextWorkspace)
      } else if (workspaceSource === 'filesystem' && rootHandle) {
        await saveWorkspaceFile(rootHandle, nextWorkspace)
      }

      setSaveState('saved')
    } catch (error) {
      setSaveState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to save workspace state.')
    }
  }

  async function runFileSystemScan(
    handle: FileSystemDirectoryHandle,
    preserveSelection = selectedAssetId,
    workspaceOverride?: WorkspaceFile | null,
  ): Promise<void> {
    setScanState('scanning')
    setErrorMessage(null)

    try {
      const loadedWorkspace = workspaceOverride ?? (await loadWorkspaceFile(handle))
      const result = await scanWorkspace(handle, loadedWorkspace)
      const nextWorkspace = replaceWorkspaceSummary(loadedWorkspace, handle.name, result.summary)
      await saveWorkspaceFile(handle, nextWorkspace)

      startTransition(() => {
        disposeAssetResources(assetsRef.current)
        setWorkspaceSource('filesystem')
        setRootHandle(handle)
        setDemoManifest(null)
        setWorkspace(nextWorkspace)
        setSummary(result.summary)
        setAssets(result.assets)
        setSelectedAssetId(resolveSelection(result.assets, preserveSelection, result.preferredSelectionId))
        setScanState('idle')
        setSaveState('saved')
      })
    } catch (error) {
      setScanState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to scan workspace.')
    }
  }

  async function runDemoScan(preserveSelection = selectedAssetId, workspaceOverride?: WorkspaceFile | null): Promise<void> {
    setScanState('scanning')
    setErrorMessage(null)

    try {
      const manifest = await loadDemoWorkspaceManifest()
      const loadedWorkspace = workspaceOverride ?? loadDemoWorkspaceFile(manifest)
      const result = await scanDemoWorkspace(loadedWorkspace, manifest)
      const nextWorkspace = replaceWorkspaceSummary(loadedWorkspace, manifest.rootName, result.summary)
      saveDemoWorkspaceFile(nextWorkspace)

      startTransition(() => {
        disposeAssetResources(assetsRef.current)
        setWorkspaceSource('demo')
        setRootHandle(null)
        setDemoManifest(result.demoManifest ?? manifest)
        setWorkspace(nextWorkspace)
        setSummary(result.summary)
        setAssets(result.assets)
        setSelectedAssetId(resolveSelection(result.assets, preserveSelection, result.preferredSelectionId))
        setScanState('idle')
        setSaveState('saved')
      })
    } catch (error) {
      setScanState('error')
      setErrorMessage(error instanceof Error ? error.message : 'Failed to load demo workspace.')
    }
  }

  async function handleOpenWorkspace(): Promise<void> {
    if (!isFileSystemAccessSupported()) {
      setScanState('error')
      setErrorMessage('This app requires Chromium File System Access support.')
      return
    }

    const handle = await pickWorkspaceDirectory()
    await runFileSystemScan(handle)
  }

  async function rescanCurrentWorkspace(): Promise<void> {
    if (workspaceSource === 'demo') {
      await runDemoScan(selectedAssetId, workspace)
      return
    }

    if (workspaceSource === 'filesystem' && rootHandle) {
      await runFileSystemScan(rootHandle, selectedAssetId, workspace)
    }
  }

  async function updateSelectedEntry(next: Partial<WorkspaceFile['entries'][string]>, options?: { rescan?: boolean }): Promise<void> {
    if (!selectedAsset || !workspaceSource) {
      return
    }

    const nextWorkspace = upsertWorkspaceEntry(workspace, workspaceName, selectedAsset, next, summary ?? undefined)
    await commitWorkspace(nextWorkspace)

    if (options?.rescan) {
      if (workspaceSource === 'demo') {
        await runDemoScan(selectedAsset.id, nextWorkspace)
      } else if (workspaceSource === 'filesystem' && rootHandle) {
        await runFileSystemScan(rootHandle, selectedAsset.id, nextWorkspace)
      }
    }
  }

  function beginResize(edge: 'left' | 'right' | 'bottom', event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault()
    const startX = event.clientX
    const startY = event.clientY
    const initialLeft = leftPaneWidth
    const initialRight = rightPaneWidth
    const initialBottom = bottomPaneHeight
    const stageStackHeight = stageStackRef.current?.getBoundingClientRect().height ?? 0

    const handleMove = (moveEvent: PointerEvent) => {
      if (edge === 'left') {
        setLeftPaneWidth(clamp(initialLeft + moveEvent.clientX - startX, 260, 420))
      } else if (edge === 'right') {
        setRightPaneWidth(clamp(initialRight - (moveEvent.clientX - startX), 320, 460))
      } else {
        setBottomPaneHeight(clampBottomPaneHeight(initialBottom - (moveEvent.clientY - startY), stageStackHeight))
      }
    }

    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  return (
    <main
      className="workbench-shell"
      style={
        {
          '--left-pane-width': `${leftPaneWidth}px`,
          '--right-pane-width': `${rightPaneWidth}px`,
          '--bottom-pane-height': `${bottomPaneHeight}px`,
          '--stage-min-height': `${CENTER_STAGE_MIN_HEIGHT}px`,
          '--dock-min-height': `${CENTER_DOCK_MIN_HEIGHT}px`,
          '--split-handle-size': `${CENTER_SPLIT_HANDLE_SIZE}px`,
        } as CSSProperties
      }
    >
      <header className="workbench-toolbar">
        <div className="toolbar-brand">
          <div className="brand-badge">GAW</div>
          <div>
            <strong>Glenmoor Asset Workbench</strong>
            <p>Creative-tool workspace for Glenmoor sprite sheets, portraits, tiles, and VFX.</p>
          </div>
        </div>

        <div className="toolbar-actions">
          <button className="tool-button primary" type="button" onClick={() => void runDemoScan()}>
            Try Demo Workspace
          </button>
          <button className="tool-button" type="button" onClick={() => void handleOpenWorkspace()}>
            Open Folder
          </button>
          <button className="tool-button" type="button" onClick={() => void rescanCurrentWorkspace()} disabled={!workspaceSource || scanState === 'scanning'}>
            Rescan
          </button>
          <div className={`status-pill is-${scanState === 'error' || saveState === 'error' ? 'fail' : scanState === 'scanning' ? 'warn' : 'pass'}`}>
            {scanState === 'scanning' ? 'Scanning' : humanizeSaveState(saveState)}
          </div>
          <div className="toolbar-meta">
            <span>{workspaceName}</span>
            <span>{workspaceSource ?? 'launchpad'}</span>
            <span>{summary?.assetCount ?? assets.length} assets</span>
            <span>{summary?.findingCounts.fail ?? 0} fail</span>
            <span>{summary?.findingCounts.warn ?? 0} warn</span>
          </div>
        </div>
      </header>

      {workspaceSource === 'demo' && demoManifest && showDemoOnboarding ? (
        <DemoOnboardingRibbon
          manifest={demoManifest}
          onSelectAsset={(assetId) => setSelectedAssetId(assetId)}
          onDismiss={() => {
            setShowDemoOnboarding(false)
            if (typeof window !== 'undefined') {
              window.localStorage.setItem(DEMO_ONBOARDING_STORAGE_KEY, '1')
            }
          }}
        />
      ) : null}

      <section className="workbench-grid">
        <aside className="pane pane-browser">
          <div className="pane-header">
            <strong>Asset Browser</strong>
            <span>{filteredAssets.length} visible</span>
          </div>
          <div className="browser-controls">
            <input
              aria-label="Search assets"
              className="search-input"
              placeholder="Search path, unit, terrain, cue"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <div className="filter-row">
              {FILTER_ORDER.map((filter) => (
                <button
                  key={filter}
                  className={`filter-chip ${kindFilter === filter ? 'is-active' : ''}`}
                  type="button"
                  onClick={() => setKindFilter(filter)}
                >
                  {filter === 'all' ? 'All' : filter}
                </button>
              ))}
            </div>
          </div>

          <div className="asset-list">
            {filteredAssets.length === 0 ? (
              <div className="empty-browser">
                {workspaceSource ? (
                  <p>No matching assets.</p>
                ) : (
                  <>
                    <strong>Demo-first launch</strong>
                    <p>Try the bundled workspace or open a real project folder to begin.</p>
                  </>
                )}
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const severity = highestSeverity(asset.findings)
                return (
                  <button
                    key={asset.id}
                    className={`asset-row ${selectedAssetId === asset.id ? 'is-selected' : ''}`}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                  >
                    <span className={`severity-dot is-${severity}`} />
                    <span className="asset-row-main">
                      <strong>{asset.name}</strong>
                      <small>{asset.path}</small>
                    </span>
                    <span className="asset-row-meta">
                      <em>{asset.kind}</em>
                      <span>{severity.toUpperCase()}</span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <div className="pane-resizer vertical" onPointerDown={(event) => beginResize('left', event)} />

        <section className="stage-stack" ref={stageStackRef}>
          <div className="pane pane-stage">
            <div className="pane-header">
              <strong>Stage</strong>
              <span>{selectedAsset?.path ?? (workspaceSource ? workspaceName : 'Try Demo Workspace or open a folder')}</span>
            </div>
            {errorMessage ? <div className="message-banner">{errorMessage}</div> : null}
            <WorkspaceNotice
              workspaceSource={workspaceSource}
              summary={summary}
              selectedAsset={selectedAsset}
              onShowManifestRaw={() => setShowManifestRaw(true)}
            />
            <div className="stage-surface">
              <StagePanel
                asset={selectedAsset}
                visualAsset={selectedVisualAsset}
                referenceAsset={selectedReferenceAsset}
                portraitAsset={relatedPortraitAsset}
                frame={selectedFrame}
                preview={preview}
                summary={summary}
                workspaceSource={workspaceSource}
                showManifestRaw={showManifestRaw}
                onToggleManifestRaw={() => setShowManifestRaw((current) => !current)}
                onOpenDemo={() => void runDemoScan()}
                onOpenFolder={() => void handleOpenWorkspace()}
              />
            </div>
          </div>

          <div className="pane-resizer horizontal" onPointerDown={(event) => beginResize('bottom', event)} />

          <div className="pane pane-bottom">
            <div className="pane-header">
              <strong>Filmstrip / Compare Dock</strong>
              <span>{selectedAsset?.kind ?? 'No selection'}</span>
            </div>
            <div className="dock-surface">
              <BottomDock
                asset={selectedAsset}
                visualAsset={selectedVisualAsset}
                referenceAsset={selectedReferenceAsset}
                frames={activeFrames}
                preview={preview}
                showManifestRaw={showManifestRaw}
                onToggleManifestRaw={() => setShowManifestRaw((current) => !current)}
                onPreviewChange={setPreview}
              />
            </div>
          </div>
        </section>

        <div className="pane-resizer vertical" onPointerDown={(event) => beginResize('right', event)} />

        <aside className="pane pane-inspector">
          <div className="pane-header">
            <strong>Inspector</strong>
            <span>{selectedAsset ? highestSeverity(selectedAsset.findings).toUpperCase() : 'READY'}</span>
          </div>

          {!selectedAsset || !selectedEntry ? (
            <div className="inspector-empty">
              {workspaceSource ? 'Choose an asset to inspect its metadata, review state, and findings.' : 'Start with the demo workspace or open a folder.'}
            </div>
          ) : (
            <div className="inspector-sections">
              <section className="inspector-card summary-card">
                <div>
                  <strong>{selectedAsset.name}</strong>
                  <p>{selectedAsset.path}</p>
                </div>
                <div className={`status-pill is-${highestSeverity(selectedAsset.findings)}`}>{highestSeverity(selectedAsset.findings)}</div>
              </section>

              <section className="inspector-card">
                <h3>Metadata</h3>
                <dl className="meta-grid">
                  <div>
                    <dt>Kind</dt>
                    <dd>{selectedAsset.kind}</dd>
                  </div>
                  <div>
                    <dt>Source</dt>
                    <dd>{selectedAsset.sourceType}</dd>
                  </div>
                  <div>
                    <dt>Storage</dt>
                    <dd>{workspaceSource === 'demo' ? 'Browser localStorage' : '.asset-workbench/workspace.json'}</dd>
                  </div>
                  <div>
                    <dt>File Size</dt>
                    <dd>{formatBytes(selectedAsset.fileSize)}</dd>
                  </div>
                  <div>
                    <dt>Dimensions</dt>
                    <dd>{selectedAsset.metrics ? `${selectedAsset.metrics.width} x ${selectedAsset.metrics.height}` : 'n/a'}</dd>
                  </div>
                  <div>
                    <dt>Unit / Terrain / Cue</dt>
                    <dd>{selectedAsset.meta.unitId ?? selectedAsset.meta.terrainId ?? selectedAsset.meta.cueId ?? '—'}</dd>
                  </div>
                  <div>
                    <dt>Linked Ref</dt>
                    <dd>{selectedReferenceAsset?.name ?? 'None'}</dd>
                  </div>
                  <div>
                    <dt>Companion Atlas</dt>
                    <dd>{selectedAsset.kind === 'unitManifest' ? selectedAsset.meta.expectedAtlasPath ?? 'n/a' : selectedAsset.linkedManifestId ? 'manifest linked' : 'n/a'}</dd>
                  </div>
                </dl>
              </section>

              <section className="inspector-card">
                <h3>Review Controls</h3>
                <label className="field">
                  <span>Source Type</span>
                  <select
                    value={selectedEntry.sourceType ?? selectedAsset.sourceType}
                    onChange={(event) => {
                      void updateSelectedEntry({ sourceType: event.target.value as AssetRecord['sourceType'] }, { rescan: true })
                    }}
                  >
                    <option value="generated">generated</option>
                    <option value="purchased">purchased</option>
                  </select>
                </label>

                <label className="field">
                  <span>Review Status</span>
                  <select
                    value={selectedEntry.reviewStatus}
                    onChange={(event) => {
                      void updateSelectedEntry({ reviewStatus: event.target.value as typeof selectedEntry.reviewStatus })
                    }}
                  >
                    <option value="unreviewed">unreviewed</option>
                    <option value="approved">approved</option>
                    <option value="hold">hold</option>
                    <option value="rejected">rejected</option>
                  </select>
                </label>

                <label className="field">
                  <span>Reference Asset</span>
                  <select
                    value={selectedEntry.referenceAssetId ?? ''}
                    onChange={(event) => {
                      void updateSelectedEntry({ referenceAssetId: event.target.value || undefined }, { rescan: true })
                    }}
                  >
                    <option value="">None</option>
                    {assets
                      .filter((asset) => asset.id !== selectedAsset.id && Boolean(asset.imageUrl))
                      .map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field">
                  <span>Notes</span>
                  <textarea
                    value={selectedEntry.notes}
                    onChange={(event) => {
                      void updateSelectedEntry({ notes: event.target.value })
                    }}
                  />
                </label>
              </section>

              <section className="inspector-card">
                <h3>Checklist</h3>
                <div className="checklist">
                  {CHECKLIST_TEMPLATES[selectedAsset.kind].map((item) => (
                    <label key={item.id} className="checklist-item">
                      <input
                        checked={selectedEntry.checklist[item.id] ?? false}
                        type="checkbox"
                        onChange={(event) => {
                          void updateSelectedEntry({
                            checklist: {
                              ...selectedEntry.checklist,
                              [item.id]: event.target.checked,
                            },
                          })
                        }}
                      />
                      <span>
                        <strong>{item.label}</strong>
                        <em>{item.description}</em>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="inspector-card">
                <h3>Findings</h3>
                <div className="finding-list">
                  {selectedAsset.findings.map((finding) => (
                    <article key={finding.id} className={`finding-card is-${finding.severity}`}>
                      <div className="finding-title-row">
                        <strong>{finding.title}</strong>
                        <span>{finding.severity}</span>
                      </div>
                      <p>{finding.description}</p>
                      {finding.suggestion ? <small>{finding.suggestion}</small> : null}
                    </article>
                  ))}
                </div>
              </section>

              {selectedAsset.referenceComparison ? (
                <section className="inspector-card">
                  <h3>Reference Drift</h3>
                  <dl className="meta-grid">
                    <div>
                      <dt>Palette Drift</dt>
                      <dd>{selectedAsset.referenceComparison.paletteDrift.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Luminance Drift</dt>
                      <dd>{selectedAsset.referenceComparison.luminanceDrift.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Saturation Drift</dt>
                      <dd>{selectedAsset.referenceComparison.saturationDrift.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Mass Difference</dt>
                      <dd>{selectedAsset.referenceComparison.silhouetteMassDiff.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Color Overlap</dt>
                      <dd>{selectedAsset.referenceComparison.dominantColorOverlap.toFixed(2)}</dd>
                    </div>
                    <div>
                      <dt>Center Drift</dt>
                      <dd>{selectedAsset.referenceComparison.centerDrift.toFixed(2)}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              {selectedAsset.metrics ? (
                <section className="inspector-card">
                  <h3>Color / Mass</h3>
                  <div className="swatch-row">
                    {selectedAsset.metrics.dominantColors.map((color) => (
                      <div key={color.hex} className="swatch-chip">
                        <span style={{ backgroundColor: color.hex }} />
                        <em>{color.hex}</em>
                      </div>
                    ))}
                  </div>
                  <dl className="meta-grid">
                    <div>
                      <dt>Luminance</dt>
                      <dd>{(selectedAsset.metrics.meanLuminance * 100).toFixed(0)}%</dd>
                    </div>
                    <div>
                      <dt>Saturation</dt>
                      <dd>{(selectedAsset.metrics.meanSaturation * 100).toFixed(0)}%</dd>
                    </div>
                    <div>
                      <dt>Transparent</dt>
                      <dd>{(selectedAsset.metrics.transparentRatio * 100).toFixed(0)}%</dd>
                    </div>
                    <div>
                      <dt>Center Drift</dt>
                      <dd>{selectedAsset.metrics.centerOfMassDistance.toFixed(2)}</dd>
                    </div>
                  </dl>
                </section>
              ) : null}
            </div>
          )}
        </aside>
      </section>
    </main>
  )
}

function DemoOnboardingRibbon({
  manifest,
  onSelectAsset,
  onDismiss,
}: {
  manifest: DemoWorkspaceManifest
  onSelectAsset: (assetId: string) => void
  onDismiss: () => void
}) {
  return (
    <section className="demo-ribbon">
      <div className="demo-ribbon-copy">
        <strong>Demo Workspace Tour</strong>
        <p>Start with Rowan for pass examples, then jump to Sable for warning-softened purchased candidates. Demo reviews persist in browser local storage.</p>
      </div>
      <div className="demo-ribbon-steps">
        {manifest.onboarding.map((step) => (
          <button
            key={step.id}
            className="demo-step-card"
            type="button"
            onClick={() => step.assetId && onSelectAsset(step.assetId)}
            disabled={!step.assetId}
          >
            <strong>{step.title}</strong>
            <p>{step.description}</p>
          </button>
        ))}
      </div>
      <button className="tool-button" type="button" onClick={onDismiss}>
        Hide Tour
      </button>
    </section>
  )
}

function WorkspaceNotice({
  workspaceSource,
  summary,
  selectedAsset,
  onShowManifestRaw,
}: {
  workspaceSource: WorkspaceSource | null
  summary: WorkspaceScanSummary | null
  selectedAsset: AssetRecord | null
  onShowManifestRaw: () => void
}) {
  if (workspaceSource !== 'filesystem' || !summary) {
    return null
  }

  if (summary.assetCount === 0) {
    return (
      <section className="workspace-notice">
        <div className="notice-card is-empty">
          <strong>No Glenmoor gameplay assets found in this folder.</strong>
          <p>Open a folder containing runtime sprite, portrait, terrain, or VFX exports. This folder currently has no recognized gameplay asset filenames.</p>
        </div>
      </section>
    )
  }

  const hasOnlyManifests = summary.coverage.placeholderOnly && summary.countsByKind.unitManifest > 0
  const shouldShowCoverage = summary.coverage.placeholderOnly || hasOnlyManifests

  if (!shouldShowCoverage && !(selectedAsset?.kind === 'unitManifest' && !selectedAsset.linkedAtlasId)) {
    return null
  }

  return (
    <section className="workspace-notice">
      {summary.coverage.placeholderOnly ? (
        <div className="notice-card">
          <strong>{hasOnlyManifests ? 'Contracts were found, but the visual assets are still missing.' : 'The folder is still placeholder-only.'}</strong>
          <p>
            {hasOnlyManifests
              ? `Detected ${summary.countsByKind.unitManifest} battle manifest${summary.countsByKind.unitManifest === 1 ? '' : 's'}, but no atlases, portraits, terrain, or VFX sheets were found yet.`
              : 'No sprite sheets, portraits, terrain blocks, or VFX sheets were found yet. Add candidate exports to see the production-style stage populate.'}
          </p>
          <div className="coverage-row">
            <span>Atlases {summary.coverage.atlasCount}/{summary.coverage.expectedUnits}</span>
            <span>Portraits {summary.coverage.portraitCount}/{summary.coverage.expectedUnits}</span>
            <span>Terrains {summary.coverage.terrainFamiliesPresent}/{summary.coverage.expectedTerrains}</span>
            <span>VFX {summary.coverage.vfxCuesPresent}/{summary.coverage.expectedVfx}</span>
          </div>
        </div>
      ) : null}

      {selectedAsset?.kind === 'unitManifest' && !selectedAsset.linkedAtlasId ? (
        <div className="notice-card is-actionable">
          <strong>Manifest loaded, companion atlas missing.</strong>
          <p>
            The contract for <code>{selectedAsset.meta.unitId}</code> was parsed successfully, but <code>{selectedAsset.meta.expectedAtlasPath ?? 'unit_<unit>_battle.webp'}</code> is not present in this folder yet.
          </p>
          <div className="notice-actions">
            <button className="tool-button" type="button" onClick={onShowManifestRaw}>
              Inspect Raw Manifest
            </button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function StagePanel({
  asset,
  visualAsset,
  referenceAsset,
  portraitAsset,
  frame,
  preview,
  summary,
  workspaceSource,
  showManifestRaw,
  onToggleManifestRaw,
  onOpenDemo,
  onOpenFolder,
}: {
  asset: AssetRecord | null
  visualAsset: AssetRecord | null
  referenceAsset: AssetRecord | null
  portraitAsset: AssetRecord | null
  frame: AtlasFrame | null
  preview: PreviewState
  summary: WorkspaceScanSummary | null
  workspaceSource: WorkspaceSource | null
  showManifestRaw: boolean
  onToggleManifestRaw: () => void
  onOpenDemo: () => void
  onOpenFolder: () => void
}) {
  if (!workspaceSource) {
    return <Launchpad onOpenDemo={onOpenDemo} onOpenFolder={onOpenFolder} />
  }

  if (!asset) {
    return (
      <div className="empty-stage">
        <p>{summary?.assetCount ? 'Choose an asset from the browser to inspect it.' : 'No recognized Glenmoor assets are selected yet.'}</p>
      </div>
    )
  }

  if ((asset.kind === 'unitAtlas' || asset.kind === 'unitManifest') && visualAsset?.imageUrl && frame) {
    const selectedFrameStyle = {
      '--frame-left': `${(frame.x / GLENMOOR_CONTRACT.atlas.width) * 100}%`,
      '--frame-top': `${(frame.y / GLENMOOR_CONTRACT.atlas.height) * 100}%`,
      '--frame-width': `${(frame.w / GLENMOOR_CONTRACT.atlas.width) * 100}%`,
      '--frame-height': `${(frame.h / GLENMOOR_CONTRACT.atlas.height) * 100}%`,
    } as CSSProperties

    return (
      <div className={`atlas-stage is-${preview.viewMode}`}>
        <div className="frame-preview-card atlas-primary-card">
          <div className="frame-preview-head">
            <strong>{preview.viewMode === 'sheet' ? 'Sheet Overview' : preview.viewMode === 'frame' ? 'Frame Preview' : 'Duel 2x Preview'}</strong>
            <span>
              {frame.direction} / {frame.animation} / {frame.index}
            </span>
          </div>
          {preview.viewMode === 'sheet' ? (
            <div className="sheet-preview-shell stage-sheet-primary">
              <div className="sheet-preview-canvas">
                <img alt={visualAsset.name} src={visualAsset.imageUrl} />
                <div className="sheet-grid" />
                <div className="selected-frame-box" style={selectedFrameStyle} />
              </div>
            </div>
          ) : (
            <div className={`sprite-frame-shell ${preview.viewMode === 'duel' ? 'is-duel-stage' : ''}`}>
              <div
                className={`sprite-frame ${preview.flipX ? 'is-flipped' : ''}`}
                style={{
                  '--frame-width': `${frame.w * GLENMOOR_CONTRACT.duel.scale}px`,
                  '--frame-height': `${frame.h * GLENMOOR_CONTRACT.duel.scale}px`,
                  '--pivot-left': `${(frame.pivotX / frame.w) * 100}%`,
                  '--pivot-top': `${(frame.pivotY / frame.h) * 100}%`,
                  backgroundImage: `url(${visualAsset.imageUrl})`,
                  backgroundPosition: `${-frame.x * GLENMOOR_CONTRACT.duel.scale}px ${-frame.y * GLENMOOR_CONTRACT.duel.scale}px`,
                  backgroundSize: `${GLENMOOR_CONTRACT.atlas.width * GLENMOOR_CONTRACT.duel.scale}px ${GLENMOOR_CONTRACT.atlas.height * GLENMOOR_CONTRACT.duel.scale}px`,
                } as CSSProperties}
              >
                <span className="pivot-marker" />
              </div>
              {preview.viewMode === 'duel' ? <div className="duel-floor-line" /> : null}
            </div>
          )}
        </div>

        <div className="sheet-preview-card atlas-secondary-card">
          <div className="frame-preview-head">
            <strong>{preview.viewMode === 'sheet' ? 'Live Frame' : 'Atlas Grid'}</strong>
            <span>{preview.viewMode === 'sheet' ? 'Pivot and duel scale check' : '12 x 8 atlas grid'}</span>
          </div>
          {preview.viewMode === 'sheet' ? (
            <div className="sprite-frame-shell">
              <div
                className={`sprite-frame ${preview.flipX ? 'is-flipped' : ''}`}
                style={{
                  '--frame-width': `${frame.w * GLENMOOR_CONTRACT.duel.scale}px`,
                  '--frame-height': `${frame.h * GLENMOOR_CONTRACT.duel.scale}px`,
                  '--pivot-left': `${(frame.pivotX / frame.w) * 100}%`,
                  '--pivot-top': `${(frame.pivotY / frame.h) * 100}%`,
                  backgroundImage: `url(${visualAsset.imageUrl})`,
                  backgroundPosition: `${-frame.x * GLENMOOR_CONTRACT.duel.scale}px ${-frame.y * GLENMOOR_CONTRACT.duel.scale}px`,
                  backgroundSize: `${GLENMOOR_CONTRACT.atlas.width * GLENMOOR_CONTRACT.duel.scale}px ${GLENMOOR_CONTRACT.atlas.height * GLENMOOR_CONTRACT.duel.scale}px`,
                } as CSSProperties}
              >
                <span className="pivot-marker" />
              </div>
            </div>
          ) : (
            <div className="sheet-preview-shell">
              <div className="sheet-preview-canvas">
                <img alt={visualAsset.name} src={visualAsset.imageUrl} />
                <div className="sheet-grid" />
                <div className="selected-frame-box" style={selectedFrameStyle} />
              </div>
            </div>
          )}
        </div>

        <div className="reference-stage-card">
          <strong>{referenceAsset ? 'Reference Compare' : portraitAsset ? 'Portrait Chip' : 'Duel Readability'}</strong>
          {referenceAsset?.imageUrl ? (
            <div className="reference-stack">
              <img alt={referenceAsset.name} src={referenceAsset.imageUrl} />
              {portraitAsset?.imageUrl ? (
                <div className="reference-chip">
                  <span>Portrait chip</span>
                  <div className="portrait-chip" style={{ width: 72, height: 72 }}>
                    <img alt={portraitAsset.name} src={portraitAsset.imageUrl} />
                  </div>
                </div>
              ) : null}
            </div>
          ) : portraitAsset?.imageUrl ? (
            <div className="reference-chip solo">
              <span>Portrait chip</span>
              <div className="portrait-chip" style={{ width: 96, height: 96 }}>
                <img alt={portraitAsset.name} src={portraitAsset.imageUrl} />
              </div>
            </div>
          ) : (
            <div className="duel-readability-card">
              <div
                className={`sprite-frame duel-mini ${preview.flipX ? 'is-flipped' : ''}`}
                style={{
                  '--frame-width': `${frame.w}px`,
                  '--frame-height': `${frame.h}px`,
                  '--pivot-left': `${(frame.pivotX / frame.w) * 100}%`,
                  '--pivot-top': `${(frame.pivotY / frame.h) * 100}%`,
                  backgroundImage: `url(${visualAsset.imageUrl})`,
                  backgroundPosition: `${-frame.x}px ${-frame.y}px`,
                  backgroundSize: `${GLENMOOR_CONTRACT.atlas.width}px ${GLENMOOR_CONTRACT.atlas.height}px`,
                } as CSSProperties}
              >
                <span className="pivot-marker" />
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (asset.kind === 'portrait' && visualAsset?.imageUrl) {
    return (
      <div className="portrait-stage">
        <div className="portrait-focus">
          <img alt={visualAsset.name} src={visualAsset.imageUrl} />
          <div className="portrait-safe-zone" />
        </div>
        <div className="portrait-chip-grid">
          {[128, ...GLENMOOR_CONTRACT.portrait.previewSizes].map((size) => (
            <div key={size} className="chip-card">
              <strong>{size}px Preview</strong>
              <div className="portrait-chip" style={{ width: size, height: size }}>
                <img alt={`${visualAsset.name} ${size}`} src={visualAsset.imageUrl} />
              </div>
            </div>
          ))}
          {referenceAsset?.imageUrl ? (
            <div className="chip-card">
              <strong>Reference</strong>
              <div className="portrait-chip portrait-chip-reference">
                <img alt={referenceAsset.name} src={referenceAsset.imageUrl} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if ((asset.kind === 'terrainBlock' || asset.kind === 'terrainOverlay') && visualAsset?.imageUrl) {
    return (
      <div className="terrain-stage">
        <div className="terrain-focus">
          <img alt={visualAsset.name} src={visualAsset.imageUrl} />
          <div className="terrain-safe terrain-top" />
          <div className="terrain-safe terrain-face" />
          <span className="terrain-center-marker" />
        </div>
        <div className="terrain-repeat-grid">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="terrain-repeat-cell">
              <img alt={`${visualAsset.name} repeat ${index + 1}`} src={visualAsset.imageUrl} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (asset.kind === 'vfxSheet' && visualAsset?.imageUrl) {
    return (
      <div className="vfx-stage">
        <div className="vfx-card is-dark">
          <strong>Dark Backdrop</strong>
          <div className="vfx-shell">
            <img alt={visualAsset.name} src={visualAsset.imageUrl} />
            <span className="vfx-center-marker" />
          </div>
        </div>
        <div className="vfx-card is-light">
          <strong>Light Backdrop</strong>
          <div className="vfx-shell">
            <img alt={visualAsset.name} src={visualAsset.imageUrl} />
            <span className="vfx-center-marker" />
          </div>
        </div>
      </div>
    )
  }

  if (asset.kind === 'referenceImage' && visualAsset?.imageUrl) {
    return (
      <div className="image-stage">
        <img alt={visualAsset.name} src={visualAsset.imageUrl} />
      </div>
    )
  }

  if (asset.kind === 'unitManifest') {
    return (
      <div className="manifest-stage-wrap">
        <div className="manifest-overview-card">
          <strong>Manifest Overview</strong>
          <p>Contract metadata loaded successfully, but the companion atlas image is not in this folder yet.</p>
          <dl className="meta-grid">
            <div>
              <dt>Unit</dt>
              <dd>{asset.manifest?.unitId ?? asset.meta.unitId ?? 'unknown'}</dd>
            </div>
            <div>
              <dt>Frames</dt>
              <dd>{asset.manifest?.frames.length ?? 0}</dd>
            </div>
            <div>
              <dt>Expected Atlas</dt>
              <dd>{asset.meta.expectedAtlasPath ?? 'unit_<unit>_battle.webp'}</dd>
            </div>
            <div>
              <dt>Directions</dt>
              <dd>{asset.manifest?.directions.join(', ') ?? 'n/a'}</dd>
            </div>
          </dl>
          <button className="tool-button" type="button" onClick={onToggleManifestRaw}>
            {showManifestRaw ? 'Hide Raw Manifest' : 'Inspect Raw Manifest'}
          </button>
        </div>
        {showManifestRaw ? (
          <div className="manifest-stage">
            <pre>{asset.textContent}</pre>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="empty-stage">
      <p>This asset has no visual preview yet.</p>
    </div>
  )
}

function BottomDock({
  asset,
  visualAsset,
  referenceAsset,
  frames,
  preview,
  showManifestRaw,
  onToggleManifestRaw,
  onPreviewChange,
}: {
  asset: AssetRecord | null
  visualAsset: AssetRecord | null
  referenceAsset: AssetRecord | null
  frames: AtlasFrame[]
  preview: PreviewState
  showManifestRaw: boolean
  onToggleManifestRaw: () => void
  onPreviewChange: (value: PreviewState | ((current: PreviewState) => PreviewState)) => void
}) {
  if (!asset) {
    return <div className="dock-empty">No asset selected.</div>
  }

  if ((asset.kind === 'unitAtlas' || asset.kind === 'unitManifest') && visualAsset?.imageUrl) {
    return (
      <div className="dock-atlas">
        <div className="dock-toolbar">
          <div className="view-switcher">
            {([
              ['sheet', 'Sheet'],
              ['frame', 'Frame'],
              ['duel', 'Duel 2x'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                className={`filter-chip ${preview.viewMode === value ? 'is-active' : ''}`}
                type="button"
                onClick={() =>
                  onPreviewChange((current) => ({
                    ...current,
                    viewMode: value,
                  }))
                }
              >
                {label}
              </button>
            ))}
          </div>
          <label className="field compact">
            <span>Direction</span>
            <select
              value={preview.direction}
              onChange={(event) =>
                onPreviewChange((current) => ({
                  ...current,
                  direction: event.target.value as Direction,
                  frameCursor: 0,
                }))
              }
            >
              {GLENMOOR_DIRECTIONS.map((direction) => (
                <option key={direction} value={direction}>
                  {direction}
                </option>
              ))}
            </select>
          </label>
          <label className="field compact">
            <span>Animation</span>
            <select
              value={preview.animation}
              onChange={(event) =>
                onPreviewChange((current) => ({
                  ...current,
                  animation: event.target.value as AtlasAnimation,
                  frameCursor: 0,
                }))
              }
            >
              {GLENMOOR_ANIMATIONS.map((animation) => (
                <option key={animation} value={animation}>
                  {animation}
                </option>
              ))}
            </select>
          </label>
          <button
            className="tool-button"
            type="button"
            onClick={() => onPreviewChange((current) => ({ ...current, isPlaying: !current.isPlaying }))}
          >
            {preview.isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            className="tool-button"
            type="button"
            onClick={() => onPreviewChange((current) => ({ ...current, flipX: !current.flipX }))}
          >
            {preview.flipX ? 'Unflip' : 'Flip X'}
          </button>
        </div>

        <div className="filmstrip">
          {frames.map((frame, frameCursor) => (
            <button
              key={frame.frameId}
              className={`film-frame ${preview.frameCursor === frameCursor ? 'is-selected' : ''}`}
              type="button"
              onClick={() =>
                onPreviewChange((current) => ({
                  ...current,
                  frameCursor,
                }))
              }
            >
              <span
                className="film-frame-image"
                style={{
                  backgroundImage: `url(${visualAsset.imageUrl})`,
                  backgroundPosition: `${-frame.x}px ${-frame.y}px`,
                  backgroundSize: `${GLENMOOR_CONTRACT.atlas.width}px ${GLENMOOR_CONTRACT.atlas.height}px`,
                }}
              />
              <em>{frame.index}</em>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (asset.kind === 'unitManifest') {
    return (
      <div className="dock-empty">
        <div className="manifest-dock-card">
          <strong>Manifest ready, atlas missing.</strong>
          <p>Use this dock as a helper while you add a candidate atlas to the folder. The stage keeps the raw JSON optional so the missing visual does not dominate the first impression.</p>
          <button className="tool-button" type="button" onClick={onToggleManifestRaw}>
            {showManifestRaw ? 'Hide Raw Manifest' : 'Inspect Raw Manifest'}
          </button>
        </div>
      </div>
    )
  }

  if (asset.kind === 'portrait' && visualAsset?.imageUrl) {
    return (
      <div className="dock-portrait">
        <div className="portrait-mask-grid">
          <div className="mask-card">
            <strong>Circle Mask</strong>
            <div className="mask-preview circle">
              <img alt={visualAsset.name} src={visualAsset.imageUrl} />
            </div>
          </div>
          <div className="mask-card">
            <strong>Rounded Mask</strong>
            <div className="mask-preview rounded">
              <img alt={visualAsset.name} src={visualAsset.imageUrl} />
            </div>
          </div>
          {referenceAsset?.imageUrl ? (
            <div className="mask-card">
              <strong>Reference</strong>
              <div className="mask-preview rounded">
                <img alt={referenceAsset.name} src={referenceAsset.imageUrl} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  if ((asset.kind === 'terrainBlock' || asset.kind === 'terrainOverlay') && visualAsset?.imageUrl) {
    return (
      <div className="dock-terrain">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="dock-terrain-cell">
            <img alt={`${visualAsset.name} repeat ${index + 1}`} src={visualAsset.imageUrl} />
          </div>
        ))}
      </div>
    )
  }

  if (asset.kind === 'vfxSheet' && visualAsset?.imageUrl) {
    return (
      <div className="dock-vfx">
        <div className="vfx-mini is-dark">
          <img alt={visualAsset.name} src={visualAsset.imageUrl} />
        </div>
        <div className="vfx-mini is-light">
          <img alt={visualAsset.name} src={visualAsset.imageUrl} />
        </div>
        {referenceAsset?.imageUrl ? (
          <div className="vfx-mini is-reference">
            <img alt={referenceAsset.name} src={referenceAsset.imageUrl} />
          </div>
        ) : null}
      </div>
    )
  }

  return <div className="dock-empty">No specialized dock available for this asset type.</div>
}

function Launchpad({
  onOpenDemo,
  onOpenFolder,
}: {
  onOpenDemo: () => void
  onOpenFolder: () => void
}) {
  return (
    <section className="launchpad">
      <div className="launchpad-hero">
        <span className="launchpad-label">Demo-first workspace</span>
        <h1>Inspect generated and purchased game assets like a production tool.</h1>
        <p>Start with a bundled demo workspace that already includes a clean Rowan pass set and a warning-heavy purchased candidate set, then switch to real folders when you are ready.</p>
        <div className="launchpad-actions">
          <button className="tool-button primary" type="button" onClick={onOpenDemo}>
            Try Demo Workspace
          </button>
          <button className="tool-button" type="button" onClick={onOpenFolder}>
            Open Folder
          </button>
        </div>
      </div>

      <div className="launchpad-grid">
        <article className="launchpad-card">
          <strong>What you can inspect</strong>
          <p>Sprite sheets, portraits, terrain blocks, overlays, VFX sheets, reference images, animation flow, direction changes, and runtime-size readability.</p>
        </article>
        <article className="launchpad-card">
          <strong>How reviews persist</strong>
          <p>The demo stores review notes in browser local storage. Real folders keep the same review model in <code>.asset-workbench/workspace.json</code>.</p>
        </article>
        <article className="launchpad-card">
          <strong>Next improvements</strong>
          <p>Completeness matrix, recent workspace reopen, bulk compare boards, richer reference diffing, and filename suggestions for manifest-only folders.</p>
        </article>
      </div>
    </section>
  )
}

function highestSeverity(findings: AssetRecord['findings']): FindingSeverity {
  if (findings.some((finding) => finding.severity === 'fail')) {
    return 'fail'
  }
  if (findings.some((finding) => finding.severity === 'warn')) {
    return 'warn'
  }
  return 'pass'
}

function humanizeSaveState(state: SaveState): string {
  switch (state) {
    case 'saving':
      return 'Saving'
    case 'saved':
      return 'Saved'
    case 'error':
      return 'Save Error'
    default:
      return 'Ready'
  }
}

function resolveSelection(assets: AssetRecord[], preserveSelection?: string | null, preferredSelectionId?: string): string | null {
  if (preserveSelection && assets.some((asset) => asset.id === preserveSelection)) {
    return preserveSelection
  }
  if (preferredSelectionId && assets.some((asset) => asset.id === preferredSelectionId)) {
    return preferredSelectionId
  }
  return assets[0]?.id ?? null
}

function clampBottomPaneHeight(value: number, containerHeight: number): number {
  if (containerHeight <= 0) {
    return clamp(value, CENTER_DOCK_MIN_HEIGHT, 360)
  }

  const maximumDockHeight = Math.max(
    CENTER_DOCK_MIN_HEIGHT,
    containerHeight - CENTER_STAGE_MIN_HEIGHT - CENTER_SPLIT_HANDLE_SIZE,
  )

  return clamp(value, CENTER_DOCK_MIN_HEIGHT, maximumDockHeight)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default App
