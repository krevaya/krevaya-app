export function Logo({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/logo-mark.png"
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className="shrink-0 select-none"
    />
  )
}
