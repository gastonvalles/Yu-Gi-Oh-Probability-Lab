import type { ReactNode } from 'react'

import type { ArtChoice } from '../../app/use-card-art-options'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardOverlay, CardPanelBody, CardPanelFooter, CardPanelHeader } from './CardOverlay'
import { buildCardSummary } from './card-summary'

interface CardDetailOverlayProps {
  name: string
  card: ApiCardReference | null
  origin?: DOMRect | null
  metadata?: ReactNode
  actions?: ReactNode
  /** El arte con el que se abre (p. ej. el de la impresión que se tocó en una expansión). */
  initialArt?: Pick<ArtChoice, 'id' | 'imageUrl'>
  onClose: () => void
}

/** Detalle compartido de una carta: su texto y, si corresponde, las acciones para sumarla al deck. */
export function CardDetailOverlay({ name, card, origin = null, metadata, actions, initialArt, onClose }: CardDetailOverlayProps) {
  const summary = card ? buildCardSummary(card) : null

  return (
    <CardOverlay ariaLabel={t('search.detail.aria', { name })} panelLabel={t('search.detail.panel')} name={name} card={card} origin={origin} initialArt={initialArt} onClose={onClose}>
      <CardPanelHeader title={name} lines={[summary ? `${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}` : null, metadata]} />
      <CardPanelBody label={t('search.detail.effect')} className="text-lead">
        <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{card?.description?.trim() || t('search.detail.noText')}</p>
      </CardPanelBody>
      {actions ? <CardPanelFooter>{actions}</CardPanelFooter> : null}
    </CardOverlay>
  )
}
