// Ekran: tek `render(model)` her şeyi modelden çizer. Taşlar kimlikli ve kalıcı; animasyon önceki → yeni
// konum farkından üretilir. Arka plandaki sekmede ya da gecikmiş çizimde animasyonsuz, doğrudan son durum.

import { computeGeometry, handSlots, relSeat, type Geometry, type Pt } from './geometry'
import { ghostPlace, snakeLayout, type Place } from './layout'
import { mustPass, optionsFor, visibleHand, type Model } from './model'
import { isDouble, teamOf, tileId, type MoveDict, type Tile } from './protocol'
import { makeTile, nearestRot, TileSprite, type T } from './tiles'

const BOT_SEATS = new Set([1, 3])

export interface Target {
  move: MoveDict
  t: T // ekrandaki hedef (masa ölçeğinde)
}

export interface ViewHooks {
  onPlay: (mv: MoveDict) => void
  onRematch: () => void
  onJoin: (name: string, players?: number) => void
  onLeave: () => void
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text !== undefined) el.textContent = text
  parent?.appendChild(el)
  return el
}

interface SeatEls {
  root: HTMLElement
  av: HTMLElement
  name: HTMLElement
  sub: HTMLElement
  backs: HTMLElement
  bubble: HTMLElement
}

export class View {
  root: HTMLElement
  g!: Geometry
  model!: Model
  private table: HTMLElement
  private layer: HTMLElement
  private endsLayer: HTMLElement
  private sprites = new Map<string, TileSprite>()
  private seats: Record<1 | 2 | 3, SeatEls>
  private hud: { a: HTMLElement; b: HTMLElement; barA: HTMLElement; barB: HTMLElement; meta: HTMLElement; lblA: HTMLElement }
  private banner: HTMLElement
  private toast: HTMLElement
  private hint: HTMLElement
  private passBtn: HTMLButtonElement
  private overlay: HTMLElement
  private lobby: HTMLElement
  private waiting: HTMLElement
  private nameInput: HTMLInputElement
  private lastBubbleSeq = -1
  private lastNoticeSeq = 0
  private toastTimer: number | undefined
  private shownRoundOver: unknown = null
  private lastHandIds: string[] = []
  /** sürükleme/seçim sırasında masaya yazılmayan taş (drag.ts yönetir) */
  heldId: string | null = null
  selectedId: string | null = null
  hotTarget: number | null = null
  netState = 'idle'
  private invalidatedAt = 0
  private raf = 0
  private lastGeomKey = ''

