import { createContext, useContext } from 'react'

import type { ArtPrinting } from '../../app/use-card-art-options'
import { formatUsd } from '../../app/utils'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { cx } from '../ui/cx'

/** De qué impresión es el arte que se ve ahora en el detalle: el panel de la carta (`CardPanelHeader`) lo muestra, así cambiar de arte cambia también lo que dice. */
export const SelectedPrintingContext = createContext<ArtPrinting | undefined>(undefined)

export const useSelectedPrinting = () => useContext(SelectedPrintingContext)

/**
 * Lo que cambia de una impresión a otra de la misma carta: la rareza (y el arte especial, si lo tiene), el set con su código y a cuánto está cada edición en
 * TCGplayer. Sin impresión (los artes de YGOPRODeck son sólo otro dibujo de la carta) no hay nada que mostrar. Se anuncia al cambiar de arte (`aria-live`).
 */
export function PrintingInfo({ printing, className }: { printing: ArtPrinting | undefined; className?: string }) {
  return (
    <div role="group" aria-label={t('search.printing.label')} aria-live="polite" className={cx('grid gap-1', !printing && 'hidden', className)}>
      {printing ? (
        <>
          <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge size="sm" tone="neutral">
              {printing.rarity}
            </Badge>
            {printing.variant ? (
              <Badge size="sm" tone="info" shape="tag">
                {printing.variant}
              </Badge>
            ) : null}
          </p>
          <p className="m-0 text-body text-muted [overflow-wrap:anywhere]">
            {printing.code} · {printing.set}
          </p>
          <p className="m-0 text-body text-muted">
            {printing.editions.map((entry) => `${entry.edition} ${entry.market === null ? t('search.prices.noPrice') : formatUsd(entry.market)}`).join(' · ')}
          </p>
        </>
      ) : null}
    </div>
  )
}
