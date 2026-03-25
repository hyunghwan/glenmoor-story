import Phaser from 'phaser'
import {
  parseAvoidPoints,
  resolveAnchoredPosition,
  type HudResolvedRect,
} from './hud-placement'
import type { HudAnchor, HudViewModel, Locale } from './types'
import { renderUnitIconSvg } from './unit-visuals'

export class HudController {
  private readonly root: HTMLElement
  private readonly bus: Phaser.Events.EventEmitter
  private currentView?: HudViewModel
  private suppressNextClick = false
  private mobileObjectiveExpanded = false
  private mobileOverflowOpen = false
  private accessibilityPanelOpen = false
  private accessibilitySettingsOpen = false

  private extractOrigin(event: Event): Element | undefined {
    return event.target instanceof Element
      ? event.target
      : event.composedPath().find((node): node is Element => node instanceof Element)
  }

  private emitActionFromEvent(event: Event): boolean {
    const origin = this.extractOrigin(event)
    const uiToggle = origin?.closest<HTMLButtonElement>('[data-ui-toggle]')?.dataset.uiToggle

    if (uiToggle) {
      if (uiToggle === 'mobile-objective') {
        this.mobileObjectiveExpanded = !this.mobileObjectiveExpanded
        if (this.mobileObjectiveExpanded) {
          this.mobileOverflowOpen = false
        }
      } else if (uiToggle === 'mobile-overflow') {
        this.mobileOverflowOpen = !this.mobileOverflowOpen
        if (this.mobileOverflowOpen) {
          this.mobileObjectiveExpanded = false
        }
      } else if (uiToggle === 'accessible-panel') {
        this.mobileObjectiveExpanded = false
        this.mobileOverflowOpen = false
        this.accessibilityPanelOpen = !this.accessibilityPanelOpen
      } else if (uiToggle === 'accessible-settings') {
        this.mobileObjectiveExpanded = false
        this.mobileOverflowOpen = false
        this.accessibilitySettingsOpen = !this.accessibilitySettingsOpen
      }

      this.render()
      return true
    }

    const command = origin?.closest<HTMLButtonElement>('[data-command]')?.dataset.command

    if (command) {
      this.mobileObjectiveExpanded = false
      this.mobileOverflowOpen = false
      this.bus.emit('hud:command', command)
      return true
    }

    const locale = origin?.closest<HTMLButtonElement>('[data-locale]')?.dataset.locale as Locale | undefined

    if (locale) {
      this.mobileObjectiveExpanded = false
      this.mobileOverflowOpen = false
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
      if (view.layoutMode === 'desktop') {
        this.mobileObjectiveExpanded = false
        this.mobileOverflowOpen = false
      } else if (
        view.mobilePresentation?.panelState === 'collapsed' ||
        view.mobilePresentation?.actionDockVisible ||
        view.modal
      ) {
        this.mobileObjectiveExpanded = false
        this.mobileOverflowOpen = false
      }
      this.render()
    })
  }

  getCurrentView(): HudViewModel | undefined {
    if (!this.currentView || !this.currentView.mobilePresentation) {
      return this.currentView
    }

    return {
      ...this.currentView,
      mobilePresentation: {
        ...this.currentView.mobilePresentation,
        panelState: this.mobileObjectiveExpanded ? 'expanded' : 'collapsed',
        overflowOpen: this.mobileOverflowOpen,
        objectiveExpanded: this.mobileObjectiveExpanded,
      },
    }
  }

  getUiState(): {
    mobileObjectiveExpanded: boolean
    mobileOverflowOpen: boolean
    accessibilityPanelOpen: boolean
    accessibilitySettingsOpen: boolean
  } {
    return {
      mobileObjectiveExpanded: this.mobileObjectiveExpanded,
      mobileOverflowOpen: this.mobileOverflowOpen,
      accessibilityPanelOpen: this.accessibilityPanelOpen,
      accessibilitySettingsOpen: this.accessibilitySettingsOpen,
    }
  }

  private getPrimaryMobileViewButtons(
    view: HudViewModel,
  ): Array<HudViewModel['viewControls']['buttons'][number]> {
    const primaryIds = new Set(['view-rotate-left', 'view-rotate-right', 'view-recenter'])

    return view.viewControls.buttons.filter((button) => primaryIds.has(button.id))
  }

  private getOverflowMobileViewButtons(
    view: HudViewModel,
  ): Array<HudViewModel['viewControls']['buttons'][number]> {
    const primaryIds = new Set(['view-rotate-left', 'view-rotate-right', 'view-recenter'])

    return view.viewControls.buttons.filter((button) => !primaryIds.has(button.id))
  }

  private renderViewActionButtons(
    buttons: Array<HudViewModel['viewControls']['buttons'][number]>,
  ): string {
    return buttons
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
      .join('')
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
      const avoidPoints = parseAvoidPoints(element.dataset.avoidPoints)
      const slideStep = Number(element.dataset.slideStep ?? '22')
      const maxSlideSteps = Number(element.dataset.slideSteps ?? '9')

      if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) {
        continue
      }

      const { width, height } = element.getBoundingClientRect()

      if (width <= 0 || height <= 0) {
        continue
      }

      const resolved = resolveAnchoredPosition({
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
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
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

  private render(): void {
    const view = this.currentView

    if (!view) {
      return
    }

    const isMobile = view.layoutMode !== 'desktop'
    const visibleViewButtons = isMobile ? this.getPrimaryMobileViewButtons(view) : view.viewControls.buttons

    this.root.innerHTML = `
      <div class="hud-overlay ${view.mode === 'busy' ? 'is-busy' : ''} is-${view.layoutMode}">
        <div class="hud-live-region" aria-live="polite" aria-atomic="true">${view.accessiblePanel.liveMessage}</div>
        <div class="hud-topbar">
          <section class="hud-view-cluster" aria-label="${view.viewControls.label}">
            <div class="hud-view-actions">
              ${this.renderViewActionButtons(visibleViewButtons)}
            </div>
          </section>

          ${
            isMobile
              ? `
                <div class="hud-mobile-tools">
                  <div class="hud-locales is-mobile">
                    ${this.renderLocaleButton('en', view.locale)}
                    ${this.renderLocaleButton('ko', view.locale)}
                  </div>
                  <button
                    class="hud-icon-button"
                    data-ui-toggle="accessible-panel"
                    aria-label="${this.getUiLabel(view.locale, 'assistive')}"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">keyboard_command_key</span>
                  </button>
                  <button
                    class="hud-icon-button ${this.mobileOverflowOpen ? 'is-active' : ''}"
                    data-ui-toggle="mobile-overflow"
                    aria-label="${this.getUiLabel(view.locale, 'more')}"
                    aria-expanded="${this.mobileOverflowOpen}"
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">more_horiz</span>
                  </button>
                </div>
              `
              : ''
          }

          ${isMobile ? this.renderMobileStatusStack(view) : this.renderDesktopStatusStack(view)}

          ${!isMobile ? `<div class="hud-locales">${this.renderLocaleButton('en', view.locale)}${this.renderLocaleButton('ko', view.locale)}</div>` : ''}
        </div>

        ${isMobile ? this.renderMobileOverflow(view) : ''}
        ${this.renderActionMenu(view)}
        ${this.renderTargetDetail(view)}
        ${this.renderTargetMarkers(view)}
        ${isMobile ? this.renderMobileShell(view) : this.renderDesktopShell(view)}
        ${this.renderAccessiblePanel(view)}
        ${this.renderAccessibilitySettings(view)}

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

  private renderDesktopShell(view: HudViewModel): string {
    return `
      <div class="hud-bottom-shell">
        <div class="hud-bottom-band">
          <div class="hud-left-stack">
            ${view.activeUnitPanel ? this.renderActiveUnitPanel(view.activeUnitPanel) : ''}
          </div>
          ${this.renderInitiativeRail(view)}
        </div>
      </div>
    `
  }

  private renderDesktopStatusStack(view: HudViewModel): string {
    const secondaryLines = [view.statusLine.modeLabel, view.statusLine.logLabel]
      .filter((item, index, items) => item && item !== view.statusLine.objectiveLabel && items.indexOf(item) === index)

    return `
      <div class="hud-status-stack">
        <div class="hud-status-line hud-card is-desktop">
          <div class="hud-status-desktop-top">
            <div class="hud-status-tags">
              <span class="hud-status-tag">${view.statusLine.phaseLabel}</span>
              ${
                view.statusLine.objectivePhaseLabel
                  ? `<span class="hud-status-tag is-objective-phase">${view.statusLine.objectivePhaseLabel}</span>`
                  : ''
              }
            </div>
          </div>
          <div class="hud-status-desktop-main">
            <p class="hud-status-desktop-objective">${view.statusLine.objectiveLabel}</p>
            ${
              secondaryLines.length > 0
                ? `
                  <div class="hud-status-desktop-feed">
                    ${secondaryLines
                      .map(
                        (item) => `
                          <p><span>${item}</span></p>
                        `,
                      )
                      .join('')}
                  </div>
                `
                : ''
            }
          </div>
        </div>
        ${this.renderPhaseAnnouncement(view)}
      </div>
    `
  }

  private renderMobileStatusStack(view: HudViewModel): string {
    return `
      <div class="hud-status-stack is-mobile">
        <div class="hud-status-line hud-card hud-mobile-status-line">
          <div class="hud-mobile-status-pills">
            <span class="hud-status-tag">${view.statusLine.phaseLabel}</span>
            ${
              view.statusLine.objectivePhaseLabel
                ? `<span class="hud-status-tag is-objective-phase">${view.statusLine.objectivePhaseLabel}</span>`
                : ''
            }
          </div>
          <button
            class="hud-icon-button hud-mobile-status-toggle ${this.mobileObjectiveExpanded ? 'is-active' : ''}"
            data-ui-toggle="mobile-objective"
            aria-label="${this.getUiLabel(view.locale, 'objective')}"
            aria-expanded="${this.mobileObjectiveExpanded}"
          >
            <span class="material-symbols-outlined" aria-hidden="true">${this.mobileObjectiveExpanded ? 'expand_less' : 'expand_more'}</span>
          </button>
        </div>
        ${
          this.mobileObjectiveExpanded
            ? `
              <div class="hud-mobile-objective hud-card">
                <span class="hud-label">${this.getUiLabel(view.locale, 'objective')}</span>
                <p>${view.statusLine.objectiveLabel}</p>
              </div>
            `
            : ''
        }
        ${this.renderPhaseAnnouncement(view)}
      </div>
    `
  }

  private renderPhaseAnnouncement(view: HudViewModel): string {
    if (!view.phaseAnnouncement) {
      return ''
    }

    return `
      <div class="hud-phase-announcement hud-card ${view.phaseAnnouncement.cueId ? `is-cue-${view.phaseAnnouncement.cueId}` : ''}">
        <p class="hud-eyebrow">${view.phaseAnnouncement.label}</p>
        <strong>${view.phaseAnnouncement.body}</strong>
      </div>
    `
  }

  private renderMobileShell(view: HudViewModel): string {
    if (view.modal) {
      return ''
    }

    const compactTwoRow = view.mobilePresentation?.commandDensity === 'compact-2row'

    return `
      <div class="hud-bottom-shell is-mobile ${view.mobilePresentation?.actionDockVisible ? 'has-action-dock' : ''} ${compactTwoRow ? 'is-compact-2row' : ''}">
        ${this.renderMobileTargetDetail(view)}
        ${this.renderMobileInitiativeTimeline(view)}
        ${view.actionMenu?.presentation === 'dock' ? this.renderDockActionMenu(view) : ''}
      </div>
    `
  }

  private renderInitiativeRail(view: HudViewModel): string {
    return `
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
                  <span class="hud-initiative-token">
                    <span class="hud-initiative-icon">
                      ${renderUnitIconSvg(entry.unitIconId, entry.combatRole, 18)}
                    </span>
                    <em>${entry.initials}</em>
                  </span>
                  <div class="hud-initiative-meta">
                    <strong>${entry.name}</strong>
                    <span>${entry.className} · ${entry.combatRoleLabel}</span>
                  </div>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
    `
  }

  private renderMobileInitiativeTimeline(view: HudViewModel): string {
    if (view.mobilePresentation?.initiativeMode === 'hidden') {
      return ''
    }

    const compactTwoRow = view.mobilePresentation?.commandDensity === 'compact-2row'

    return `
      <section class="hud-mobile-initiative hud-card ${compactTwoRow ? 'is-compact-2row' : ''}" aria-label="${view.initiativeRail.label}">
        <div class="hud-mobile-initiative-strip">
          ${view.initiativeRail.entries
            .map(
              (entry) => `
                <div
                  class="hud-mobile-initiative-chip is-${entry.team} is-${entry.emphasis}"
                  aria-label="${entry.orderLabel} ${entry.name}"
                  title="${entry.orderLabel} ${entry.name}"
                >
                  <span class="hud-mobile-initiative-order">${entry.orderLabel}</span>
                  <span class="hud-mobile-initiative-token">
                    <span class="hud-mobile-initiative-icon">
                      ${renderUnitIconSvg(entry.unitIconId, entry.combatRole, compactTwoRow ? 12 : 14)}
                    </span>
                    <em>${entry.initials}</em>
                  </span>
                </div>
              `,
            )
            .join('')}
        </div>
      </section>
    `
  }

  private renderMobileTargetDetail(view: HudViewModel): string {
    const targetDetail =
      view.mobilePresentation?.targetDetailMode === 'detail' && view.targetDetail?.presentation === 'sheet'
        ? view.targetDetail
        : undefined

    if (!targetDetail) {
      return ''
    }

    const summary = [targetDetail.amountLabel, targetDetail.counterLabel, targetDetail.effectLabel]
      .filter(Boolean)
      .join(' · ')

    return `
      <section class="hud-mobile-target-detail hud-card">
        <div class="hud-target-unit">
          <div class="hud-target-token">
            ${renderUnitIconSvg(targetDetail.unitIconId, targetDetail.combatRole, 18)}
          </div>
          <div class="hud-target-meta">
            <strong>${targetDetail.unitName}</strong>
            <span>${targetDetail.teamLabel} · ${targetDetail.className}</span>
          </div>
        </div>
        <span class="hud-label">${targetDetail.subtitle}</span>
        <p>${targetDetail.title}</p>
        <p>${summary}</p>
      </section>
    `
  }

  private renderMobileOverflow(view: HudViewModel): string {
    if (!this.mobileOverflowOpen || view.modal) {
      return ''
    }

    const overflowButtons = this.getOverflowMobileViewButtons(view)

    return `
      <section class="hud-mobile-overflow hud-card" aria-label="${this.getUiLabel(view.locale, 'more')}">
        <div class="hud-mobile-overflow-grid">
          ${overflowButtons
            .map(
              (button) => `
                <button
                  class="hud-mobile-overflow-button ${button.active ? 'is-active' : ''}"
                  data-command="${button.id}"
                  ${button.disabled ? 'disabled' : ''}
                >
                  <span class="material-symbols-outlined" aria-hidden="true">${button.icon}</span>
                  <span>${button.label}</span>
                </button>
              `,
            )
            .join('')}
          <button class="hud-mobile-overflow-button" data-ui-toggle="accessible-panel">
            <span class="material-symbols-outlined" aria-hidden="true">keyboard_command_key</span>
            <span>${this.getUiLabel(view.locale, 'assistive')}</span>
          </button>
          <button class="hud-mobile-overflow-button" data-ui-toggle="accessible-settings">
            <span class="material-symbols-outlined" aria-hidden="true">accessibility_new</span>
            <span>${this.getUiLabel(view.locale, 'settings')}</span>
          </button>
        </div>
      </section>
    `
  }

  private renderDockActionMenu(view: HudViewModel): string {
    const actionMenu = view.actionMenu

    if (!actionMenu) {
      return ''
    }

    const compactTwoRow = view.mobilePresentation?.commandDensity === 'compact-2row'

    return `
      <section class="hud-action-dock hud-card ${compactTwoRow ? 'is-compact-2row' : ''}" aria-label="${actionMenu.label}">
        <div class="hud-action-buttons is-dock ${compactTwoRow ? 'is-compact-2row' : ''}">
          ${actionMenu.buttons
            .map(
              (button) => `
                <button
                  class="hud-command-button ${button.active ? 'is-active' : ''}"
                  data-command="${button.id}"
                  aria-label="${button.label}"
                  title="${button.label}"
                  ${button.disabled ? 'disabled' : ''}
                >
                  ${compactTwoRow ? button.shortLabel ?? button.label : button.label}
                </button>
              `,
            )
            .join('')}
        </div>
      </section>
    `
  }

  private renderAccessiblePanel(view: HudViewModel): string {
    if (!this.accessibilityPanelOpen) {
      return ''
    }

    return `
      <section class="hud-access-panel hud-card" aria-label="${view.accessiblePanel.label}">
        <div class="hud-access-section">
          <span class="hud-label">${view.accessiblePanel.summaryHeading}</span>
          <p>${view.accessiblePanel.summary}</p>
        </div>
        <div class="hud-access-section">
          <span class="hud-label">${view.accessiblePanel.commandsHeading}</span>
          <div class="hud-access-grid">
            ${view.accessiblePanel.commandButtons
              .map(
                (button) => `
                  <button class="hud-button hud-access-button" data-command="${button.id}">
                    ${button.label}
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>
        <div class="hud-access-section">
          <span class="hud-label">${view.accessiblePanel.optionsHeading}</span>
          <div class="hud-access-list">
            ${
              view.accessiblePanel.options.length > 0
                ? view.accessiblePanel.options
                    .map(
                      (option) => `
                        <button class="hud-access-option" data-command="${option.command}">
                          <strong>${option.label}</strong>
                          ${option.detail ? `<span>${option.detail}</span>` : ''}
                        </button>
                      `,
                    )
                    .join('')
                : `<p class="hud-access-empty">${this.getUiLabel(view.locale, 'noOptions')}</p>`
            }
          </div>
        </div>
      </section>
    `
  }

  private renderAccessibilitySettings(view: HudViewModel): string {
    if (!this.accessibilitySettingsOpen) {
      return ''
    }

    return `
      <section class="hud-access-settings hud-card" aria-label="${this.getUiLabel(view.locale, 'settings')}">
        <div class="hud-access-section">
          <span class="hud-label">${this.getUiLabel(view.locale, 'textScale')}</span>
          <div class="hud-access-grid">
            ${[100, 115, 130]
              .map(
                (scale) => `
                  <button
                    class="hud-button ${view.accessibilityState.textScale === scale ? 'is-active' : ''}"
                    data-command="accessibility:text-scale:${scale}"
                  >
                    ${scale}%
                  </button>
                `,
              )
              .join('')}
          </div>
        </div>
        <div class="hud-access-section">
          <div class="hud-access-grid">
            <button class="hud-button" data-command="accessibility:toggle-high-contrast">
              ${this.getUiLabel(view.locale, 'highContrast')}: ${view.accessibilityState.highContrast ? this.getUiLabel(view.locale, 'on') : this.getUiLabel(view.locale, 'off')}
            </button>
            <button class="hud-button" data-command="accessibility:toggle-reduced-motion">
              ${this.getUiLabel(view.locale, 'reducedMotion')}: ${view.accessibilityState.reducedMotion ? this.getUiLabel(view.locale, 'on') : this.getUiLabel(view.locale, 'off')}
            </button>
          </div>
        </div>
      </section>
    `
  }

  private getUiLabel(locale: Locale, key: 'assistive' | 'details' | 'settings' | 'objective' | 'textScale' | 'highContrast' | 'reducedMotion' | 'on' | 'off' | 'noOptions' | 'more'): string {
    const labels = {
      en: {
        assistive: 'Assistive Controls',
        details: 'Battle Details',
        settings: 'Accessibility',
        objective: 'Objective',
        more: 'More Controls',
        textScale: 'Text Scale',
        highContrast: 'High Contrast',
        reducedMotion: 'Reduced Motion',
        on: 'On',
        off: 'Off',
        noOptions: 'No options available.',
      },
      ko: {
        assistive: '보조기기 조작',
        details: '전투 상세',
        settings: '접근성',
        objective: '목표',
        more: '추가 조작',
        textScale: '글자 크기',
        highContrast: '고대비',
        reducedMotion: '모션 축소',
        on: '켜짐',
        off: '꺼짐',
        noOptions: '현재 사용할 수 있는 항목이 없습니다.',
      },
    }

    return labels[locale][key]
  }

  private renderLocaleButton(locale: Locale, activeLocale: Locale): string {
    return `
      <button class="hud-locale ${locale === activeLocale ? 'is-active' : ''}" data-locale="${locale}" aria-label="${locale === 'en' ? 'English' : 'Korean'}">
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
          ${renderUnitIconSvg(unit.unitIconId, unit.combatRole, 28)}
          <span class="hud-active-initials">${unit.initials}</span>
        </div>
        <div class="hud-active-body">
          <div class="hud-active-head">
            <div class="hud-active-title">
              <span class="hud-label">${unit.turnStateLabel}</span>
              <h2>${unit.name}</h2>
            </div>
            <div class="hud-active-role">
              <div class="hud-role-line">
                <strong>${unit.className}</strong>
                ${this.renderRoleBadge(unit.combatRoleLabel, unit.combatRole)}
              </div>
              <span>${unit.teamLabel}</span>
              <small>${unit.roleFlavorLabel}</small>
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
    if (!view.actionMenu || view.actionMenu.presentation !== 'anchored' || !view.actionMenu.anchor) {
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

  private renderRoleBadge(
    label: string,
    role: NonNullable<HudViewModel['activeUnitPanel']>['combatRole'],
  ): string {
    return `<span class="hud-role-badge is-${role}">${label}</span>`
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
    if (!view.targetDetail || view.targetDetail.presentation !== 'anchored' || !view.targetDetail.anchor) {
      return ''
    }

    return `
      <section
        class="hud-target-detail hud-anchored"
        ${this.anchorAttributes(view.targetDetail.anchor, 14)}
      >
        ${this.renderTargetDetailCard(view.targetDetail)}
      </section>
    `
  }

  private renderTargetDetailCard(targetDetail: NonNullable<HudViewModel['targetDetail']>): string {
    return `
      <div class="hud-target-detail-card">
        <div class="hud-target-unit">
          <div class="hud-target-token">
            ${renderUnitIconSvg(targetDetail.unitIconId, targetDetail.combatRole, 18)}
          </div>
          <div class="hud-target-meta">
            <strong>${targetDetail.unitName}</strong>
            <span>${targetDetail.teamLabel} · ${targetDetail.className} · ${targetDetail.combatRoleLabel}</span>
          </div>
        </div>
        <span class="hud-label">${targetDetail.subtitle}</span>
        <h3>${targetDetail.title}</h3>
        <p>${targetDetail.amountLabel}</p>
        <p>${targetDetail.counterLabel}</p>
        <p>${targetDetail.effectLabel}</p>
        <div class="hud-target-verdict">
          ${targetDetail.verdictChips
            .map((chip) => this.renderStatusChip(chip.label, chip.stacks, chip.tone))
            .join('')}
        </div>
      </div>
    `
  }

  private anchorAttributes(anchor: HudAnchor, gap: number): string {
    return `data-anchor-x="${Math.round(anchor.clientX)}" data-anchor-y="${Math.round(anchor.clientY)}" data-preferred-placement="${anchor.preferredPlacement}" data-anchor-gap="${gap}"`
  }
}
