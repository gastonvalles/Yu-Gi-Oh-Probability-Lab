import type { ReactNode } from 'react'

import type { ApiCardReference } from '../../types'
import { CardOverlay, CardPanelBody, CardPanelFooter, CardPanelHeader } from './CardOverlay'
import { buildCardSummary } from './card-summary'

interface CardDetailOverlayProps {
  name: string
  card: ApiCardReference | null
  origin?: DOMRect | null
  metadata?: ReactNode
  actions?: ReactNode
  onClose: () => void
}

/** Detalle compartido de una carta: su texto y, si corresponde, las acciones para sumarla al deck. */
export function CardDetailOverlay({ name, card, origin = null, metadata, actions, onClose }: CardDetailOverlayProps) {
  const summary = card ? buildCardSummary(card) : null

  return (
    <CardOverlay ariaLabel={`Detalle de ${name}`} panelLabel="Texto de la carta" name={name} card={card} origin={origin} onClose={onClose}>
      <CardPanelHeader title={name} lines={[summary ? `${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}` : null, metadata]} />
      <CardPanelBody label="Efecto" className="text-lead">
        <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{card?.description?.trim() || 'Sin texto disponible.'}</p>
      </CardPanelBody>
      {actions ? <CardPanelFooter>{actions}</CardPanelFooter> : null}
    </CardOverlay>
  )
}
