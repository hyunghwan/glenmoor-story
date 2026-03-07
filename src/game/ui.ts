import Phaser from 'phaser'
import type { HudViewModel, Locale } from './types'

export class HudController {
  private readonly root: HTMLElement
  private readonly bus: Phaser.Events.EventEmitter
  private currentView?: HudViewModel

  constructor(root: HTMLElement, bus: Phaser.Events.EventEmitter) {
    this.root = root
    this.bus = bus
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

    const activeUnit = view.activeUnit
    const selectedUnit = view.selectedUnit

    this.root.innerHTML = `
      <div class="hud-overlay ${view.mode === 'busy' ? 'is-busy' : ''}">
        <div class="hud-brand">
          <div>
            <p class="hud-eyebrow">Prototype Vertical Slice</p>
            <h1>${view.title}</h1>
          </div>
          <div class="hud-locales">
            ${this.renderLocaleButton('en', view.locale)}
            ${this.renderLocaleButton('ko', view.locale)}
          </div>
        </div>

        <aside class="hud-panel hud-panel-left">
          <section class="hud-card">
            <span class="hud-label">${view.objective}</span>
            <h2>${view.subtitle}</h2>
          </section>
          <section class="hud-card">
            <span class="hud-label">Active Unit</span>
            ${activeUnit ? this.renderUnitCard(activeUnit) : '<p class="hud-empty">No active unit</p>'}
          </section>
          <section class="hud-card">
            <span class="hud-label">Selection</span>
            ${selectedUnit ? this.renderUnitCard(selectedUnit) : '<p class="hud-empty">No selected unit</p>'}
          </section>
        </aside>

        <aside class="hud-panel hud-panel-right">
          <section class="hud-card">
            <span class="hud-label">Commands</span>
            <div class="hud-actions">
              ${view.buttons
                .map(
                  (button) => `
                  <button class="hud-button ${button.active ? 'is-active' : ''}" data-command="${button.id}" ${button.disabled ? 'disabled' : ''}>
                    ${button.label}
                  </button>
                `,
                )
                .join('')}
            </div>
          </section>
          <section class="hud-card">
            <span class="hud-label">Forecast</span>
            <p class="hud-copy">${view.forecastText ?? 'Hover a target or choose a command.'}</p>
          </section>
          <section class="hud-card">
            <span class="hud-label">Initiative</span>
            <div class="hud-timeline">
              ${view.timeline.map((entry) => `<span>${entry}</span>`).join('')}
            </div>
          </section>
        </aside>

        <section class="hud-feed hud-card">
          <div class="hud-feed-header">
            <span class="hud-label">Battle Feed</span>
            <span class="hud-feed-phase">${view.phase.toUpperCase()}</span>
          </div>
          <div class="hud-feed-messages">
            ${view.messages.map((message) => `<p>${message}</p>`).join('')}
          </div>
        </section>

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

    this.root.querySelectorAll<HTMLButtonElement>('[data-command]').forEach((button) => {
      button.addEventListener('click', () => {
        this.bus.emit('hud:command', button.dataset.command)
      })
    })

    this.root.querySelectorAll<HTMLButtonElement>('[data-locale]').forEach((button) => {
      button.addEventListener('click', () => {
        const locale = button.dataset.locale as Locale
        this.bus.emit('hud:locale', locale)
      })
    })
  }

  private renderLocaleButton(locale: Locale, activeLocale: Locale): string {
    return `
      <button class="hud-locale ${locale === activeLocale ? 'is-active' : ''}" data-locale="${locale}">
        ${locale.toUpperCase()}
      </button>
    `
  }

  private renderUnitCard(unit: HudViewModel['activeUnit']): string {
    if (!unit) {
      return '<p class="hud-empty">Unavailable</p>'
    }

    return `
      <div class="hud-unit-card">
        <div class="hud-unit-head">
          <strong>${unit.name}</strong>
          <span>${unit.className}</span>
        </div>
        <div class="hud-unit-metrics">
          <span>HP ${unit.hp}/${unit.maxHp}</span>
          <span>${unit.team.toUpperCase()}</span>
          <span>${unit.position.x}, ${unit.position.y}</span>
        </div>
        <div class="hud-statuses">
          ${
            unit.statuses.length > 0
              ? unit.statuses.map((status) => `<span>${status.label} x${status.stacks}</span>`).join('')
              : '<span>Stable</span>'
          }
        </div>
      </div>
    `
  }
}
