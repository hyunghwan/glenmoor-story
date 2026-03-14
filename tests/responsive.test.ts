import { describe, expect, it } from 'vitest'
import {
  resolveBattlefieldHeight,
  resolveDefaultZoom,
  resolveDynamicBoardOrigin,
  resolveMinimumZoomForTileSpacing,
  resolveViewportProfile,
} from '../src/game/responsive'

describe('responsive battle presentation', () => {
  it('classifies desktop and mobile layouts from viewport and pointer shape', () => {
    expect(
      resolveViewportProfile({
        width: 1440,
        height: 900,
        coarsePointer: false,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      }).layoutMode,
    ).toBe('desktop')

    expect(
      resolveViewportProfile({
        width: 390,
        height: 844,
        coarsePointer: true,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      }).layoutMode,
    ).toBe('mobile-portrait')

    expect(
      resolveViewportProfile({
        width: 844,
        height: 390,
        coarsePointer: true,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      }).layoutMode,
    ).toBe('mobile-landscape')
  })

  it('reserves at least 55 percent of the viewport height for portrait battlefield play', () => {
    const profile = resolveViewportProfile({
      width: 390,
      height: 844,
      coarsePointer: true,
      safeArea: { top: 12, right: 0, bottom: 24, left: 0 },
    })
    const height = resolveBattlefieldHeight(profile)

    expect(height).toBeGreaterThanOrEqual(Math.floor((844 - 12 - 24) * 0.55))
  })

  it('keeps default mobile zoom above the target tile-spacing floor', () => {
    expect(resolveMinimumZoomForTileSpacing(22)).toBeGreaterThanOrEqual(0.75)
    expect(
      resolveDefaultZoom(
        resolveViewportProfile({
          width: 390,
          height: 844,
          coarsePointer: true,
          safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        }),
      ),
    ).toBeGreaterThanOrEqual(resolveMinimumZoomForTileSpacing(22))
  })

  it('centers the projected board inside a resized battlefield viewport', () => {
    const origin = resolveDynamicBoardOrigin({
      viewportWidth: 390,
      viewportHeight: 420,
      rotationQuarterTurns: 0,
      mapWidth: 2,
      mapHeight: 2,
      heights: [
        [0, 0],
        [0, 0],
      ],
    })

    expect(origin.x).toBeGreaterThan(0)
    expect(origin.y).toBeGreaterThan(0)
  })
})
