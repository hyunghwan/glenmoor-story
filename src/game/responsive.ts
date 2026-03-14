import { clampBattleZoom } from './battle-camera'
import { TILE_HEIGHT, TILE_WIDTH, resolveBoardOrigin } from './iso'
import type { AccessibilityPreferences, SafeAreaInsets, ViewportProfile } from './types'

export const ACCESSIBILITY_STORAGE_KEY = 'glenmoor:accessibility-preferences'
export const MOBILE_LAYOUT_BREAKPOINT = 960
const MOBILE_PORTRAIT_BATTLEFIELD_RATIO = 0.58
const MIN_MOBILE_BATTLEFIELD_HEIGHT = 340
const BASE_TILE_STEP_DISTANCE = Math.hypot(TILE_WIDTH / 2, TILE_HEIGHT / 2)

export function resolveViewportProfile(args: {
  width: number
  height: number
  coarsePointer: boolean
  safeArea: SafeAreaInsets
}): ViewportProfile {
  const { width, height, coarsePointer, safeArea } = args
  const orientation = width >= height ? 'landscape' : 'portrait'
  const mobile = coarsePointer || width < MOBILE_LAYOUT_BREAKPOINT

  return {
    layoutMode: mobile ? (orientation === 'portrait' ? 'mobile-portrait' : 'mobile-landscape') : 'desktop',
    width,
    height,
    coarsePointer,
    orientation,
    safeArea,
  }
}

export function resolveBattlefieldHeight(profile: ViewportProfile): number {
  if (profile.layoutMode !== 'mobile-portrait') {
    return profile.height
  }

  return Math.max(
    MIN_MOBILE_BATTLEFIELD_HEIGHT,
    Math.round((profile.height - profile.safeArea.top - profile.safeArea.bottom) * MOBILE_PORTRAIT_BATTLEFIELD_RATIO),
  )
}

export function loadAccessibilityPreferences(defaults: AccessibilityPreferences): AccessibilityPreferences {
  if (typeof window === 'undefined') {
    return defaults
  }

  try {
    const raw = window.localStorage.getItem(ACCESSIBILITY_STORAGE_KEY)

    if (!raw) {
      return defaults
    }

    const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>

    return {
      textScale:
        parsed.textScale === 115 || parsed.textScale === 130 || parsed.textScale === 100
          ? parsed.textScale
          : defaults.textScale,
      highContrast: typeof parsed.highContrast === 'boolean' ? parsed.highContrast : defaults.highContrast,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : defaults.reducedMotion,
    }
  } catch {
    return defaults
  }
}

export function saveAccessibilityPreferences(preferences: AccessibilityPreferences): void {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(ACCESSIBILITY_STORAGE_KEY, JSON.stringify(preferences))
}

export function resolveDefaultAccessibilityPreferences(): AccessibilityPreferences {
  const reducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const highContrast =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-contrast: more)').matches

  return {
    textScale: 100,
    highContrast,
    reducedMotion,
  }
}

export function resolveMinimumZoomForTileSpacing(minSpacing: number): number {
  return clampBattleZoom(minSpacing / BASE_TILE_STEP_DISTANCE)
}

export function resolveDefaultZoom(profile: ViewportProfile): number {
  if (profile.layoutMode === 'mobile-portrait') {
    return clampBattleZoom(Math.max(resolveMinimumZoomForTileSpacing(22), 1.1))
  }

  if (profile.layoutMode === 'mobile-landscape') {
    return clampBattleZoom(Math.max(resolveMinimumZoomForTileSpacing(18), 0.95))
  }

  return clampBattleZoom(1)
}

export function resolveDynamicBoardOrigin(args: {
  viewportWidth: number
  viewportHeight: number
  rotationQuarterTurns: number
  mapWidth: number
  mapHeight: number
  heights: number[][]
}): { x: number; y: number } {
  return resolveBoardOrigin({
    viewportWidth: args.viewportWidth,
    viewportHeight: args.viewportHeight,
    rotationQuarterTurns: args.rotationQuarterTurns,
    mapWidth: args.mapWidth,
    mapHeight: args.mapHeight,
    heights: args.heights,
  })
}