  constructor(root: HTMLElement, private hooks: ViewHooks) {
    this.root = root
    root.innerHTML = ''
    this.table = h('div', 'table', root)
    // HUD
    const hud = h('div', 'hud', this.table)
    const pill = h('div', 'score', hud)
    const a = h('div', 'team a', pill)
    const lblA = h('span', 'lbl', a, 'Biz')
    const sa = h('span', 'pts', a, '0')
    const mid = h('div', 'mid', pill)
    const ba = h('div', 'bar a', mid)
    const barA = h('i', '', ba)
    const bb = h('div', 'bar b', mid)
    const barB = h('i', '', bb)
    const meta = h('span', 'meta', mid, '101')
    const b = h('div', 'team b', pill)
    const sb = h('span', 'pts', b, '0')
    h('span', 'lbl', b, 'Bot')
    this.hud = { a: sa, b: sb, barA, barB, meta, lblA }
    this.banner = h('div', 'banner', this.table)
    // koltuklar
    const mkSeat = (rel: 1 | 2 | 3): SeatEls => {
      const root = h('div', `seat rel${rel}`, this.table)
      root.dataset.rel = String(rel)
      const av = h('div', 'av', root)
      h('span', 'lbl', av)
      const info = h('div', 'info', root)
      const name = h('div', 'nm', info)
      const sub = h('div', 'sub', info)
      const backs = h('div', 'backs', root)
      const bubble = h('div', 'bubble', av, 'Pas')
      const dots = h('div', 'dots', av)
      h('i', '', dots); h('i', '', dots); h('i', '', dots)
      return { root, av, name, sub, backs, bubble }
    }
    this.seats = { 1: mkSeat(1), 2: mkSeat(2), 3: mkSeat(3) }
    this.endsLayer = h('div', 'ends', this.table)
    this.layer = h('div', 'layer', this.table)
    this.hint = h('div', 'hint', this.table)
    this.passBtn = h('button', 'passbtn', this.table, 'Pas geç')
    this.passBtn.type = 'button'
    this.passBtn.addEventListener('click', () => {
      const pass = this.model.legal.find((m) => m.is_pass)
      if (pass) this.hooks.onPlay(pass)
    })
    this.toast = h('div', 'toast', this.table)
    // tur sonu
    this.overlay = h('div', 'overlay', root)
    // lobi
    this.lobby = h('div', 'screen lobby', root)
    const card = h('form', 'card', this.lobby)
    h('div', 'logo', card).innerHTML = '<span class="lt"></span><span class="lt"></span>'
    h('h1', '', card, 'Domino')
    h('p', 'muted', card, 'Azerbaycan dominosu · 101 puan')
    this.nameInput = h('input', 'name', card)
    this.nameInput.placeholder = 'Adın'
    this.nameInput.maxLength = 20
    this.nameInput.setAttribute('autocomplete', 'nickname')
    this.nameInput.enterKeyHint = 'go'
    const go = h('button', 'primary', card, 'Oyna (4 kişi)')
    go.type = 'submit'
    // 2 kişilik (R-20..R-28): sen ve yapay zekâ, bazarlı; bekleme yok
    const duo = h('button', 'secondary duo', card, 'Bota karşı (2 kişi)')
    duo.type = 'button'
    duo.addEventListener('click', () => this.hooks.onJoin(this.nameInput.value.trim() || 'Oyuncu', 2))
    h('p', 'tiny', card, '4 kişi: 2 insan + 2 yapay zekâ; iki sekmede aynı adla girersen iki eli birden oynarsın (kayıtta işaretlenir). 2 kişi: sen ve yapay zekâ, bazardan 2\'şer çekilir.')
    card.addEventListener('submit', (e) => {
      e.preventDefault()
      const n = this.nameInput.value.trim() || 'Oyuncu'
      this.hooks.onJoin(n)
    })
    // bekleme
    this.waiting = h('div', 'screen waiting', root)
    const wc = h('div', 'card', this.waiting)
    h('div', 'spinner', wc)
    h('h2', '', wc, 'Partner bekleniyor')
    h('p', 'muted', wc, 'İkinci oyuncu girince oyun başlar. Bu sayfayı başka bir sekmede de açabilirsin.')
    const leave = h('button', 'secondary', wc, 'Vazgeç')
    leave.type = 'button'
    leave.addEventListener('click', () => this.hooks.onLeave())
  }

  setName(n: string) {
    this.nameInput.value = n
  }

  /** Çizim isteği (bir kare içinde birleştirilir). */
  invalidate(model: Model) {
    this.model = model
    if (!this.pending) this.invalidatedAt = performance.now()
    if (document.hidden) {
      // arka plan: rAF çalışmaz; son durum hemen, animasyonsuz yazılır
      this.cancelScheduled()
      this.render(false)
      return
    }
    if (this.pending) return
    // Tarayıcı bazen sayfayı "görünür" bildirirken rAF'ı durdurur (gizli panel, küçültülmüş/örtülü pencere).
    // Bu yüzden rAF ile birlikte bir zamanlayıcı da kurulur; hangisi önce gelirse çizer. Zamanlayıcıyla
    // gelen çizim animasyonsuzdur (kimse izlemiyor), ekran yine de her zaman son durumu gösterir.
    this.pending = true
    const run = (viaRaf: boolean) => {
      if (!this.pending) return
      this.cancelScheduled()
      this.render(viaRaf && performance.now() - this.invalidatedAt < 250)
    }
    this.raf = requestAnimationFrame(() => run(true))
    this.fallback = window.setTimeout(() => run(false), 120)
  }
  private fallback: number | undefined
  private pending = false
  /** Çizilmeyi bekleyen bir durum var mı (testler ve hata ayıklama için). */
  get renderPending() {
    return this.pending
  }
  private cancelScheduled() {
    this.pending = false
    cancelAnimationFrame(this.raf)
    clearTimeout(this.fallback)
    this.raf = 0
  }

  /** Pencere boyutu değişti: geometri baştan, animasyonsuz. */
  resize() {
    if (this.model) this.render(false)
  }

