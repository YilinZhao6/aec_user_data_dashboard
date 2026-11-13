// Run with `npm test` (node's built-in runner; no extra dependencies).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DAY_MS,
  averageDailyActive,
  countInWindow,
  dayKeyWindow,
  distinctActive,
  formatPctChange,
  formatWindowDays,
  pctChange,
  previousWindow,
} from '../src/utils/periodCompare.ts'

const at = (iso) => Date.parse(iso)

test('previousWindow: same length, immediately before', () => {
  const cur = { startMs: at('2026-11-07T00:00:00Z'), endMs: at('2026-11-13T23:59:59.999Z') }
  const prev = previousWindow(cur, 7 * DAY_MS)
  assert.equal(new Date(prev.startMs).toISOString(), '2026-10-31T00:00:00.000Z')
  assert.equal(new Date(prev.endMs).toISOString(), '2026-11-06T23:59:59.999Z')
})

test('previousWindow: a window still filling is cut at the same moment', () => {
  // Last 7 days, today included, now = 11-13 15:00.
  const cur = { startMs: at('2026-11-07T00:00:00Z'), endMs: at('2026-11-13T15:00:00Z') }
  const prev = previousWindow(cur, 7 * DAY_MS)
  assert.equal(new Date(prev.endMs).toISOString(), '2026-11-06T15:00:00.000Z')
})

test('dayKeyWindow: custom range across a month boundary', () => {
  const w = dayKeyWindow('2026-10-25', '2026-11-03', at('2026-11-13T12:00:00Z'))
  assert.equal(w.spanMs, 10 * DAY_MS)
  const prev = previousWindow(w, w.spanMs)
  assert.equal(new Date(prev.startMs).toISOString(), '2026-10-15T00:00:00.000Z')
  assert.equal(new Date(prev.endMs).toISOString(), '2026-10-24T23:59:59.999Z')
})

test('dayKeyWindow: across a year boundary and into February', () => {
  const w = dayKeyWindow('2026-12-20', '2027-01-10', at('2027-03-01T00:00:00Z'))
  assert.equal(w.spanMs, 22 * DAY_MS)
  const feb = dayKeyWindow('2027-02-01', '2027-02-28', at('2027-03-05T00:00:00Z'))
  const prev = previousWindow(feb, feb.spanMs)
  // 28 days before Feb 1 is Jan 4 — same length, not "January".
  assert.equal(new Date(prev.startMs).toISOString().slice(0, 10), '2027-01-04')
  assert.equal(new Date(prev.endMs).toISOString().slice(0, 10), '2027-01-31')
})

test('dayKeyWindow: ending today is cut at now; missing / backwards is null', () => {
  const now = at('2026-11-13T09:30:00Z')
  const w = dayKeyWindow('2026-11-07', '2026-11-13', now)
  assert.equal(w.endMs, now)
  assert.equal(w.spanMs, 7 * DAY_MS)
  assert.equal(dayKeyWindow('', '2026-11-13', now), null)
  assert.equal(dayKeyWindow('2026-11-13', '2026-11-01', now), null)
})

test('countInWindow: inclusive on both ends', () => {
  const w = { startMs: 10, endMs: 20 }
  assert.equal(countInWindow([9, 10, 15, 20, 21], w), 3)
})

test('pctChange: normal, previous zero, missing', () => {
  assert.equal(pctChange(110, 100), 10)
  assert.equal(pctChange(90, 100), -10)
  assert.equal(pctChange(5, 0), null)
  assert.equal(pctChange(0, 0), null)
  assert.equal(pctChange(5, null), null)
  assert.equal(pctChange(undefined, 3), null)
  assert.equal(pctChange(0, 4), -100)
})

test('formatPctChange', () => {
  assert.equal(formatPctChange(12.345), '▲ 12.3%')
  assert.equal(formatPctChange(-8.06), '▼ 8.1%')
  assert.equal(formatPctChange(0.01), '0.0%')
  assert.equal(formatPctChange(null), '—')
})

test('averageDailyActive: distinct per day, empty days count as zero', () => {
  const d = (n, h = 12) => at(`2026-11-${String(n).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00Z`)
  const events = [
    { userId: 'a', t: d(1) }, { userId: 'a', t: d(1, 13) }, { userId: 'b', t: d(1) },
    { userId: 'a', t: d(2) },
    // day 3 nobody
    { userId: 'c', t: d(5) }, // outside
  ]
  const w = { startMs: at('2026-11-01T00:00:00Z'), endMs: at('2026-11-03T23:59:59Z') }
  assert.equal(averageDailyActive(events, w), (2 + 1 + 0) / 3)
  assert.equal(distinctActive(events, w), 2)
})

test('formatWindowDays', () => {
  assert.equal(formatWindowDays({ startMs: at('2026-10-31T00:00:00Z'), endMs: at('2026-11-06T23:00:00Z') }), '10-31→11-06')
})
