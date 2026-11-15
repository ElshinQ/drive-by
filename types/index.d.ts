export type ItemStatus = 'open' | 'done' | 'dropped'

export type Item = {
  id: string
  text: string
  status: ItemStatus
  source: 'auto' | 'agent'
  createdAt: number
  closedAt?: number
  note?: string
}

declare module 'claude-code' {
  interface PluginState {
    'drive-by': {
      items: Shaped<Item[]>
      reminded: string[]
      showClosed: boolean
      asked: boolean
      live: boolean
    }
  }
}
