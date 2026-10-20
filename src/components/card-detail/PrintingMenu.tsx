import type { ArtChoice, ArtPrinting } from '../../app/use-card-art-options'
import { formatUsd } from '../../app/utils'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Icon } from '../ui/Icon'
import { cx } from '../ui/cx'

/** A cuánto está la impresión: el primer precio que se conoce de sus ediciones (1ª edición, Unlimited…), o nada. */
function priceOf(printing: ArtPrinting): string | null {
  const known = printing.editions.find((entry) => entry.market !== null)

  return known?.market == null ? null : formatUsd(known.market)
}

/** El arte de una impresión dicho en una línea: su código, la rareza, el arte especial si lo tiene y el precio. */
function PrintingLine({ printing }: { printing: ArtPrinting }) {
  const price = priceOf(printing)

  return (
    <>
      <span className="font-semibold text-foreground">{printing.code}</span>
      <Badge size="sm" tone="brand">
        {printing.rarity}
      </Badge>
      {printing.variant ? <span className="text-muted">· {printing.variant}</span> : null}
      {price ? <span className="ml-auto font-semibold text-foreground">{price}</span> : null}
    </>
  )
}

interface PrintingMenuProps {
  arts: readonly ArtChoice[]
  /** El arte que se ve ahora (si es de una impresión, el chip dice cuál). */
  artId: string | null
  open: boolean
  onOpen: (open: boolean) => void
  onPick: (artId: string) => void
}

/**
 * La impresión que se ve en la carta grande, arriba a la izquierda (código, rareza, arte especial y precio), y con un toque la lista de todas las de esa carta con su precio para pasar de una a otra sin salir del zoom.
 * Sin impresiones (todavía no llegaron o la carta no tiene) no se muestra. El fondo del zoom la cierra antes que al zoom, y Escape también.
 */
export function PrintingMenu({ arts, artId, open, onOpen, onPick }: PrintingMenuProps) {
  const printings = arts.filter((art) => art.printing)

  if (printings.length === 0) return null

  const selected = printings.find((art) => art.id === artId)?.printing

  return (
    <div className="absolute left-[max(0.5rem,env(safe-area-inset-left))] top-[max(0.5rem,env(safe-area-inset-top))] z-10 cursor-auto" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('search.zoom.printings')}
        title={t('search.zoom.printings')}
        className="flex min-h-11 max-w-[calc(100vw-5rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-border bg-card-background/92 px-4 py-1.5 text-body text-muted shadow-overlay transition-colors hover:bg-card-background focus-visible:outline-none focus-visible:shadow-focus"
        onClick={() => onOpen(!open)}
      >
        {selected ? <PrintingLine printing={selected} /> : <span className="text-foreground">{t('search.zoom.printings')}</span>}
        <Icon name="chevron-down" size={14} className={cx('transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div role="listbox" aria-label={t('search.zoom.printings')} className="mt-2 grid max-h-[60dvh] w-[min(24rem,calc(100vw-2rem))] gap-1 overflow-y-auto overscroll-contain rounded-card border border-border bg-card-background/98 p-1 shadow-overlay">
          {printings.map((art) => (
            <button
              key={art.id}
              type="button"
              role="option"
              aria-selected={art.id === artId}
              className={cx(
                'flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1 rounded-control px-3 py-2 text-left text-body text-muted transition-colors hover:bg-tint/10 focus-visible:outline-none focus-visible:shadow-focus',
                art.id === artId && 'bg-primary/14',
              )}
              onClick={() => {
                onPick(art.id)
                onOpen(false)
              }}
            >
              <PrintingLine printing={art.printing!} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
