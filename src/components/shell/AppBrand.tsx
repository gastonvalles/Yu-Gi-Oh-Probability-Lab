import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

/** La marca de la app: cuadrito violeta con el ícono de cartas y el nombre (con el menú contraído, sólo el cuadrito). */
export function AppBrand({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <div className={cx('flex min-w-0 items-center gap-2.5', className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-control bg-linear-to-br from-primary-hover to-[#6a00b3] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_6px_16px_rgb(var(--primary-rgb)/0.35)]">
        <Icon name="cards" size={20} strokeWidth={1.9} />
      </span>
      {collapsed ? null : (
        <span className="grid min-w-0 leading-tight">
          <span className="truncate text-body font-bold tracking-[-0.01em] text-foreground">Probability Lab</span>
          <span className="text-micro text-soft">Yu-Gi-Oh!</span>
        </span>
      )}
    </div>
  )
}
