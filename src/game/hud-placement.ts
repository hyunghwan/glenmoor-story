import type { HudAnchor, HudPlacement } from './types'

export interface HudResolvedRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface HudResolvedPlacement extends HudResolvedRect {
  placement: HudPlacement
}

export interface ResolveAnchoredPositionArgs {
  anchorX: number
  anchorY: number
  preferredPlacement: HudAnchor['preferredPlacement']
  width: number
  height: number
  gap: number
  avoidPoints: Array<{ x: number; y: number }>
  slideStep: number
  maxSlideSteps: number
  occupiedRects: HudResolvedRect[]
  viewportWidth: number
  viewportHeight: number
  safeInset?: number
}

export function parseAvoidPoints(raw: string | undefined): Array<{ x: number; y: number }> {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Array<{ clientX: number; clientY: number }>

    return parsed.flatMap((point) =>
      Number.isFinite(point.clientX) && Number.isFinite(point.clientY)
        ? [{ x: point.clientX, y: point.clientY }]
        : [],
    )
  } catch {
    return []
  }
}

export function resolveAnchoredPosition(args: ResolveAnchoredPositionArgs): HudResolvedPlacement {
  const {
    anchorX,
    anchorY,
    preferredPlacement,
    width,
    height,
    gap,
    avoidPoints,
    slideStep,
    maxSlideSteps,
    occupiedRects,
    viewportWidth,
    viewportHeight,
    safeInset = 16,
  } = args
  const overlapPadding = avoidPoints.length > 0 ? 10 : 0
  const occupiedPadding = occupiedRects.length > 0 ? 8 : 0

  const countPointOverlaps = (candidate: HudResolvedRect) =>
    avoidPoints.reduce((count, point) => {
      const overlapsX =
        point.x >= candidate.left - overlapPadding &&
        point.x <= candidate.right + overlapPadding
      const overlapsY =
        point.y >= candidate.top - overlapPadding &&
        point.y <= candidate.bottom + overlapPadding

      return overlapsX && overlapsY ? count + 1 : count
    }, 0)

  const countRectOverlaps = (candidate: HudResolvedRect) =>
    occupiedRects.reduce(
      (count, rect) => (rectanglesOverlap(candidate, rect, occupiedPadding) ? count + 1 : count),
      0,
    )

  const scoreCandidate = (candidate: {
    pointOverlapCount: number
    rectOverlapCount: number
    distance: number
    clamped: boolean
    placementRank: number
  }) =>
    candidate.rectOverlapCount * 1000000 +
    candidate.pointOverlapCount * 10000 +
    candidate.distance * 10 +
    (candidate.clamped ? 500 : 0) +
    candidate.placementRank

  const evaluateCandidate = (
    placement: HudPlacement,
    distance: number,
    placementRank: number,
    clamped: boolean,
  ) => {
    const raw = placeAnchoredRect({ anchorX, anchorY, width, height, placement, distance })
    const candidate = clamped
      ? clampAnchoredRect(raw, { safeInset, viewportWidth, viewportHeight })
      : raw
    const fitsViewport = rectFitsViewport(candidate, { safeInset, viewportWidth, viewportHeight })

    return {
      left: candidate.left,
      top: candidate.top,
      right: candidate.right,
      bottom: candidate.bottom,
      placement,
      distance,
      placementRank,
      clamped,
      fitsViewport,
      pointOverlapCount: countPointOverlaps(candidate),
      rectOverlapCount: countRectOverlaps(candidate),
    }
  }

  const placementOrder = getPlacementOrder(preferredPlacement)
  let bestCandidate = evaluateCandidate(preferredPlacement, gap, placementOrder.indexOf(preferredPlacement), true)

  const preferredBaseCandidate = evaluateCandidate(preferredPlacement, gap, 0, false)

  if (preferredBaseCandidate.pointOverlapCount > 0 && preferredBaseCandidate.rectOverlapCount === 0) {
    for (let slideIndex = 1; slideIndex <= maxSlideSteps; slideIndex += 1) {
      const candidate = evaluateCandidate(preferredPlacement, gap + slideIndex * slideStep, 0, false)

      if (candidate.fitsViewport && candidate.rectOverlapCount === 0 && candidate.pointOverlapCount === 0) {
        return {
          left: candidate.left,
          top: candidate.top,
          placement: candidate.placement,
          right: candidate.right,
          bottom: candidate.bottom,
        }
      }

      if (scoreCandidate(candidate) < scoreCandidate(bestCandidate)) {
        bestCandidate = candidate
      }
    }
  }

  for (const [placementRank, placement] of placementOrder.entries()) {
    const candidate = evaluateCandidate(placement, gap, placementRank, false)

    if (candidate.fitsViewport && candidate.rectOverlapCount === 0 && candidate.pointOverlapCount === 0) {
      return {
        left: candidate.left,
        top: candidate.top,
        placement,
        right: candidate.right,
        bottom: candidate.bottom,
      }
    }

    if (scoreCandidate(candidate) < scoreCandidate(bestCandidate)) {
      bestCandidate = candidate
    }
  }

  for (const [placementRank, placement] of placementOrder.entries()) {
    for (let slideIndex = 1; slideIndex <= maxSlideSteps; slideIndex += 1) {
      const candidate = evaluateCandidate(placement, gap + slideIndex * slideStep, placementRank, false)

      if (candidate.fitsViewport && candidate.rectOverlapCount === 0 && candidate.pointOverlapCount === 0) {
        return {
          left: candidate.left,
          top: candidate.top,
          placement,
          right: candidate.right,
          bottom: candidate.bottom,
        }
      }

      if (scoreCandidate(candidate) < scoreCandidate(bestCandidate)) {
        bestCandidate = candidate
      }
    }
  }

  for (const [placementRank, placement] of placementOrder.entries()) {
    const candidate = evaluateCandidate(placement, gap, placementRank, true)

    if (candidate.rectOverlapCount === 0 && candidate.pointOverlapCount === 0) {
      return {
        left: candidate.left,
        top: candidate.top,
        placement,
        right: candidate.right,
        bottom: candidate.bottom,
      }
    }

    if (scoreCandidate(candidate) < scoreCandidate(bestCandidate)) {
      bestCandidate = candidate
    }
  }

  for (const [placementRank, placement] of placementOrder.entries()) {
    for (let slideIndex = 1; slideIndex <= maxSlideSteps; slideIndex += 1) {
      const candidate = evaluateCandidate(placement, gap + slideIndex * slideStep, placementRank, true)

      if (candidate.rectOverlapCount === 0 && candidate.pointOverlapCount === 0) {
        return {
          left: candidate.left,
          top: candidate.top,
          placement,
          right: candidate.right,
          bottom: candidate.bottom,
        }
      }

      if (scoreCandidate(candidate) < scoreCandidate(bestCandidate)) {
        bestCandidate = candidate
      }
    }
  }

  return {
    left: bestCandidate.left,
    top: bestCandidate.top,
    placement: bestCandidate.placement,
    right: bestCandidate.right,
    bottom: bestCandidate.bottom,
  }
}

