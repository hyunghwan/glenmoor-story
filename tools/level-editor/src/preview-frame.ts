import '../../../src/style.css'
import { mountBattleExperience, type MountedBattleExperience } from '../../../src/game/battle-experience'
import { createBattleSessionFromLevelBundle } from '../../../src/game/battle-session'
import { LEVEL_BUNDLE_PREVIEW_MESSAGE } from '../../../src/game/level-bundle'

const root = document.querySelector<HTMLDivElement>('#root')

if (!root) {
  throw new Error('Missing #root node')
}

let mounted: MountedBattleExperience | undefined

function renderMessage(title: string, body: string): void {
  mounted?.destroy()
  mounted = undefined
  root.innerHTML = `
    <main style="min-height: 100vh; display: grid; place-items: center; margin: 0; background: radial-gradient(circle at top, #2a2a24 0%, #121212 54%, #090909 100%); color: #f4ead3; font-family: 'IBM Plex Sans', 'Avenir Next', 'Segoe UI', sans-serif;">
      <section style="width: min(38rem, calc(100vw - 2rem)); border: 1px solid rgba(206, 173, 102, 0.32); background: rgba(17, 17, 17, 0.82); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45); padding: 1.5rem;">
        <p style="margin: 0 0 0.35rem; letter-spacing: 0.18em; text-transform: uppercase; color: #cead66; font-size: 0.74rem;">Playtest Runtime</p>
        <h1 style="margin: 0 0 0.75rem; font-size: 1.4rem;">${title}</h1>
        <p style="margin: 0; color: rgba(244, 234, 211, 0.74); line-height: 1.6;">${body}</p>
      </section>
    </main>
  `
}

window.addEventListener('message', (event: MessageEvent<{ type?: string; bundle?: unknown }>) => {
  if (event.data?.type !== LEVEL_BUNDLE_PREVIEW_MESSAGE) {
    return
  }

  try {
    mounted?.destroy()
    root.innerHTML = ''
    mounted = mountBattleExperience({
      root,
      session: createBattleSessionFromLevelBundle(event.data.bundle, 'preview-message'),
      enableDebugGlobals: false,
    })
  } catch (error) {
    renderMessage('Preview failed', error instanceof Error ? error.message : String(error))
  }
})

renderMessage(
  'Waiting for preview bundle',
  'The level editor will stream the current in-memory level bundle here as soon as the preview panel is ready.',
)

window.parent.postMessage({ type: 'glenmoor:preview-ready' }, '*')
