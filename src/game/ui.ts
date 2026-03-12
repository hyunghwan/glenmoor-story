import Phaser from 'phaser'
import type { HudAnchor, HudPlacement, HudViewModel, Locale } from './types'

interface HudResolvedRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface HudResolvedPlacement extends HudResolvedRect {
  placement: HudPlacement
}

export class HudController {
  private readonly root: HTMLElement
  private readonly bus: Phaser.Events.EventEmitter
  private currentView?: HudViewModel
  private suppressNextClick = false

  private extractOrigin(event: Event): Element | undefined {
    return event.target instanceof Element
      ? event.target
      : event.composedPath().find((node): node is Element => node instanceof Element)
  }

  private emitActionFromEvent(event: Event): boolean {
    const origin = this.extractOrigin(event)
    const command = origin?.closest<HTMLButtonElement>('[data-command]')?.dataset.command

    if (command) {
      this.bus.emit('hud:command', command)
      return true
    }

    const locale = origin?.closest<HTMLButtonElement>('[data-locale]')?.dataset.locale as Locale | undefined

    if (locale) {
      this.bus.emit('hud:locale', locale)
      return true
    }

    return false
  }

  private readonly handleRootPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) {
      return
    }

    if (this.emitActionFromEvent(event)) {
      this.suppressNextClick = true
      event.preventDefault()
    }
  }

  private readonly handleRootClick = (event: MouseEvent) => {
    if (this.suppressNextClick) {
      this.suppressNextClick = false
      return
    }

    if (this.emitActionFromEvent(event)) {
      event.preventDefault()
    }
  }

  constructor(root: HTMLElement, bus: Phaser.Events.EventEmitter) {
    this.root = root
    this.bus = bus
    this.root.addEventListener('pointerdown', this.handleRootPointerDown)
    this.root.addEventListener('click', this.handleRootClick)
    this.bus.on('hud:update', (view: HudViewModel) => {
      this.currentView = view
      this.render()
    })
  }

  getCurrentView(): HudViewModel | undefined {
    return this.currentView
  }

  private syncAnchoredElements(): void {
    const elements = Array.from(this.root.querySelectorAll<HTMLElement>('[data-anchor-x][data-anchor-y]')).sort(
      (left, right) => this.getAnchoredPriority(left) - this.getAnchoredPriority(right),
    )
    const occupiedRects: HudResolvedRect[] = []

    for (const element of elements) {
      const anchorX = Number(element.dataset.anchorX)
      const anchorY = Number(element.dataset.anchorY)
      const preferredPlacement = (element.dataset.preferredPlacement ?? 'above-right') as HudAnchor['preferredPlacement']
      const gap = Number(element.dataset.anchorGap ?? '14')
      const avoidPoints = this.parseAvoidPoints(element.dataset.avoidPoints)
      const slideStep = Number(element.dataset.slideStep ?? '22')
      const maxSlideSteps = Number(element.dataset.slideSteps ?? '9')

      if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
        continue
      }

      const { width, height } = element.getBoundingClientRect()

      if (width <= 0 || height <= 0) {
        continue
      }

      const resolved = this.resolveAnchoredPosition({
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
      })

      element.style.left = `${Math.round(resolved.left)}px`
      element.style.top = `${Math.round(resolved.top)}px`
      element.dataset.placement = resolved.placement
      element.classList.add('is-positioned')

      if (this.shouldReserveAnchoredRect(element)) {
        occupiedRects.push({
          left: resolved.left,
          top: resolved.top,
          right: resolved.right,
          bottom: resolved.bottom,
        })
      }
    }
  }

  private getAnchoredPriority(element: HTMLElement): number {
    if (element.classList.contains('hud-action-menu')) {
      return 0
    }

    if (element.classList.contains('hud-target-detail')) {
      return 1
    }

    if (element.classList.contains('hud-target-marker')) {
      return 2
    }

    return 3
  }

  private shouldReserveAnchoredRect(element: HTMLElement): boolean {
    return element.classList.contains('hud-action-menu') || element.classList.contains('hud-target-detail')
  }

  private parseAvoidPoints(raw: string | undefined): Array<{ x: number; y: number }> {
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

  private resolveAnchoredPosition(args: {
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
  }): HudResolvedPlacement {
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
    } = args
    const safeInset = 16
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
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
        (count, rect) => (this.rectanglesOverlap(candidate, rect, occupiedPadding) ? count + 1 : count),
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
      const raw = this.placeAnchoredRect({ anchorX, anchorY, width, height, placement, distance })
      const candidate = clamped
        ? this.clampAnchoredRect(raw, { safeInset, viewportWidth, viewportHeight })
        : raw
      const fitsViewport = this.rectFitsViewport(candidate, { safeInset, viewportWidth, viewportHeight })

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
    const placementOrder = this.getPlacementOrder(preferredPlacement)
    let bestCandidate = evaluateCandidate(preferredPlacement, gap, placementOrder.indexOf(preferredPlacement), true)

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

  private getPlacementOrder(preferredPlacement: HudPlacement): HudPlacement[] {
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

  private placeAnchoredRect(args: {
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
        return { left: anchorX + distance, top: anchorY - height - distance, right: anchorX + distance + width, bottom: anchorY - distance }
      case 'above':
        return { left: anchorX - width / 2, top: anchorY - height - distance, right: anchorX + width / 2, bottom: anchorY - distance }
      case 'right':
        return { left: anchorX + distance, top: anchorY - height / 2, right: anchorX + distance + width, bottom: anchorY + height / 2 }
      case 'below-right':
        return { left: anchorX + distance, top: anchorY + distance, right: anchorX + distance + width, bottom: anchorY + distance + height }
      case 'below':
        return { left: anchorX - width / 2, top: anchorY + distance, right: anchorX + width / 2, bottom: anchorY + distance + height }
      case 'below-left':
        return { left: anchorX - width - distance, top: anchorY + distance, right: anchorX - distance, bottom: anchorY + distance + height }
      case 'left':
        return { left: anchorX - width - distance, top: anchorY - height / 2, right: anchorX - distance, bottom: anchorY + height / 2 }
      case 'above-left':
        return { left: anchorX - width - distance, top: anchorY - height - distance, right: anchorX - distance, bottom: anchorY - distance }
    }
  }

  private clampAnchoredRect(
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

  private rectFitsViewport(
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

  private rectanglesOverlap(left: HudResolvedRect, right: HudResolvedRect, padding: number): boolean {
    return !(
      left.right + padding <= right.left ||
      left.left >= right.right + padding ||
      left.bottom + padding <= right.top ||
      left.top >= right.bottom + padding
    )
  }

  private render(): void {
    const view = this.currentView

    if (!view) {
      return
    }

    const statusItems = [
      view.statusLine.objectiveLabel,
      view.statusLine.modeLabel,
      view.statusLine.logLabel,
    ].filter((item, index, items) => item && items.indexOf(item) === index)

    this.root.innerHTML = `
      <div class="hud-overlay ${view.mode === 'busy' ? 'is-busy' : ''}">
        <div class="hud-topbar">
          <section class="hud-view-cluster hud-card" aria-label="${view.viewControls.label}">
            <div class="hud-view-actions">
              ${view.viewControls.buttons
                .map(
                  (button) => `
                    <button
                      class="hud-icon-button ${button.active ? 'is-active' : ''}"
                      data-command="${button.id}"
                      title="${button.label}"
                      aria-label="${button.label}"
                      ${button.disabled ? 'disabled' : ''}
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">${button.icon}</span>
                    </button>
                  `,
                )
                .join('')}
            </div>
          </section>

          <div class="hud-status-stack">
            <div class="hud-status-line hud-card">
              <div class="hud-status-tags">
                <span class="hud-status-tag">${view.statusLine.phaseLabel}</span>
                ${
                  view.statusLine.objectivePhaseLabel
                    ? `<span class="hud-status-tag is-objective-phase">${view.statusLine.objectivePhaseLabel}</span>`
                    : ''
                }
              </div>
              <div class="hud-status-columns is-inline">
                ${statusItems
                  .map(
                    (item) => `
                      <p><span>${item}</span></p>
                    `,
                  )
                  .join('')}
              </div>
            </div>

            ${
              view.phaseAnnouncement
                ? `
                  <div class="hud-phase-announcement hud-card ${view.phaseAnnouncement.cueId ? `is-cue-${view.phaseAnnouncement.cueId}` : ''}">
                    <p class="hud-eyebrow">${view.phaseAnnouncement.label}</p>
                    <strong>${view.phaseAnnouncement.body}</strong>
                  </div>
                `
                : ''
            }
          </div>

          <div class="hud-locales">
            ${this.renderLocaleButton('en', view.locale)}
            ${this.renderLocaleButton('ko', view.locale)}
          </div>
        </div>

        ${this.renderActionMenu(view)}
        ${this.renderTargetDetail(view)}
        ${this.renderTargetMarkers(view)}

        <div class="hud-bottom-shell">
          <div class="hud-bottom-band">
            <div class="hud-left-stack">
              ${view.activeUnitPanel ? this.renderActiveUnitPanel(view.activeUnitPanel) : ''}
            </div>
            <section class="hud-initiative-rail hud-card">
              <div class="hud-initiative-head">
                <span class="hud-label">${view.initiativeRail.label}</span>
                <span class="hud-initiative-now">${view.initiativeRail.currentTurnLabel}</span>
              </div>
              <div class="hud-initiative-strip">
                ${view.initiativeRail.entries
                  .map(
                    (entry) => `
                      <div class="hud-initiative-chip is-${entry.team} is-${entry.emphasis}">
                        <span class="hud-initiative-order">${entry.orderLabel}</span>
                        <span class="hud-initiative-token">${entry.initials}</span>
                        <div class="hud-initiative-meta">
                          <strong>${entry.name}</strong>
                          <span>${entry.className}</span>
                        </div>
                      </div>
                    `,
                  )
                  .join('')}
              </div>
            </section>
          </div>
        </div>

        ${
          view.modal
            ? `
              <div class="hud-modal">
                <div class="hud-modal-card is-${view.modal.kind}">
                  <p class="hud-eyebrow">${view.modal.eyebrow}</p>
                  <h2>${view.modal.title}</h2>
                  <p>${view.modal.body}</p>
                  <div class="hud-modal-objective">
                    ${view.modal.phaseLabel ? `<strong>${view.modal.phaseLabel}</strong>` : ''}
                    <span class="hud-label">${view.modal.objectiveHeading}</span>
                    <p>${view.modal.objectiveLabel}</p>
                  </div>
                  <button class="hud-button is-cta" data-command="${
                    view.modal.kind === 'briefing' ? 'start-battle' : 'restart-battle'
                  }">${view.modal.buttonLabel}</button>
                </div>
              </div>
            `
            : ''
        }
      </div>
    `

    this.syncAnchoredElements()
  }

  private renderLocaleButton(locale: Locale, activeLocale: Locale): string {
    return `
      <button class="hud-locale ${locale === activeLocale ? 'is-active' : ''}" data-locale="${locale}">
        ${locale.toUpperCase()}
      </button>
    `
  }

  private renderActiveUnitPanel(unit: NonNullable<HudViewModel['activeUnitPanel']>): string {
    const hpPercent = Math.max(0, Math.min(100, Math.round(unit.hpRatio * 100)))
    const labels =
      this.currentView?.locale === 'ko'
        ? { move: '이동', action: '행동', tile: '타일', facing: '방향' }
        : { move: 'Move', action: 'Action', tile: 'Tile', facing: 'Facing' }

    return `
      <section class="hud-active-card hud-card is-${unit.team}">
        <div class="hud-active-crest">
          <span>${unit.initials}</span>
        </div>
        <div class="hud-active-body">
          <div class="hud-active-head">
            <div class="hud-active-title">
              <span class="hud-label">${unit.turnStateLabel}</span>
              <h2>${unit.name}</h2>
            </div>
            <div class="hud-active-role">
              <strong>${unit.className}</strong>
              <span>${unit.teamLabel}</span>
            </div>
          </div>
          <div class="hud-hp-row">
            <span>HP ${unit.hp}/${unit.maxHp}</span>
            <strong>${hpPercent}%</strong>
          </div>
          <div class="hud-hp-bar">
            <span style="width:${hpPercent}%"></span>
          </div>
          <div class="hud-active-metrics">
            <div>
              <span class="hud-label">${labels.move}</span>
              <strong>${unit.moveStateLabel}</strong>
            </div>
            <div>
              <span class="hud-label">${labels.action}</span>
              <strong>${unit.actionStateLabel}</strong>
            </div>
            <div>
              <span class="hud-label">${labels.tile}</span>
              <strong>${unit.positionLabel}</strong>
            </div>
            <div>
              <span class="hud-label">${labels.facing}</span>
              <strong>${unit.facing.toUpperCase()}</strong>
            </div>
          </div>
          <div class="hud-statuses">
            ${unit.statuses.map((status) => this.renderStatusChip(status.label, status.stacks, status.tone)).join('')}
          </div>
        </div>
      </section>
    `
  }

  private renderActionMenu(view: HudViewModel): string {
    if (!view.actionMenu) {
      return ''
    }

    const avoidPoints = encodeURIComponent(JSON.stringify(view.actionMenu.avoidClientPoints))

    return `
      <section
        class="hud-action-menu hud-card hud-anchored"
        aria-label="${view.actionMenu.label}"
        ${this.anchorAttributes(view.actionMenu.anchor, 16)}
        data-avoid-points="${avoidPoints}"
        data-slide-step="20"
        data-slide-steps="10"
      >
        <div class="hud-action-buttons is-floating">
          ${view.actionMenu.buttons
            .map(
              (button, index, buttons) => `
                <button
                  class="hud-command-button ${button.active ? 'is-active' : ''} ${buttons.length % 2 === 1 && index === buttons.length - 1 ? 'is-wide' : ''}"
                  data-command="${button.id}"
                  ${button.disabled ? 'disabled' : ''}
                >
                  ${button.label}
                </button>
              `,
            )
            .join('')}
        </div>
      </section>
    `
  }

  private renderStatusChip(
    label: string,
    stacks: number | undefined,
    tone: 'neutral' | 'accent' | 'ally' | 'enemy',
  ): string {
    return `
      <span class="hud-status-chip is-${tone}">
        ${label}${stacks ? ` x${stacks}` : ''}
      </span>
    `
  }

  private renderTargetMarkers(view: HudViewModel): string {
    return view.targetMarkers
      .map(
        (marker) => `
          <div
            class="hud-target-marker hud-anchored is-${marker.amountKind} is-tone-${marker.markerTone} ${marker.emphasis ? 'is-emphasis' : ''}"
            ${this.anchorAttributes(marker.anchor, 10)}
          >
            ${marker.amountLabel}
          </div>
        `,
      )
      .join('')
  }

  private renderTargetDetail(view: HudViewModel): string {
    if (!view.targetDetail) {
      return ''
    }

    return `
      <section
        class="hud-target-detail hud-anchored"
        ${this.anchorAttributes(view.targetDetail.anchor, 14)}
      >
        <span class="hud-label">${view.targetDetail.subtitle}</span>
        <h3>${view.targetDetail.title}</h3>
        <p>${view.targetDetail.amountLabel}</p>
        <p>${view.targetDetail.counterLabel}</p>
        <p>${view.targetDetail.effectLabel}</p>
        <div class="hud-target-verdict">
          ${view.targetDetail.verdictChips
            .map((chip) => this.renderStatusChip(chip.label, chip.stacks, chip.tone))
            .join('')}
        </div>
      </section>
    `
  }

  private anchorAttributes(anchor: HudAnchor, gap: number): string {
    return `data-anchor-x="${Math.round(anchor.clientX)}" data-anchor-y="${Math.round(anchor.clientY)}" data-preferred-placement="${anchor.preferredPlacement}" data-anchor-gap="${gap}"`
  }
}