  private geometry(): boolean {
    const r = this.root.getBoundingClientRect()
    const cs = getComputedStyle(document.documentElement)
    const st = parseFloat(cs.getPropertyValue('--sat')) || 0
    const sb = parseFloat(cs.getPropertyValue('--sab')) || 0
    const key = `${Math.round(r.width)}x${Math.round(r.height)}:${st}:${sb}`
    if (key === this.lastGeomKey) return false
    this.lastGeomKey = key
    this.g = computeGeometry(r.width, r.height, st, sb)
    this.layer.style.setProperty('--u', `${this.g.u}px`)
    this.table.style.setProperty('--uh', `${this.g.uHand}px`)
    this.endsLayer.style.setProperty('--u', `${this.g.u}px`)
    this.table.classList.toggle('portrait', this.g.portrait)
    return true
  }

  // ── konum hesapları ──────────────────────────────────────

  boardT(p: Place): T {
    const g = this.g
    // dikey eksende dizilim 90° döner: sol uç yukarı, sağ uç aşağı
    if (g.vertical) return { x: g.origin.x - p.y * g.u, y: g.origin.y + p.x * g.u, rot: p.rot + 90, s: 1, o: 1 }
    return { x: g.origin.x + p.x * g.u, y: g.origin.y + p.y * g.u, rot: p.rot, s: 1, o: 1 }
  }

  handT(slot: Pt, lifted: boolean): T {
    return { x: slot.x, y: slot.y - (lifted ? Math.round(this.g.uHand * 0.22) : 0), rot: 90, s: this.g.uHand / this.g.u, o: 1 }
  }

  seatPt(player: number): Pt {
    const rel = relSeat(player, this.model.me, this.model.players)
    if (rel === 0) return { x: this.g.vw / 2, y: this.g.handY }
    return this.g.seats[rel]
  }

  /** Elimdeki taşın oynanabileceği hedefler (ekran konumu). */
  targetsFor(tile: Tile): Target[] {
    const m = this.model
    const [lv, rv] = m.ends
    return optionsFor(m, tile).map((mv) => {
      const p = ghostPlace(m.board, m.anchor, this.g.X, tile, mv.to_left, lv, rv)
      // ghostPlace'in yönlendirdiği taş (a, b); öğe (küçük, büyük) kurulduğu için ters ise +180
      const o: Tile = m.board.length === 0 ? tile : mv.to_left ? (tile[1] === lv ? tile : [tile[1], tile[0]]) : (tile[0] === rv ? tile : [tile[1], tile[0]])
      const t = this.boardT(p)
      if (o[0] !== Math.min(o[0], o[1])) t.rot += 180
      return { move: mv, t }
    })
  }

  handTile(id: string): Tile | undefined {
    return visibleHand(this.model).find((t) => tileId(t) === id)
  }

  sprite(id: string): TileSprite | undefined {
    return this.sprites.get(id)
  }

  /** Bu kimlikteki taşın el yuvasındaki konumu. */
  handHome(id: string): T | null {
    const hand = visibleHand(this.model)
    const i = hand.findIndex((t) => tileId(t) === id)
    if (i < 0) return null
    const slots = handSlots(this.g, hand.length)
    const playable = optionsFor(this.model, hand[i]).length > 0
    return this.handT(slots[i], playable || this.selectedId === id)
  }

  // ── çizim ────────────────────────────────────────────────

