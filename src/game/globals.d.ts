export {}

declare global {
  interface Window {
    render_game_to_text?: () => string
    advanceTime?: (ms: number) => void
    __glenmoorDebug?: {
      command: (command: string) => void
      locale: (locale: 'en' | 'ko') => void
      tile: (x: number, y: number) => void
      stage: (name: string) => void
      inspectClient: (x: number, y: number) => unknown
      lastInput: () => unknown
    }
  }
}
