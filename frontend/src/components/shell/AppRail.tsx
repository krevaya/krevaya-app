import { Icon, RailIcon } from '@/components/icons'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { cx } from '@/components/ui/kit'
import { useAuth } from '@/stores/auth'
import { Logo } from './Logo'

function RailLink({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        'w-[68px] py-2.5 flex flex-col items-center gap-1.5 rounded-card text-[11px] transition',
        active ? 'bg-accent-wash text-accent font-medium' : 'text-ink-2 hover:bg-hover',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  )
}

export function AppRail({ editor = false }: { editor?: boolean }) {
  const [loc] = useLocation()
  const user = useAuth((s) => s.user)
  const initial = (user?.name || user?.email || 'G').slice(0, 1).toUpperCase()
  return (
    <nav className="w-[84px] shrink-0 h-full flex flex-col items-center border-r border-line bg-surface" aria-label="Main">
      <Link href="/" className="h-[68px] w-full flex items-center justify-center border-b border-line" aria-label="Home">
        <Logo size={44} />
      </Link>
      <div className="flex flex-col items-center gap-1 pt-4 flex-1">
        <RailLink href="/" icon={<Icon name="plus" size={22} />} label="Create" active={loc === '/'} />
        <RailLink href="/designs" icon={<Icon name="layers" size={22} />} label="Designs" active={loc === '/designs' || editor} />
        <RailLink href="/templates" icon={<RailIcon name="templates" size={22} />} label="Templates" active={loc === '/templates'} />
        <RailLink href="/brand" icon={<Icon name="palette" size={22} />} label="Brand" active={loc === '/brand'} />
        <RailLink href="/trash" icon={<Icon name="trash" size={22} />} label="Trash" active={loc === '/trash'} />
      </div>
      <div className="flex flex-col items-center gap-2 pb-4 pt-3 border-t border-line w-[68px]">
        <RailLink href="/settings" icon={<Icon name="settings" size={20} />} label="Settings" active={loc === '/settings'} />
        <Link
          href={user ? '/settings' : '/login'}
          title={user ? user.email : 'Sign in'}
          className="h-10 w-10 rounded-full bg-ink text-surface flex items-center justify-center text-[15px] font-semibold ring-2 ring-surface shadow"
        >
          {user ? initial : <Icon name="user" size={16} />}
        </Link>
      </div>
    </nav>
  )
}