  render(animate: boolean) {
    const m = this.model
    if (!m) return
    if (this.geometry()) animate = false
    this.root.dataset.screen = m.screen
    this.root.dataset.net = this.netState
    const g = this.g
    const want = new Map<string, { tile: Tile; t: T; z: number; cls: string; from?: T; delay?: number; dur?: number }>()

    // masa
    const places = snakeLayout(m.board, m.anchor, g.X)
    let fit = 1
    if (places.length) {
      // nadiren (dengesiz uzun kol) alana sığmazsa yalnız o zaman küçült
      let minX = 0, maxX = 0, minY = 0, maxY = 0
      for (const p of places) {
        const v = Math.abs(Math.round(p.rot / 90)) % 2 === 1
        const hx = v ? 0.5 : 1, hy = v ? 1 : 0.5
        minX = Math.min(minX, p.x - hx); maxX = Math.max(maxX, p.x + hx)
        minY = Math.min(minY, p.y - hy); maxY = Math.max(maxY, p.y + hy)
      }
      let needW = 2 * Math.max(maxX, -minX) * g.u, needH = 2 * Math.max(maxY, -minY) * g.u
      if (g.vertical) [needW, needH] = [needH, needW]
      fit = Math.min(1, g.board.w / needW, g.board.h / needH)
    }
    const last = m.last
    m.board.forEach((t, i) => {
      const id = tileId(t)
      const p = places[i]
      const bt = this.boardT(p)
      const tt: T = fit < 1 ? { x: g.origin.x + (bt.x - g.origin.x) * fit, y: g.origin.y + (bt.y - g.origin.y) * fit, rot: bt.rot, s: fit, o: 1 } : bt
      const isLast = !!last && last.kind === 'tile' && last.tile === id
      let from: T | undefined
      if (isLast && !this.sprites.has(id) && last.player !== m.me) {
        const sp = this.seatPt(last.player)
        from = { x: sp.x, y: sp.y, rot: tt.rot + (relSeat(last.player, m.me, m.players) === 2 ? 0 : 90), s: 0.55 * tt.s, o: 0 }
      }
      want.set(id, { tile: t, t: tt, z: 10 + i, cls: isLast ? 'last' : '', from, dur: from ? 520 : 380 })
    })

    // el
    const hand = visibleHand(m)
    const slots = handSlots(g, hand.length)
    const myTurn = m.legal.length > 0 && !m.roundOver
    hand.forEach((t, i) => {
      const id = tileId(t)
      const playable = myTurn && optionsFor(m, t).length > 0
      const sel = this.selectedId === id
      const cls = ['hand', playable ? 'playable' : myTurn ? 'dim' : '', sel ? 'selected' : ''].join(' ')
      want.set(id, { tile: t, t: this.handT(slots[i], playable || sel), z: 200 + i, cls, dur: 260 })
    })

    // tur sonu: diğer ellerin açılması
    if (m.roundOver) {
      m.roundOver.hands.forEach((tiles, p) => {
        if (p === m.me) return
        const sp = this.seatPt(p)
        const rel = relSeat(p, m.me, m.players)
        const uR = g.portrait ? 13 : 16
        const s = uR / g.u
        const n = tiles.length
        const gap = 3
        const total = n * uR + (n - 1) * gap
        let x0 = sp.x - total / 2 + uR / 2
        x0 = Math.max(8 + uR / 2, Math.min(g.vw - 8 - total + uR / 2, x0))
        const y = sp.y + (rel === 2 ? 46 : 52) + uR
        tiles.forEach((t, k) => {
          const id = tileId(t)
          if (want.has(id)) return
          want.set(id, {
            tile: t, t: { x: x0 + k * (uR + gap), y, rot: 90, s, o: 1 }, z: 300 + k, cls: 'revealed',
            from: { x: sp.x, y: sp.y, rot: 90, s: s * 0.5, o: 0 }, delay: 120 + 70 * k + 120 * rel, dur: 420,
          })
        })
      })
    }

    // senkronize et
    for (const [id, sp] of this.sprites) {
      if (!want.has(id)) {
        sp.stop()
        sp.el.remove()
        this.sprites.delete(id)
      }
    }
    for (const [id, w] of want) {
      let sp = this.sprites.get(id)
      const fresh = !sp
      const lo = Math.min(w.tile[0], w.tile[1])
      if (!sp) {
        const el = makeTile(lo, Math.max(w.tile[0], w.tile[1]), id)
        this.layer.appendChild(el)
        sp = new TileSprite(el, w.from ?? w.t, () => this.g.u)
        this.sprites.set(id, sp)
      }
      sp.el.className = `tile ${w.cls}`.trim()
      sp.el.style.zIndex = String(id === this.heldId ? 1000 : w.z)
      if (id === this.heldId) continue // sürüklenen taşın yerini drag.ts belirler
      const cur = sp.current()
      // öğe hep (küçük, büyük) sırayla kurulur; yönlü taş ters ise 180° döner (yüz değişmez, uçuşta zıplamaz)
      const rot = w.t.rot + (w.tile[0] !== lo ? 180 : 0)
      const tgt: T = { ...w.t, rot: nearestRot(rot, cur.rot, isDouble(w.tile)) }
      if (!animate) sp.set(tgt)
      else if (fresh && w.from) sp.moveTo(tgt, w.dur ?? 400, 'cubic-bezier(.2,.75,.25,1)', w.from, w.delay ?? 0)
      else if (fresh) sp.set(tgt)
      else sp.moveTo(tgt, w.dur ?? 320)
    }

    this.renderHud()
    this.renderSeats(animate)
    this.renderEnds()
    this.renderHint()
    this.renderOverlay()
    this.renderNotice()
    this.lastHandIds = hand.map(tileId)
  }