function getPlacementOrder(preferredPlacement: HudPlacement): HudPlacement[] {
  switch (preferredPlacement) {
    case 'above':
      return ['above', 'below', 'above-right', 'above-left', 'right', 'left', 'below-right', 'below-left']
    case 'above-right':
      return ['above-right', 'above-left', 'right', 'left', 'below-right', 'below-left', 'above', 'below']
    case 'right':
      return ['right', 'left', 'above-right', 'above-left', 'below-right', 'below-left', 'above', 'below']
    case 'below-right':
      return ['below-right', 'below-left', 'right', 'left', 'above-right', 'above-left', 'below', 'above']
    case 'below':
      return ['below', 'above', 'below-right', 'below-left', 'right', 'left', 'above-right', 'above-left']
    case 'below-left':
      return ['below-left', 'below-right', 'left', 'right', 'above-left', 'above-right', 'below', 'above']
    case 'left':
      return ['left', 'right', 'above-left', 'above-right', 'below-left', 'below-right', 'above', 'below']
    case 'above-left':
      return ['above-left', 'above-right', 'left', 'right', 'below-left', 'below-right', 'above', 'below']
  }
}

function placeAnchoredRect(args: {
  anchorX: number
  anchorY: number
  width: number
  height: number
  placement: HudPlacement
  distance: number
}): HudResolvedRect {
  const { anchorX, anchorY, width, height, placement, distance } = args

  switch (placement) {
    case 'above-right':
      return {
        left: anchorX + distance,
        top: anchorY - height - distance,
        right: anchorX + distance + width,
        bottom: anchorY - distance,
      }
    case 'above':
      return {
        left: anchorX - width / 2,
        top: anchorY - height - distance,
        right: anchorX + width / 2,
        bottom: anchorY - distance,
      }
    case 'right':
      return {
        left: anchorX + distance,
        top: anchorY - height / 2,
        right: anchorX + distance + width,
        bottom: anchorY + height / 2,
      }
    case 'below-right':
      return {
        left: anchorX + distance,
        top: anchorY + distance,
        right: anchorX + distance + width,
        bottom: anchorY + distance + height,
      }
    case 'below':
      return {
        left: anchorX - width / 2,
        top: anchorY + distance,
        right: anchorX + width / 2,
        bottom: anchorY + distance + height,
      }
    case 'below-left':
      return {
        left: anchorX - width - distance,
        top: anchorY + distance,
        right: anchorX - distance,
        bottom: anchorY + distance + height,
      }
    case 'left':
      return {
        left: anchorX - width - distance,
        top: anchorY - height / 2,
        right: anchorX - distance,
        bottom: anchorY + height / 2,
      }
    case 'above-left':
      return {
        left: anchorX - width - distance,
        top: anchorY - height - distance,
        right: anchorX - distance,
        bottom: anchorY - distance,
      }
  }
}

function clampAnchoredRect(
  rect: HudResolvedRect,
  args: { safeInset: number; viewportWidth: number; viewportHeight: number },
): HudResolvedRect {
  const width = rect.right - rect.left
  const height = rect.bottom - rect.top
  const left = Math.min(Math.max(rect.left, args.safeInset), args.viewportWidth - width - args.safeInset)
  const top = Math.min(Math.max(rect.top, args.safeInset), args.viewportHeight - height - args.safeInset)

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  }
}

function rectFitsViewport(
  rect: HudResolvedRect,
  args: { safeInset: number; viewportWidth: number; viewportHeight: number },
): boolean {
  return (
    rect.left >= args.safeInset &&
    rect.top >= args.safeInset &&
    rect.right <= args.viewportWidth - args.safeInset &&
    rect.bottom <= args.viewportHeight - args.safeInset
  )
}

function rectanglesOverlap(left: HudResolvedRect, right: HudResolvedRect, padding: number): boolean {
  return !(
    left.right + padding <= right.left ||
    left.left >= right.right + padding ||
    left.bottom + padding <= right.top ||
    left.top >= right.bottom + padding
  )
}
