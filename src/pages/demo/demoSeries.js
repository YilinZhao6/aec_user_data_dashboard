// Synthetic series for the /demo page.
//
// Values are unitless (0–1). The page never prints one, so the only thing
// that matters is the shape: a quiet plateau with a little drift and noise, a
// small dip right before the end, then a surge to the top of the chart.

const BUCKETS = {
  '12h': { count: 13, unit: 'hour', surge: 3 },
  '1d': { count: 25, unit: 'hour', surge: 4 },
  '7d': { count: 8, unit: 'day', surge: 1 },
  '30d': { count: 31, unit: 'day', surge: 3 },
}

// Deterministic PRNG, so a given range + seed always draws the same curve
// and a screenshot can be retaken.
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const two = (n) => String(n).padStart(2, '0')

export const DEMO_RANGES = Object.keys(BUCKETS)

export function buildDemoSeries(range, seed = 1) {
  const { count, unit, surge } = BUCKETS[range] ?? BUCKETS['7d']
  const rangeHash = [...range].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7)
  const rand = mulberry32(rangeHash * 7919 + seed * 104729)

  // Buckets end at "now", so the last label is always today / this hour.
  const now = new Date()
  const labels = []
  for (let i = 0; i < count; i++) {
    const at = new Date(now)
    const back = count - 1 - i
    if (unit === 'hour') {
      at.setMinutes(0, 0, 0)
      at.setHours(at.getHours() - back)
      labels.push(`${two(at.getHours())}:00`)
    } else {
      at.setDate(at.getDate() - back)
      labels.push(`${at.getMonth() + 1}/${at.getDate()}`)
    }
  }

  // Plateau: a resting level shaped by the calendar (quiet nights, quieter
  // weekends), then a fair amount of day-to-day noise on top. Real signup
  // counts jump around by a third from one day to the next; a flat line
  // reads as fake.
  const gauss = () => rand() + rand() + rand() - 1.5
  const values = []
  for (let i = 0; i < count - surge; i++) {
    const at = new Date(now)
    const back = count - 1 - i
    let shape = 1
    if (unit === 'hour') {
      at.setHours(at.getHours() - back)
      const h = at.getHours()
      // Lowest around 4am, peaking mid afternoon.
      shape = 0.55 + 0.45 * (1 + Math.cos(((h - 15) / 24) * 2 * Math.PI)) / 2
    } else {
      at.setDate(at.getDate() - back)
      const day = at.getDay()
      if (day === 0 || day === 6) shape = 0.72
    }
    values.push(clamp(0.19 * shape * Math.exp(gauss() * 0.42), 0.06, 0.34))
  }
  // A slightly soft day right before the surge, so it reads as a turn.
  values[values.length - 1] *= 0.85

  const base = values[values.length - 1]
  for (let k = 1; k <= surge; k++) {
    const t = k / surge
    values.push(base + (1 - base) * t ** 2.4)
  }

  const average = values.reduce((sum, v) => sum + v, 0) / values.length
  return { labels, values, average, ratio: values[values.length - 1] / average }
}
