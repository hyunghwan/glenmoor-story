import { describe, expect, it } from 'vitest'
import { parseAvoidPoints, resolveAnchoredPosition } from '../src/game/hud-placement'

describe('hud placement helpers', () => {
  it('parses encoded avoid points and drops invalid entries', () => {
    const encoded = encodeURIComponent(
      JSON.stringify([
        { clientX: 120, clientY: 240 },
        { clientX: 'bad', clientY: 0 },
      ]),
    )

    expect(parseAvoidPoints(encoded)).toEqual([{ x: 120, y: 240 }])
    expect(parseAvoidPoints(undefined)).toEqual([])
  })

  it('slides an anchored popup away from avoid points when needed', () => {
    const placement = resolveAnchoredPosition({
      anchorX: 200,
      anchorY: 200,
      preferredPlacement: 'above-right',
      width: 140,
      height: 80,
      gap: 14,
      avoidPoints: [{ x: 230, y: 150 }],
      slideStep: 20,
      maxSlideSteps: 6,
      occupiedRects: [],
      viewportWidth: 1200,
      viewportHeight: 800,
    })

    expect(placement.placement).toBe('above-right')
    expect(placement.top).toBeLessThan(200)
    expect(placement.left).toBeGreaterThan(214)
  })

  it('avoids occupied rectangles before reusing the preferred slot', () => {
    const placement = resolveAnchoredPosition({
      anchorX: 300,
      anchorY: 240,
      preferredPlacement: 'above-right',
      width: 120,
      height: 60,
      gap: 14,
      avoidPoints: [],
      slideStep: 20,
      maxSlideSteps: 4,
      occupiedRects: [{ left: 314, top: 166, right: 434, bottom: 226 }],
      viewportWidth: 1200,
      viewportHeight: 800,
    })

    expect(placement.placement).not.toBe('above-right')
  })
})
