import { cx } from '../ui/cx'

/** Círculo "A" / "B" que identifica cada build del comparador. */
export function SideBadge({ side }: { side: 'A' | 'B' }) {
  return (
    <span
      className={cx(
        'inline-grid size-[1.6rem] flex-none place-items-center rounded-full text-[0.78rem] font-extrabold',
        side === 'A' ? 'bg-primary/85 text-white' : 'bg-success/85 text-[#06140e]',
      )}
    >
      {side}
    </span>
  )
}