  private renderHud() {
    const m = this.model
    const sc = m.match?.score ?? [0, 0]
    const target = m.match?.target ?? 101
    this.hud.a.textContent = String(sc[0])
    this.hud.b.textContent = String(sc[1])
    this.hud.barA.style.width = `${Math.min(100, (sc[0] / target) * 100)}%`
    this.hud.barB.style.width = `${Math.min(100, (sc[1] / target) * 100)}%`
    this.hud.meta.textContent = `${target}'e · Tur ${m.match?.round_no ?? 1}` + (m.players === 2 ? ` · Bazar ${m.boneyard}` : '')
    this.hud.lblA.textContent = m.players === 2 ? 'Sen' : 'Biz'
    const st = this.netState
    this.banner.textContent = st === 'reconnecting' || st === 'connecting' ? 'Bağlantı kuruluyor…' : st === 'closed' && m.screen !== 'lobby' ? 'Bağlantı kapandı (başka sekmede açık olabilir)' : ''
    this.banner.classList.toggle('show', !!this.banner.textContent && m.screen !== 'lobby')
  }

  private renderSeats(animate: boolean) {
    const m = this.model
    const g = this.g
    for (const rel of [1, 2, 3] as const) {
      const s = this.seats[rel]
      const duo = m.players === 2
      s.root.style.display = duo && rel !== 2 ? 'none' : ''           // 2 kişilikte yalnız karşı koltuk
      if (duo && rel !== 2) continue
      const p = duo ? 1 - m.me : (m.me + rel) % 4
      const pt = g.seats[rel]
      s.root.style.transform = `translate(${pt.x}px, ${pt.y}px)`
      const isBot = duo ? p === 1 : BOT_SEATS.has(p)
      s.av.firstElementChild!.textContent = `P${p + 1}`
      s.root.classList.toggle('team-a', teamOf(p) === 0)
      s.root.classList.toggle('team-b', teamOf(p) === 1)
      const nm = isBot ? 'Yapay zekâ' : m.names[p] || 'Partner'
      s.name.textContent = nm
      const n = m.handSizes[p] ?? 0
      s.sub.textContent = m.roundOver ? '' : `${n} taş`
      const turn = !m.roundOver && m.current === p && m.screen === 'game'
      s.root.classList.toggle('turn', turn)
      s.root.classList.toggle('thinking', turn && isBot)
      s.root.classList.toggle('away', !isBot && m.partnerAway)
      // arka yüzler
      const want = m.roundOver ? 0 : n
      while (s.backs.children.length > want) s.backs.lastElementChild!.remove()
      while (s.backs.children.length < want) h('i', '', s.backs)
      // pas balonu
      if (m.last && m.last.kind === 'pass' && m.last.player === p && m.last.seq !== this.lastBubbleSeq) {
        this.lastBubbleSeq = m.last.seq
        s.bubble.classList.remove('pop')
        if (animate) {
          void s.bubble.offsetWidth
          s.bubble.classList.add('pop')
        }
      }
    }
    // kendi pas balonum: hint üzerinden
  }

  private renderEnds() {
    const m = this.model
    this.endsLayer.innerHTML = ''
    const id = this.heldId ?? this.selectedId
    if (!id || m.roundOver) return
    const t = this.handTile(id)
    if (!t) return
    this.targetsFor(t).forEach((tg, i) => {
      const el = h('div', `ghost${this.hotTarget === i ? ' hot' : ''}`, this.endsLayer)
      el.dataset.i = String(i)
      el.dataset.side = tg.move.to_left ? 'L' : 'R'
      const u = this.g.u
      el.style.transform = `translate(${tg.t.x - u}px, ${tg.t.y - u / 2}px) rotate(${tg.t.rot}deg)`
    })
  }

