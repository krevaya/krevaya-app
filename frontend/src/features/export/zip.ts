import { strToU8, zip, type Zippable } from 'fflate'

/** Pack files into a zip. PNG/JPG are already compressed, so those are just stored. */
export async function zipFiles(files: Array<{ name: string; data: Blob | string }>, compress: boolean): Promise<Blob> {
  const entries: Zippable = {}
  for (const f of files) {
    const bytes = typeof f.data === 'string' ? strToU8(f.data) : new Uint8Array(await f.data.arrayBuffer())
    entries[f.name] = [bytes, { level: compress ? 6 : 0 }]
  }
  const out = await new Promise<Uint8Array>((resolve, reject) => zip(entries, (err, data) => (err ? reject(err) : resolve(data))))
  return new Blob([out as BlobPart], { type: 'application/zip' })
}
