// Tek WebSocket bağlantısı + yeniden bağlanma (D-32). Jeton sekmeye özel (sessionStorage): iki sekme iki koltuk.

import type { ClientMsg, ServerMsg } from './protocol'

export type NetStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

const DEFAULT_WS = 'wss://domino-ai-backend.onrender.com/ws'

export function wsBase(): string {
  const q = new URLSearchParams(location.search).get('ws')
  return q || (import.meta.env.VITE_WS_URL as string | undefined) || DEFAULT_WS
}

const TOKEN_KEY = 'domino.token'
const NAME_KEY = 'domino.name'

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export const session = {
  get token(): string | null {
    try { return storage()?.getItem(TOKEN_KEY) ?? null } catch { return null }
  },
  set token(v: string | null) {
    try { if (v) storage()?.setItem(TOKEN_KEY, v); else storage()?.removeItem(TOKEN_KEY) } catch { /* yok */ }
  },
  get name(): string | null {
    try { return storage()?.getItem(NAME_KEY) ?? null } catch { return null }
  },
  set name(v: string | null) {
    try { if (v) storage()?.setItem(NAME_KEY, v); else storage()?.removeItem(NAME_KEY) } catch { /* yok */ }
  },
}

export class Connection {
  status: NetStatus = 'idle'
  private ws: WebSocket | null = null
  private name = ''
  private attempt = 0
  private retryTimer: number | undefined
  private pingTimer: number | undefined
  private stopped = false
  private queue: ClientMsg[] = []

  constructor(
    private onMessage: (m: ServerMsg) => void,
    private onStatus: (s: NetStatus) => void,
  ) {
    // Sekme öne gelince ya da ağ dönünce beklemeden yeniden dene
    const kick = () => {
      if (!this.stopped && this.name && (this.status === 'reconnecting' || this.status === 'closed')) this.open(true)
    }
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && kick())
    window.addEventListener('online', kick)
  }

  connect(name: string) {
    this.name = name
    this.stopped = false
    session.name = name
    this.open(false)
  }

  /** Jetonsuz yeni oyun (jeton unutulur). */
  fresh(name: string) {
    session.token = null
    this.close()
    this.connect(name)
  }

  close() {
    this.stopped = true
    clearTimeout(this.retryTimer)
    clearInterval(this.pingTimer)
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      ws.close()
    }
    this.setStatus('closed')
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m))
    else if (m.type !== 'ping') this.queue.push(m)
  }

  private setStatus(s: NetStatus) {
    if (this.status !== s) {
      this.status = s
      this.onStatus(s)
    }
  }

  private open(isRetry: boolean) {
    clearTimeout(this.retryTimer)
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onmessage = null
      try { this.ws.close() } catch { /* yok */ }
    }
    this.setStatus(isRetry ? 'reconnecting' : 'connecting')
    const token = session.token
    const url = `${wsBase()}/${encodeURIComponent(this.name)}` + (token ? `?token=${encodeURIComponent(token)}` : '')
    const ws = new WebSocket(url)
    this.ws = ws
    ws.onopen = () => {
      if (this.ws !== ws) return
      this.attempt = 0
      this.setStatus('open')
      clearInterval(this.pingTimer)
      this.pingTimer = window.setInterval(() => this.send({ type: 'ping' }), 20000)
    }
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return
      let m: ServerMsg
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.type === 'joined') {
        if (m.token) session.token = m.token
        // bağlantı yokken biriken (hamle dışı) istekler; hamleler bayat olabilir, gönderilmez
        const q = this.queue.filter((x) => x.type !== 'move')
        this.queue = []
        q.forEach((x) => this.send(x))
      }
      this.onMessage(m)
    }
    ws.onclose = (ev) => {
      if (this.ws !== ws) return
      clearInterval(this.pingTimer)
      this.ws = null
      if (this.stopped) return this.setStatus('closed')
      if (ev.code === 4000) return this.setStatus('closed') // aynı koltuğa başka sekme bağlandı
      this.scheduleRetry()
    }
  }

  private scheduleRetry() {
    this.setStatus('reconnecting')
    const delay = Math.min(8000, 400 * 2 ** this.attempt) * (0.8 + Math.random() * 0.4)
    this.attempt++
    this.retryTimer = window.setTimeout(() => this.open(true), delay)
  }
}
