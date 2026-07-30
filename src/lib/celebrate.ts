/**
 * Confetti, hand-rolled.
 *
 * No library: a strict-CSP static page plus ~100 lines of canvas beats adding a
 * dependency, and the party polish costs nothing at install time.
 *
 * There is deliberately NO sound anywhere in this app. Ten people on a video
 * call do not need it, and it is one less thing to go wrong live.
 */

const COLORS = ['#FF5D5D', '#14B8A6', '#FFB020', '#8B5CF6', '#38BDF8']

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vrot: number
  w: number
  h: number
  color: string
}

let running = false

/** Bir kereye mahsus konfeti patlaması. */
export function fireConfetti(count = 140) {
  if (reducedMotion() || running) return
  running = true

  const canvas = document.createElement('canvas')
  canvas.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999'
  document.body.appendChild(canvas)

  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    canvas.remove()
    running = false
    return
  }
  ctx.scale(dpr, dpr)

  const W = window.innerWidth
  const H = window.innerHeight
  const pieces: Piece[] = Array.from({ length: count }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.5,
    y: H * 0.35 + (Math.random() - 0.5) * 80,
    vx: (Math.random() - 0.5) * 11,
    vy: Math.random() * -13 - 4,
    rot: Math.random() * Math.PI,
    vrot: (Math.random() - 0.5) * 0.3,
    w: 7 + Math.random() * 6,
    h: 10 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }))

  let frame = 0
  const MAX_FRAMES = 260

  function tick() {
    frame += 1
    ctx!.clearRect(0, 0, W, H)
    for (const p of pieces) {
      p.vy += 0.32 // gravity
      p.vx *= 0.995 // drag
      p.x += p.vx
      p.y += p.vy
      p.rot += p.vrot
      ctx!.save()
      ctx!.translate(p.x, p.y)
      ctx!.rotate(p.rot)
      ctx!.fillStyle = p.color
      ctx!.globalAlpha = Math.max(0, 1 - frame / MAX_FRAMES)
      ctx!.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx!.restore()
    }
    if (frame < MAX_FRAMES) {
      requestAnimationFrame(tick)
    } else {
      canvas.remove()
      running = false
    }
  }
  requestAnimationFrame(tick)
}
