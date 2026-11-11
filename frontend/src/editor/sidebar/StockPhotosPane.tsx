import { Icon } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/api/client'
import { Chip, Empty, Input, ChoiceRow, Spinner } from '@/components/ui/kit'
import { MasonryGrid } from '@/features/photos/MasonryGrid'
import { PHOTO_MIME, placePhoto, type PhotoDrag } from '@/features/photos/media'
import { useAuth } from '@/stores/auth'

type Provider = 'unsplash' | 'pexels'
type StockPhoto = {
  id: string
  thumb: string
  url: string
  full: string
  width: number
  height: number
  author: string
  link: string
  download: string | null
}

const NAMES: Record<Provider, string> = { unsplash: 'Unsplash', pexels: 'Pexels' }
const IDEAS = ['Nature', 'Coffee', 'Office', 'Mountains', 'Flowers', 'City', 'Food', 'Texture', 'Ocean', 'Abstract']

let configCache: Provider[] | null = null

export default function StockPhotosPane() {
  const user = useAuth((s) => s.user)
  const [providers, setProviders] = useState<Provider[] | null>(configCache)
  const [offline, setOffline] = useState(false)
  const [provider, setProvider] = useState<Provider | null>(configCache?.[0] ?? null)
  const [draft, setDraft] = useState('')
  const [q, setQ] = useState('nature')
  const [photos, setPhotos] = useState<StockPhoto[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (configCache) return
    api<{ photos: Provider[] }>('/api/stock/config')
      .then((c) => {
        configCache = c.photos
        setProviders(c.photos)
        setProvider(c.photos[0] ?? null)
      })
      .catch(() => {
        setOffline(true)
        setProviders([])
      })
  }, [])

  // New search: start over.
  useEffect(() => {
    setPhotos([])
    setPage(1)
    setDone(false)
    setError(null)
  }, [q, provider])

  useEffect(() => {
    if (!provider || !user || done) return
    const id = ++seq.current
    setLoading(true)
    api<{ provider: Provider; photos: StockPhoto[] }>(
      `/api/stock/photos?q=${encodeURIComponent(q)}&page=${page}&provider=${provider}`,
    )
      .then((r) => {
        if (id !== seq.current) return
        setPhotos((prev) => {
          const seen = new Set(prev.map((p) => p.id))
          return [...prev, ...r.photos.filter((p) => !seen.has(p.id))]
        })
        if (r.photos.length === 0) setDone(true)
      })
      .catch((e: Error) => {
        if (id !== seq.current) return
        setError(e instanceof ApiError && e.status === 401 ? 'Your session ended. Sign in again to keep searching.' : "Couldn't load photos right now. Try again in a moment.")
        setDone(true)
      })
      .finally(() => id === seq.current && setLoading(false))
  }, [q, provider, page, user, done])

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !loading && !done && photos.length) setPage((p) => p + 1)
    }, { rootMargin: '400px' })
    io.observe(el)
    return () => io.disconnect()
  }, [loading, done, photos.length])

  if (providers === null) return <div className="py-10 flex justify-center"><Spinner /></div>

  if (!providers.length) {
    return (
      <Empty title={offline ? "Stock photos aren't available offline" : 'Stock photo search is switched off'}>
        {offline
          ? 'Connect to a Krevaya server to search free photos. You can still use your own uploads.'
          : 'The server admin can add an Unsplash or Pexels API key to turn on free photo search. Your own uploads still work.'}
      </Empty>
    )
  }

  const submit = () => {
    const v = draft.trim()
    if (v) setQ(v)
  }

  return (
    <div className="flex flex-col">
      <form onSubmit={(e) => (e.preventDefault(), submit())}>
        <Input icon={<Icon name="search" size={16} />} placeholder="Search photos" value={draft} onChange={(e) => setDraft(e.target.value)} />
      </form>
      {providers.length > 1 && provider && (
        <ChoiceRow
          className="mt-3"
          value={provider}
          options={providers.map((p) => ({ value: p, label: NAMES[p] }))}
          onChange={setProvider}
        />
      )}
      <div className="flex flex-wrap gap-1.5 mt-3">
        {IDEAS.map((i) => (
          <Chip key={i} active={q.toLowerCase() === i.toLowerCase()} onClick={() => (setDraft(''), setQ(i.toLowerCase()))}>{i}</Chip>
        ))}
      </div>
      <div className="mt-3">
        {!user ? (
          <Empty title="Stock search opens up after you sign in">It comes with every free account. Your own photos work in the meantime, under Uploads.</Empty>
        ) : (
          <>
            <MasonryGrid
              items={photos}
              ratio={(p) => p.height / p.width}
              render={(p) => <PhotoTile key={p.id} p={p} provider={provider!} />}
            />
            {!loading && photos.length === 0 && !error && <Empty title="No photos found">Try a different word.</Empty>}
            {error && <p className="text-[12px] text-muted mt-3 text-center" role="alert">{error}</p>}
            <div ref={sentinel} className="h-10 flex items-center justify-center">{loading && <Spinner />}</div>
            {photos.length > 0 && provider && (
              <p className="text-[11px] text-faint text-center">Photos from {NAMES[provider]}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function PhotoTile({ p, provider }: { p: StockPhoto; provider: Provider }) {
  const drag: PhotoDrag = { src: p.url, width: p.width, height: p.height, track: provider === 'unsplash' ? p.download : null }
  const utm = provider === 'unsplash' ? '?utm_source=krevaya-app&utm_medium=referral' : ''
  return (
    <div className="group relative rounded-tile overflow-hidden border border-line bg-surface-2">
      <button
        className="block w-full"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(PHOTO_MIME, JSON.stringify(drag))
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={() => placePhoto(drag)}
        aria-label={`Photo by ${p.author}`}
      >
        <img src={p.thumb} alt="" loading="lazy" className="block w-full h-auto" style={{ aspectRatio: `${p.width} / ${p.height}` }} />
      </button>
      <div className="absolute inset-x-0 bottom-0 px-2 pt-5 pb-1.5 bg-gradient-to-t from-black/65 to-transparent text-[11px] text-white/95 leading-tight opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition pointer-events-none">
        Photo by{' '}
        <a href={p.link + utm} target="_blank" rel="noreferrer" className="underline pointer-events-auto">{p.author}</a>
        {' '}on{' '}
        <a href={(provider === 'unsplash' ? 'https://unsplash.com/' : 'https://www.pexels.com/') + utm} target="_blank" rel="noreferrer" className="underline pointer-events-auto">{NAMES[provider]}</a>
      </div>
    </div>
  )
}
