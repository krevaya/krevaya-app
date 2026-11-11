import { expect, test } from '@playwright/test'
import { newGuestDesign, openTool, waitForEditor, waitForGuestSave } from './helpers'

const sounds = [
  { title: 'Slow sketch', ref: 'bed:slow-sketch' },
  { title: 'Line work', ref: 'bed:line-work' },
  { title: 'Paper lift', ref: 'cue:paper-lift' },
  { title: 'Small signal', ref: 'cue:small-signal' },
  { title: 'Last mark', ref: 'cue:last-mark' },
]

test('the five built-in sounds render without silence, invalid samples or clipping', async ({ page }) => {
  await newGuestDesign(page)
  const results = await page.evaluate(async (sounds) => {
    const path = '/src/audio/builtin.ts'
    const { BED_ITEMS, CUE_ITEMS, synthBuiltin } = await import(path) as typeof import('../src/audio/builtin')
    const catalog = [...BED_ITEMS, ...CUE_ITEMS].map((s) => ({ title: s.title, ref: s.ref }))
    const results = []
    for (const { ref } of sounds) {
      const buf = await synthBuiltin(ref)
      let finite = true, peak = 0, squares = 0
      for (let c = 0; c < buf.numberOfChannels; c++) {
        for (const v of buf.getChannelData(c)) {
          finite &&= Number.isFinite(v)
          peak = Math.max(peak, Math.abs(v))
          squares += v * v
        }
      }
      results.push({ ref, finite, peak, rms: Math.sqrt(squares / (buf.length * buf.numberOfChannels)), channels: buf.numberOfChannels, seconds: buf.duration })
    }
    return { catalog, renders: results }
  }, sounds)

  expect(results.catalog).toEqual(sounds)
  for (const r of results.renders) {
    expect(r.finite, r.ref).toBe(true)
    expect(r.channels, r.ref).toBe(2)
    expect(r.seconds, r.ref).toBeGreaterThan(0)
    expect(r.peak, r.ref).toBeGreaterThan(0.01)
    expect(r.peak, r.ref).toBeLessThanOrEqual(0.901)
    expect(r.rms, r.ref).toBeGreaterThan(0.0001)
  }
})

test('current sound IDs survive saving and still mix after reloading', async ({ page }) => {
  await newGuestDesign(page, 'Presentation')
  const panel = await openTool(page, 'Audio')
  for (const s of sounds.filter((s) => s.ref.startsWith('bed:'))) {
    await panel.getByRole('button', { name: `Add ${s.title}`, exact: true }).click()
  }
  await panel.getByRole('tab', { name: 'Sound effects', exact: true }).click()
  for (const s of sounds.filter((s) => s.ref.startsWith('cue:'))) {
    await panel.getByRole('button', { name: `Add ${s.title}`, exact: true }).click()
  }

  const tracks = () => page.evaluate(() => {
    const doc = (window as any).__ka.editor.getState().doc.getSnapshot()
    return doc.settings.audio.map((t: { name: string; preset: string }) => ({ title: t.name, ref: t.preset }))
  })
  await expect.poll(tracks).toEqual(sounds)
  await waitForGuestSave(page)
  await page.reload()
  await waitForEditor(page)
  await expect.poll(tracks).toEqual(sounds)

  const mix = await page.evaluate(async () => {
    const path = '/src/audio/mix.ts'
    const { renderDesignAudio } = await import(path) as typeof import('../src/audio/mix')
    const doc = (window as any).__ka.editor.getState().doc.getSnapshot()
    const buf = await renderDesignAudio(doc, 2000, 16000)
    if (!buf) return null
    let peak = 0, finite = true
    for (let c = 0; c < buf.numberOfChannels; c++) {
      for (const v of buf.getChannelData(c)) {
        peak = Math.max(peak, Math.abs(v))
        finite &&= Number.isFinite(v)
      }
    }
    return { peak, finite, frames: buf.length, channels: buf.numberOfChannels }
  })
  expect(mix).toMatchObject({ finite: true, frames: 32000, channels: 2 })
  expect(mix!.peak).toBeGreaterThan(0.01)
  expect(mix!.peak).toBeLessThanOrEqual(0.981)
})
