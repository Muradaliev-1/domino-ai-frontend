// Sürükle-bırak ve dokunarak oynama (Pointer Events: fare + dokunmatik + kalem aynı kod).
// Taş parmağı gecikmesiz izler; uygun uca yaklaşınca uç parlar, taş mıknatıs gibi çekilir ve döner;
// bırakınca kayarak oturur, yanlış yerde ele geri kayar. Dokun: tek uç varsa oynar, iki uç varsa uç seçtirir.

import { optionsFor } from './model'
import type { MoveDict } from './protocol'
import { lerp, nearestRot, type T } from './tiles'
import type { Target, View } from './view'

interface DragState {
  id: string
  pointerId: number
  sx: number
  sy: number
  grab: { dx: number; dy: number }
  start: T
  moved: boolean
  touch: boolean
  targets: Target[]
  el: HTMLElement
}

const smooth = (k: number) => k * k * (3 - 2 * k)
const clamp01 = (k: number) => Math.max(0, Math.min(1, k))

export function installInput(view: View, play: (mv: MoveDict) => void) {
  let drag: DragState | null = null
  const root = view.root

  const tileAt = (e: PointerEvent) => (e.target as HTMLElement).closest<HTMLElement>('.tile.hand')
  const ghostAt = (e: PointerEvent) => (e.target as HTMLElement).closest<HTMLElement>('.ghost')

  const legalStill = (mv: MoveDict) =>
    view.model.legal.some((x) => !x.is_pass && x.to_left === mv.to_left && x.tile[0] === mv.tile[0] && x.tile[1] === mv.tile[1])

  function commit(mv: MoveDict) {
    if (!legalStill(mv)) return false
    view.heldId = null
    view.selectedId = null
    view.hotTarget = null
    play(mv)
    return true
  }

  function release(cancel: boolean) {
    const d = drag
    drag = null
    if (!d) return
    try { d.el.releasePointerCapture(d.pointerId) } catch { /* yok */ }
    d.el.classList.remove('lifted')
    if (!d.moved) {
      if (cancel) return
      // dokunma: tek seçenek → oyna; iki seçenek → uç seçtir
      const tile = view.handTile(d.id)
      if (!tile) return
      const opts = optionsFor(view.model, tile)
      if (opts.length === 1) return void commit(opts[0])
      view.selectedId = view.selectedId === d.id ? null : d.id
      view.render(true)
      return
    }
    const hot = view.hotTarget
    if (!cancel && hot !== null && d.targets[hot] && commit(d.targets[hot].move)) return
    // ele geri kay
    view.heldId = null
    view.hotTarget = null
    view.render(true)
  }

  root.addEventListener('pointerdown', (e) => {
    if (drag || e.button > 0) return
    const ghost = ghostAt(e)
    if (ghost && view.selectedId) {
      const tile = view.handTile(view.selectedId)
      const tg = tile ? view.targetsFor(tile)[Number(ghost.dataset.i)] : undefined
      e.preventDefault()
      if (tg) commit(tg.move)
      return
    }
    const el = tileAt(e)
    if (!el) {
      if (view.selectedId) {
        view.selectedId = null
        view.render(true)
      }
      return
    }
    const id = el.dataset.id!
    const tile = view.handTile(id)
    const sp = view.sprite(id)
    if (!tile || !sp) return
    e.preventDefault()
    if (optionsFor(view.model, tile).length === 0) {
      el.classList.remove('nope')
      void el.offsetWidth
      el.classList.add('nope')
      return
    }
    const cur = sp.current()
    sp.set(cur)
    drag = {
      id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
      grab: { dx: cur.x - e.clientX, dy: cur.y - e.clientY },
      start: cur, moved: false, touch: e.pointerType !== 'mouse', targets: view.targetsFor(tile), el,
    }
    try { el.setPointerCapture(e.pointerId) } catch { /* yok */ }
    el.classList.add('lifted')
  })

  root.addEventListener('pointermove', (e) => {
    const d = drag
    if (!d || e.pointerId !== d.pointerId) return
    e.preventDefault()
    const dist = Math.hypot(e.clientX - d.sx, e.clientY - d.sy)
    if (!d.moved) {
      if (dist < 6) return
      d.moved = true
      view.heldId = d.id
      view.selectedId = null
      d.el.style.zIndex = '1000'
      view.render(true) // seçimi temizle, uçları göster; taşın kendisi heldId olduğu için yerinde kalır
    }
    const g = view.g
    const sp = view.sprite(d.id)
    if (!sp) return
    // yükseldikçe masa boyuna yaklaş (biraz büyük: elde tutuyor hissi)
    const rise = clamp01((d.sy - e.clientY) / (g.uHand * 2.2))
    const s = lerp(d.start.s, 1.08, rise)
    const k = s / d.start.s
    const lift = d.touch ? -g.uHand * 0.9 * rise : 0 // parmak taşı örtmesin
    const free: T = { x: e.clientX + d.grab.dx * k, y: e.clientY + d.grab.dy * k + lift, rot: d.start.rot, s, o: 1 }
    // en yakın uç: mıknatıs
    let best = -1
    let bestD = Infinity
    d.targets.forEach((tg, i) => {
      const dd = Math.hypot(free.x - tg.t.x, free.y - tg.t.y)
      if (dd < bestD) { bestD = dd; best = i }
    })
    const R = Math.max(2.8 * g.u, 64)
    let pos = free
    let hot: number | null = null
    if (best >= 0 && bestD < R) {
      hot = best
      const tg = d.targets[best].t
      const m = smooth(clamp01(1 - bestD / R))
      const rot = nearestRot(tg.rot, free.rot)
      const pull = Math.min(1, m * 1.25)
      pos = { x: lerp(free.x, tg.x, pull * 0.9), y: lerp(free.y, tg.y, pull * 0.9), rot: lerp(free.rot, rot, Math.min(1, m * 1.6)), s: lerp(s, tg.s, m), o: 1 }
    }
    sp.set(pos)
    if (hot !== view.hotTarget) {
      view.hotTarget = hot
      view.render(true)
    }
    if (!view.root.querySelector('.ghost')) view.render(true)
  })

  root.addEventListener('pointerup', (e) => drag && e.pointerId === drag.pointerId && release(false))
  root.addEventListener('pointercancel', (e) => drag && e.pointerId === drag.pointerId && release(true))
  root.addEventListener('lostpointercapture', (e) => drag && e.pointerId === drag.pointerId && drag.moved && release(false))
  // dokunmatikte sayfa kaymasın / büyümesin
  root.addEventListener('touchmove', (e) => drag && e.preventDefault(), { passive: false })
  root.addEventListener('contextmenu', (e) => e.preventDefault())
}
