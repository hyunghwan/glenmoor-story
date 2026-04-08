import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const rootNode = document.querySelector<HTMLDivElement>('#root')

if (!rootNode) {
  throw new Error('Missing #root node')
}

createRoot(rootNode).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
