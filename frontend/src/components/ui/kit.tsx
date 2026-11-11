import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type BtnVariant = 'primary' | 'accent' | 'outline' | 'ghost' | 'danger' | 'soft'
type BtnSize = 'sm' | 'md' | 'lg'

const variants: Record<BtnVariant, string> = {
  primary: 'bg-ink text-surface hover:opacity-90 border border-transparent',
  accent: 'bg-accent text-white hover:bg-accent-mid border border-transparent shadow-[0_8px_22px_-8px_rgba(97,43,211,0.3)]',
  outline: 'bg-surface text-ink border border-line-2 hover:bg-hover',
  ghost: 'bg-transparent text-ink-2 border border-transparent hover:bg-hover',
  danger: 'bg-surface text-danger border border-line-2 hover:bg-red-50',
  soft: 'bg-accent-wash text-accent border border-accent-line hover:border-accent-soft',
}
const sizes: Record<BtnSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-control',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-control',
}

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: BtnSize }>(
  function Button({ variant = 'outline', size = 'md', className, ...rest }, ref) {
    return (
      <button
        ref={ref}
        className={cx('inline-flex items-center justify-center font-medium whitespace-nowrap transition disabled:opacity-45', variants[variant], sizes[size], className)}
        {...rest}
      />
    )
  },
)

export const GlyphButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string; size?: 'sm' | 'md' }>(
  function GlyphButton({ active, label, size = 'md', className, children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        aria-pressed={active}
        className={cx(
          'inline-flex items-center justify-center rounded-[10px] border transition disabled:opacity-40',
          size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
          active ? 'bg-accent-wash border-accent-line text-accent' : 'border-transparent text-ink-2 hover:bg-hover',
          className,
        )}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

export function Chip({ active, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={cx(
        'h-8 px-3 rounded-full text-[13px] border whitespace-nowrap transition',
        active ? 'bg-accent-wash border-accent-line text-accent font-medium' : 'bg-surface border-line-2 text-ink-2 hover:border-faint',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(function Input(
  { icon, className, ...rest },
  ref,
) {
  return (
    <label className={cx('relative flex items-center', className)}>
      {icon && <span className="absolute left-3.5 text-faint pointer-events-none">{icon}</span>}
      <input
        ref={ref}
        className={cx(
          'w-full h-10 rounded-control border border-line-2 bg-surface text-ink text-sm placeholder:text-faint outline-none transition focus:border-accent-soft focus:shadow-ring',
          icon ? 'pl-10 pr-3' : 'px-3',
        )}
        {...rest}
      />
    </label>
  )
})

export function ChoiceRow<T extends string>({ value, options, onChange, className }: {
  value: T
  options: Array<{ value: T; label: ReactNode }>
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div className={cx('flex p-1 rounded-control bg-surface-2 border border-line', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex-1 h-8 rounded-[9px] text-[13px] inline-flex items-center justify-center gap-1.5 transition',
            value === o.value ? 'bg-surface text-accent font-medium shadow-card border border-line' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Slider({ label, value, min, max, step = 1, onChange, onCommit, suffix }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
  onCommit?: () => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-ink-2">{label}</span>
        <input
          type="number"
          value={Math.round(value * 100) / 100}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          onBlur={onCommit}
          aria-label={label}
          className="w-14 h-7 text-right text-[12px] rounded-lg border border-line bg-surface px-1.5 tabular-nums"
        />
        {suffix && <span className="sr-only">{suffix}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        className="w-full"
      />
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-[13px] text-ink-2 cursor-pointer select-none">
      <span>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx('relative w-9 h-5 rounded-full transition', checked ? 'bg-accent' : 'bg-line-2')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </button>
    </label>
  )
}

export function SectionLabel({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mt-5 mb-2">
      <h3 className="text-[13px] font-semibold text-ink">{children}</h3>
      {action}
    </div>
  )
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-card border border-line bg-surface shadow-card', className)}>{children}</div>
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-4 w-4 rounded-full border-2 border-line-2 border-t-accent animate-spin', className)} />
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {children && <p className="text-[12px] text-muted mt-1 leading-relaxed">{children}</p>}
    </div>
  )
}
