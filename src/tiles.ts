// Taş DOM öğesi ve dönüşüm/animasyon yardımcıları.

export interface T {
  x: number // merkez (px, ekran)
  y: number
  rot: number // derece
  s: number // ölçek (taşın temel boyu 2u × u)
  o: number // opaklık
}

const PIPS: Record<number, Array<[number, number]>> = {
  0: [],
  1: [[50, 50]],
  2: [[27, 27], [73, 73]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[27, 27], [73, 27], [27, 73], [73, 73]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  // taşın temel duruşu yatay: üçlü sıralar taşın uzun kenarına paralel. Dik duran taşta (el) 3 satır × 2 sütun görünür
  6: [[22, 27], [50, 27], [78, 27], [22, 73], [50, 73], [78, 73]],
}

export function makeTile(a: number, b: number, id: string): HTMLElement {
  const el = document.createElement('div')
  el.className = 'tile'
  el.dataset.id = id
  const face = document.createElement('div')
  face.className = 'face'
  for (const v of [a, b]) {
    const h = document.createElement('div')
    h.className = 'half'
    h.dataset.v = String(v)
    for (const [x, y] of PIPS[v]) {
      const p = document.createElement('i')
      p.style.left = `${x}%`
      p.style.top = `${y}%`
      h.appendChild(p)
    }
    face.appendChild(h)
  }
  el.appendChild(face)
  return el
}

export function tf(t: T, u: number): string {
  return `translate3d(${(t.x - u).toFixed(2)}px, ${(t.y - u / 2).toFixed(2)}px, 0) rotate(${t.rot.toFixed(2)}deg) scale(${t.s.toFixed(4)})`
}

/** Hedef açıyı mevcut açıya en yakın eşdeğerine çevir (gereksiz tur atmasın). Çift taşta 180 simetrik. */
export function nearestRot(target: number, current: number, symmetric180 = false): number {
  const period = symmetric180 ? 180 : 360
  let r = target
  while (r - current > period / 2) r -= period
  while (current - r > period / 2) r += period
  return r
}

export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export function lerpT(a: T, b: T, k: number): T {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), rot: lerp(a.rot, b.rot, k), s: lerp(a.s, b.s, k), o: lerp(a.o, b.o, k) }
}
export const sameT = (a: T, b: T) =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.rot - b.rot) < 0.01 && Math.abs(a.s - b.s) < 1e-4 && Math.abs(a.o - b.o) < 1e-3

/** Kalıcı taş kaydı: mantıksal konum her an bilinir (animasyon yarıda kesilse bile oradan devam edilir). */
export class TileSprite {
  el: HTMLElement
  target: T
  private from: T
  private anim: Animation | null = null
  constructor(el: HTMLElement, t: T, private u: () => number) {
    this.el = el
    this.target = t
    this.from = t
    this.apply(t)
  }
  /** Şu anki görünen konum (animasyon sürüyorsa ara değer). */
  current(): T {
    const a = this.anim
    if (a && a.playState === 'running') {
      const p = a.effect?.getComputedTiming().progress
      if (typeof p === 'number') return lerpT(this.from, this.target, p)
    }
    return this.target
  }
  private apply(t: T) {
    this.el.style.transform = tf(t, this.u())
    this.el.style.opacity = t.o >= 0.999 ? '' : String(t.o)
  }
  /** Anında yerleştir (sürükleme, yeniden boyutlandırma, arka plan sekmesi). */
  set(t: T) {
    this.stop()
    this.target = t
    this.from = t
    this.apply(t)
  }
  stop() {
    if (this.anim) {
      this.anim.cancel()
      this.anim = null
    }
  }
  /** Görünen konumdan hedefe kay. Son durum her zaman stilde yazılıdır; animasyon yalnız görseldir. */
  moveTo(t: T, ms: number, easing = 'cubic-bezier(.2,.8,.2,1)', from?: T, delay = 0) {
    const start = from ?? this.current()
    if (!from && sameT(start, t) && sameT(this.target, t)) return
    this.stop()
    this.from = start
    this.target = t
    this.apply(t)
    if (ms <= 0) return
    const u = this.u()
    this.el.style.willChange = 'transform'
    const anim = this.el.animate(
      [
        { transform: tf(start, u), opacity: start.o },
        { transform: tf(t, u), opacity: t.o },
      ],
      { duration: ms, easing, delay, fill: 'backwards' },
    )
    this.anim = anim
    anim.onfinish = anim.oncancel = () => {
      if (this.anim === anim) {
        this.anim = null
        this.el.style.willChange = ''
      }
    }
  }
}
