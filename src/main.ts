import './style.css'
import { mountBattleExperience } from './game/battle-experience'
import { resolveBattleSessionFromLocation } from './game/battle-session'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app root')
}

const appRoot = app

async function bootstrap(): Promise<void> {
  const session = await resolveBattleSessionFromLocation(window.location.search)
  mountBattleExperience({
    root: appRoot,
    session,
  })
}

void bootstrap()
