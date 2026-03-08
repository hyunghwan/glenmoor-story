import Phaser from 'phaser'
import type { HudViewModel, Locale } from './types'

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

          <div class="hud-status-line hud-card">
            <span class="hud-status-tag">${view.statusLine.phaseLabel}</span>
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

          <div class="hud-locales">
            ${this.renderLocaleButton('en', view.locale)}
            ${this.renderLocaleButton('ko', view.locale)}
          </div>
        </div>

        ${this.renderFloatingCommandMenu(view)}
        ${this.renderTargetMarkers(view)}
        ${this.renderTargetDetail(view)}

        <div class="hud-bottom-shell">
          <div class="hud-bottom-band">
            ${view.activeUnitPanel ? this.renderActiveUnitPanel(view.activeUnitPanel) : ''}
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
                <div class="hud-modal-card">
                  <p class="hud-eyebrow">${view.modal.kind.toUpperCase()}</p>
                  <h2>${view.modal.title}</h2>
                  <p>${view.modal.body}</p>
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
            <div>
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

  private renderFloatingCommandMenu(view: HudViewModel): string {
    if (!view.floatingActionMenu) {
      return ''
    }

    return `
      <section
        class="hud-floating-menu is-${view.floatingActionMenu.anchor.placement}"
        style="${this.anchorStyle(view.floatingActionMenu.anchor.clientX, view.floatingActionMenu.anchor.clientY)}"
      >
        ${view.floatingActionMenu.buttons
          .map(
            (button) => `
              <button class="hud-command-button ${button.active ? 'is-active' : ''}" data-command="${button.id}" ${button.disabled ? 'disabled' : ''}>
                ${button.label}
              </button>
            `,
          )
          .join('')}
      </section>
    `
  }

  private renderTargetMarkers(view: HudViewModel): string {
    return view.targetMarkers
      .map(
        (marker) => `
          <div
            class="hud-target-marker is-${marker.amountKind} ${marker.emphasis ? 'is-emphasis' : ''}"
            style="${this.anchorStyle(marker.anchor.clientX, marker.anchor.clientY)}"
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
        class="hud-target-detail is-${view.targetDetail.anchor.placement}"
        style="${this.anchorStyle(view.targetDetail.anchor.clientX, view.targetDetail.anchor.clientY)}"
      >
        <span class="hud-label">${view.targetDetail.subtitle}</span>
        <h3>${view.targetDetail.title}</h3>
        <p>${view.targetDetail.amountLabel}</p>
        <p>${view.targetDetail.counterLabel}</p>
        <p>${view.targetDetail.effectLabel}</p>
      </section>
    `
  }

  private anchorStyle(clientX: number, clientY: number): string {
    return `left:${clientX}px;top:${clientY}px;`
  }
}