  private renderHint() {
    const m = this.model
    const myTurn = m.legal.length > 0 && !m.roundOver
    const pass = myTurn && mustPass(m)
    this.passBtn.classList.toggle('show', pass)
    let text = ''
    if (m.screen === 'game' && !m.roundOver) {
      if (pass) text = 'Oynanacak taşın yok'
      else if (myTurn) text = m.board.length === 0 ? 'Sıra sende · açılış taşını sürükle ya da dokun' : 'Sıra sende · sürükle ya da dokun'
      else if (m.current >= 0) {
        const rel = relSeat(m.current, m.me, m.players)
        text = rel === 2 && m.players === 4 ? `${m.names[m.current] || 'Partner'} oynuyor…` : 'Yapay zekâ düşünüyor…'
      }
      if (m.last && m.last.player === m.me && m.last.kind === 'pass' && !myTurn) text = 'Pas geçtin · ' + text
    }
    this.hint.textContent = text
    this.hint.classList.toggle('mine', myTurn)
    this.table.classList.toggle('myturn', myTurn)
  }

  private renderOverlay() {
    const m = this.model
    const ro = m.roundOver
    if (!ro) {
      this.overlay.classList.remove('show')
      this.shownRoundOver = null
      return
    }
    if (this.shownRoundOver === ro) return
    this.shownRoundOver = ro
    const won = ro.round_winner_team === 0
    const title = ro.match_winner !== null
      ? (ro.match_winner === 0 ? 'Maçı kazandınız!' : 'Maçı yapay zekâ kazandı')
      : ro.round_winner_team === null ? 'Kapandı · berabere' : won ? 'Turu kazandınız' : 'Turu yapay zekâ aldı'
    const [l1, l2] = ro.winner.split('\n')
    const sc = ro.match.score
    const tgt = ro.match.target
    this.overlay.innerHTML = ''
    const card = h('div', `card result ${ro.round_winner_team === null ? 'tie' : won ? 'win' : 'lose'}`, this.overlay)
    h('div', 'badge', card, ro.reason === 'out' ? 'Bitirdi' : 'Kapandı')
    h('h2', '', card, title)
    h('p', 'muted', card, l1 ?? '')
    const bars = h('div', 'bars', card)
    for (const [team, lbl] of [[0, m.players === 2 ? 'Sen' : 'Biz'], [1, 'Yapay zekâ']] as const) {
      const row = h('div', `row t${team}`, bars)
      h('span', 'lbl', row, lbl)
      const bar = h('div', 'bar', row)
      const fill = h('i', '', bar)
      fill.style.setProperty('--w', `${Math.min(100, (sc[team] / tgt) * 100)}%`)
      h('span', 'pts', row, String(sc[team]))
    }
    h('p', 'tiny', card, l2 ?? '')
    const btn = h('button', 'primary', card, ro.match_winner !== null ? 'Yeni maç' : 'Sonraki tur')
    btn.type = 'button'
    btn.addEventListener('click', () => {
      btn.disabled = true
      btn.textContent = 'Bekleniyor…'
      this.hooks.onRematch()
    })
    // bitmiş masaya bakmak için panel geçici olarak kenara çekilir
    const look = h('button', 'secondary look', card, 'Masaya bak')
    look.type = 'button'
    const back = h('button', 'peekbtn', this.overlay, 'Sonucu göster')
    back.type = 'button'
    look.addEventListener('click', () => this.overlay.classList.add('peek'))
    back.addEventListener('click', () => this.overlay.classList.remove('peek'))
    this.overlay.classList.remove('show', 'peek')
    void this.overlay.offsetWidth
    this.overlay.classList.add('show')
  }

  private renderNotice() {
    const m = this.model
    if (m.noticeSeq === this.lastNoticeSeq || !m.notice) return
    this.lastNoticeSeq = m.noticeSeq
    this.toast.textContent = m.notice
    this.toast.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2600)
  }

  /** Kendi taşımı masaya otur: titreşim (destekleniyorsa). */
  haptic() {
    try { navigator.vibrate?.(12) } catch { /* yok */ }
  }

  get handIds() {
    return this.lastHandIds
  }
}
