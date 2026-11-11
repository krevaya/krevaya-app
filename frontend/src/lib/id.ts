export function uid(len = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  let out = ''
  for (const b of bytes) out += (b % 36).toString(36)
  return out
}
