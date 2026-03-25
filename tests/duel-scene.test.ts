import { describe, expect, it } from 'vitest'
import { resolveDuelLayout } from '../src/game/duel-layout'

describe('duel scene mobile layout', () => {
  it('keeps portrait mobile text and controls inside the safe area', () => {
    const layout = resolveDuelLayout({
      width: 390,
      height: 844,
      viewportProfile: {
        layoutMode: 'mobile-portrait',
        width: 390,
        height: 844,
        coarsePointer: true,
        orientation: 'portrait',
        safeArea: { top: 20, right: 0, bottom: 34, left: 0 },
      },
    })

    expect(layout.headerY).toBeGreaterThanOrEqual(20)
    expect(layout.controlsY).toBeLessThan(844 - 34 + 1)
    expect(layout.leftY).toBeLessThan(layout.rightY)
    expect(layout.detailWidth).toBeLessThanOrEqual(390)
  })

  it('keeps landscape mobile combatants separated while preserving readable detail width', () => {
    const layout = resolveDuelLayout({
      width: 844,
      height: 390,
      viewportProfile: {
        layoutMode: 'mobile-landscape',
        width: 844,
        height: 390,
        coarsePointer: true,
        orientation: 'landscape',
        safeArea: { top: 0, right: 20, bottom: 0, left: 20 },
      },
    })

    expect(layout.leftX).toBeLessThan(layout.rightX)
    expect(layout.detailWidth).toBeGreaterThan(600)
    expect(layout.controlsY).toBeLessThanOrEqual(390)
  })
})
