import defaultMapData from './data/glenmoor-pass.map.json'
import { aiProfiles, battleDefinition, classDefinitions } from './content'
import {
  LEVEL_BUNDLE_PREVIEW_MESSAGE,
  compileLevelBundle,
  loadLevelBundle,
  validateLevelBundleContent,
  type LevelBundleV1,
} from './level-bundle'
import type { BattleDefinition, Locale, TiledMapData } from './types'

export interface BattleSession {
  id: string
  source: 'default' | 'bundle' | 'preview'
  mapData: TiledMapData
  battleDefinition: BattleDefinition
  localeOverlay?: Partial<Record<Locale, Record<string, string>>>
  bundle?: LevelBundleV1
}

interface PreviewBundleMessage {
  type: typeof LEVEL_BUNDLE_PREVIEW_MESSAGE
  bundle: unknown
}

export function createDefaultBattleSession(): BattleSession {
  return {
    id: battleDefinition.id,
    source: 'default',
    mapData: structuredClone(defaultMapData) as TiledMapData,
    battleDefinition: structuredClone(battleDefinition),
  }
}

export function createBattleSessionFromLevelBundle(bundleSource: unknown, sourceName: string): BattleSession {
  const bundle = loadLevelBundle(bundleSource, sourceName)
  validateLevelBundleContent(bundle, {
    classIds: Object.keys(classDefinitions),
    aiProfileIds: Object.keys(aiProfiles),
  })
  const compiled = compileLevelBundle(bundle)

  return {
    id: compiled.battleDefinition.id,
    source: sourceName === 'preview-message' ? 'preview' : 'bundle',
    mapData: compiled.mapData,
    battleDefinition: compiled.battleDefinition,
    localeOverlay: compiled.localeOverlay,
    bundle,
  }
}

async function fetchLevelBundleBySlug(slug: string): Promise<BattleSession> {
  const response = await fetch(`/data/levels/${encodeURIComponent(slug)}.level.json`)

  if (!response.ok) {
    throw new Error(`Unable to load level bundle "${slug}" (${response.status})`)
  }

  return createBattleSessionFromLevelBundle(await response.json(), `${slug}.level.json`)
}

function waitForPreviewLevelBundle(): Promise<BattleSession> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('Preview bundle messages require a browser environment'))
      return
    }

    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', handleMessage)
      reject(new Error('Timed out waiting for preview level bundle'))
    }, 10_000)

    function handleMessage(event: MessageEvent<PreviewBundleMessage>): void {
      if (event.data?.type !== LEVEL_BUNDLE_PREVIEW_MESSAGE) {
        return
      }

      window.clearTimeout(timeout)
      window.removeEventListener('message', handleMessage)

      try {
        resolve(createBattleSessionFromLevelBundle(event.data.bundle, 'preview-message'))
      } catch (error) {
        reject(error)
      }
    }

    window.addEventListener('message', handleMessage)
  })
}

export async function resolveBattleSessionFromLocation(search = window.location.search): Promise<BattleSession> {
  const params = new URLSearchParams(search)
  const preview = params.get('preview')
  const level = params.get('level')

  if (preview === '1') {
    return waitForPreviewLevelBundle()
  }

  if (level) {
    return fetchLevelBundleBySlug(level)
  }

  return createDefaultBattleSession()
}
