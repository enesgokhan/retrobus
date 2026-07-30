/**
 * Confetti and reveal sounds, hand-rolled.
 *
 * No library: a strict-CSP static page plus ~200 lines of canvas beats adding a
 * dependency, and this way the party polish costs nothing at install time.
 *
 * Both effects respect prefers-reduced-motion, and sound is opt-in per device
 * (stored in localStorage) because ten people unmuting at once on a video call
 * is a genuinely bad experience.
 */

const SOUND_KEY = 'retrobus.sound'
const COLORS = ['#FF5D5D', '#14B8A6', '#FFB020', '#8B5CF6', '#38BDF8']

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

export function soundEnabled(): boolean {
  return localStorage.getItem(SOUND_KEY) === 'on'
}

export function setSoundEnabled(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
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

// --- sound ---

let audioCtx: AudioContext | null = null

function ctxFor(): AudioContext | null {
  if (!soundEnabled()) return null
  try {
    audioCtx ??= new AudioContext()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
    return audioCtx
  } catch {
    return null
  }
}

function blip(freq: number, start: number, dur: number, gain = 0.06) {
  const ac = ctxFor()
  if (!ac) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = 'triangle'
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, ac.currentTime + start)
  g.gain.linearRampToValueAtTime(gain, ac.currentTime + start + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur)
  osc.connect(g).connect(ac.destination)
  osc.start(ac.currentTime + start)
  osc.stop(ac.currentTime + start + dur + 0.02)
}

/** Yükselen üçlü — bir şey açıldığında. */
export function playReveal() {
  blip(523, 0, 0.18)
  blip(659, 0.09, 0.18)
  blip(784, 0.18, 0.3)
}

/** Kısa onay — cevap/kart kaydedildiğinde. */
export function playConfirm() {
  blip(880, 0, 0.09, 0.045)
}

/** Zaman doldu. */
export function playTimeUp() {
  blip(392, 0, 0.16, 0.05)
  blip(294, 0.14, 0.28, 0.05)
}
