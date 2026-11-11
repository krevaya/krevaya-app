// Easing curves: take progress 0..1, return eased progress (may overshoot for back/elastic).

export type Easing = (t: number) => number

const c1 = 1.70158
const c3 = c1 + 1

function outBounce(t: number) {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - (1 - t) ** 3,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outQuart: (t: number) => 1 - (1 - t) ** 4,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outSine: (t: number) => Math.sin((t * Math.PI) / 2),
  inBack: (t: number) => c3 * t * t * t - c1 * t * t,
  outBack: (t: number) => 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2,
  outElastic: (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1
  },
  outBounce,
  /** Snap to n even steps, for typewriter-style reveals. */
  steps: (n: number): Easing => (t) => Math.min(1, Math.floor(t * n + 1e-6) / n),
} satisfies Record<string, Easing | ((n: number) => Easing)>

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
