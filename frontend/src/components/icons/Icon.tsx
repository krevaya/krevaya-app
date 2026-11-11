import type { Mark } from './marks'
import { RAIL_ICONS } from './rail-paths'
import { UI_ICONS } from './ui-paths'

export type IconName = keyof typeof UI_ICONS
export type RailIconName = keyof typeof RAIL_ICONS

type Props = {
  size?: number
  className?: string
  /** paint the outline solid too, e.g. a filled play button */
  filled?: boolean
  /** when set the icon is announced; otherwise it's hidden from screen readers */
  'aria-label'?: string
}

function Glyph({ marks, size = 16, className, filled, 'aria-label': label }: Props & { marks: readonly Mark[] }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {marks.map((m, i) => {
        const { d, fill, w, o, turn }: Exclude<Mark, string> = typeof m === 'string' ? { d: m } : m
        return (
          <path
            key={i}
            d={d}
            fill={fill || filled ? 'currentColor' : undefined}
            stroke={fill ? 'none' : undefined}
            strokeWidth={w}
            opacity={o}
            transform={turn ? `rotate(${turn} 12 12)` : undefined}
          />
        )
      })}
    </svg>
  )
}

/** general interface icon: toolbars, menus, panels, dialogs, dashboard */
export function Icon({ name, ...rest }: Props & { name: IconName }) {
  return <Glyph marks={UI_ICONS[name]} {...rest} />
}

/** the editor tool rail's own set */
export function RailIcon({ name, size = 20, ...rest }: Props & { name: RailIconName }) {
  return <Glyph marks={RAIL_ICONS[name]} size={size} {...rest} />
}
