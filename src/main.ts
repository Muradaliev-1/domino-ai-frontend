import './styles.css'
import { installInput } from './drag'
import { initialModel, playLocal, reduce, type Model } from './model'
import { Connection, session } from './net'
import type { ServerMsg } from './protocol'
import { View } from './view'

let model: Model = initialModel()
// son mesajların kısa kaydı (hata ayıklama ve testler için)
const trace: string[] = []
function note(s: string) {
  trace.push(`${Math.round(performance.now())} ${s}`)
  if (trace.length > 60) trace.shift()
}

const root = document.getElementById('app')!
const view = new View(root, {
  onPlay: (mv) => play(mv),
  onRematch: () => conn.send({ type: 'rematch' }),
  onJoin: (name, players) => conn.fresh(name, players),
  onLeave: () => {
    conn.close()
    session.token = null
    update(initialModel())
  },
})

function update(m: Model) {
  model = m
  view.invalidate(m)
  // testler ve hata ayıklama için (oyun mantığı kullanmaz)
  ;(window as unknown as { __domino: unknown }).__domino = { model: m, net: conn?.status, trace, view }
}

const conn = new Connection(
  (msg: ServerMsg) => {
    note(`< ${msg.type}${'player' in msg ? ' p' + msg.player : ''}${'board' in msg ? ' b' + msg.board.length : ''}${msg.type === 'game_state' ? ' cur' + msg.current_player + (msg.is_your_turn ? ' MY' : '') : ''}`)
    update(reduce(model, msg))
  },
  (st) => {
    view.netState = st
    update(model)
  },
)

function play(mv: Parameters<typeof playLocal>[1]) {
  if (!model.legal.length) return
  note(`> move ${mv.is_pass ? 'pass' : mv.tile.join('|') + (mv.to_left ? ' L' : ' R')}`)
  update(playLocal(model, mv))
  conn.send({ type: 'move', ...mv })
  if (!mv.is_pass) view.haptic()
}

installInput(view, play)

// pencere/ekran değişimi: tek gözlemci, animasyonsuz yeniden yerleşim
new ResizeObserver(() => view.resize()).observe(root)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) view.render(false) // öne gelince kesin son durum
})

// sayfa yenilendiyse (aynı sekme, jeton duruyor) aynı koltuğa dön
const savedName = session.name
if (savedName) view.setName(savedName)
update(model)
if (savedName && session.token) conn.connect(savedName)

// PWA: servis çalışanı (yalnız üretim derlemesinde)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => undefined))
}
