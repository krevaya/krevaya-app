export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

let shareToken = ''
let shareUnlock = ''

/** Requests made from a shared link carry its token so the server knows what we may do. */
export function useShareToken(token: string, unlock = '') {
  shareToken = token
  shareUnlock = unlock
}

export function shareParams(): string {
  return shareToken ? `share=${encodeURIComponent(shareToken)}` : ''
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json')
    init.body = JSON.stringify(init.json)
  }
  if (shareToken) headers.set('x-share-token', shareToken)
  if (shareUnlock) headers.set('x-share-unlock', shareUnlock)
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (!res.ok) {
    let msg = res.statusText
    try {
      const body = await res.json()
      msg = typeof body.detail === 'string' ? body.detail : Array.isArray(body.detail) ? body.detail[0]?.msg ?? msg : msg
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, msg)
  }
  const type = res.headers.get('content-type') ?? ''
  if (type.includes('application/json')) return (await res.json()) as T
  return (await res.arrayBuffer()) as T
}

export async function upload<T = unknown>(path: string, file: Blob, fields: Record<string, string> = {}, name = 'file.bin'): Promise<T> {
  const form = new FormData()
  form.append('file', file, (file as File).name ?? name)
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return api<T>(path, { method: 'POST', body: form })
}

export type DesignMeta = {
  id: string
  title: string
  width: number
  height: number
  page_count: number
  thumbnail: string
  is_template: boolean
  template_category: string
  template_order?: number
  updated_at: string
  created_at: string
  deleted_at?: string | null
  role?: string
}

export type User = {
  id: string
  email: string
  name: string
  is_admin: boolean
  email_verified: boolean
  has_password: boolean
  prefs: Record<string, unknown>
}
