import { t } from '../../i18n'
import type { CardTextHighlight } from '../../app/card-text'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { CardEffectText } from '../card-detail/CardEffectText'
import { CardEffectTraits } from '../card-detail/CardEffectTraits'
import { CardPanelBody } from '../card-detail/CardOverlay'
import { buildCardSummary } from '../card-detail/card-summary'
import { CARD_BACK } from '../probability/practice-styles'
import { Heading } from '../ui/Heading'
import { useRivalCard } from './RivalCardDetail'

/** Lo que muestra el detalle fijo: una carta que se conoce (la tuya) o una del rival por su id real (se pide por su número), y una boca abajo de la que no se sabe nada. */
export type CardPeek = { name: string; card: ApiCardReference | null } | { drawId: string } | { faceDown: true }

/**
 * El detalle de la carta que tocaste, siempre a la vista a la izquierda de la mesa en un duelo de pantalla ancha (desde 1440 px: con menos no entra junto al chat; ahí queda «Ver carta» del menú) (Gastón, 2026-10-19: «siempre que haga un click sobre una carta veré el detalle del lado izquierdo»):
 * la carta grande y, debajo, su nombre, su tipo y su efecto. No es un modal: no tapa la mesa y la mesa no se mueve cuando cambia (la columna está siempre, vacía hasta que se toca la primera).
 */
export function DuelCardDock({ peek, highlight = null }: { peek: CardPeek | null; /** Un pedazo del texto de la carta que se resalta (la frase del efecto que se está eligiendo en el menú): sólo si es el texto de la carta que se ve. */ highlight?: CardTextHighlight | null }) {
  if (peek === null) {
    return <p className="m-0 my-auto px-4 text-center text-body text-soft">{t('duel.dock.empty')}</p>
  }

  if ('faceDown' in peek) {
    return <CardPeekView name={t('duel.dock.faceDown')} card={null} back />
  }

  return 'drawId' in peek ? <RivalPeek key={peek.drawId} drawId={peek.drawId} /> : <CardPeekView name={peek.name} card={peek.card} highlight={highlight} />
}

function RivalPeek({ drawId }: { drawId: string }) {
  const card = useRivalCard(drawId)

  return <CardPeekView name={card?.name ?? t('duel.mark.rivalCard')} card={card} />
}

function CardPeekView({ name, card, back = false, highlight = null }: { name: string; card: ApiCardReference | null; back?: boolean; highlight?: CardTextHighlight | null }) {
  const summary = card ? buildCardSummary(card) : null
  // El texto se muestra sin los espacios de los bordes: el pedazo señalado se corre lo que se sacó del principio.
  const description = card?.description ?? ''
  const shift = description.length - description.trimStart().length
  const range = highlight && card && highlight.ygoprodeckId === card.ygoprodeckId ? { start: highlight.start - shift, end: highlight.end - shift } : undefined
  const typeLine = summary ? `${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}` : null

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="relative mx-auto aspect-[421/614] w-full max-w-[13rem] flex-none overflow-hidden" data-testid="duel-dock-art">
        {back ? <span className={CARD_BACK} /> : <CardArt remoteUrl={card?.imageUrl ?? card?.imageUrlSmall ?? null} name={name} className="block h-full w-full object-contain" limitCard={card} />}
      </div>
      <header className="grid flex-none gap-1">
        <Heading level="card">{name}</Heading>
        {typeLine ? <p className="m-0 text-body text-white/66 [overflow-wrap:anywhere]">{typeLine}</p> : null}
      </header>
      <CardPanelBody label={t('search.detail.effect')} className="text-body">
        {back ? null : <CardEffectTraits ygoprodeckId={card?.ygoprodeckId} className="mb-2" />}
        <CardEffectText text={back ? t('duel.dock.faceDownText') : card?.description?.trim() || t('search.detail.noText')} highlight={range} />
      </CardPanelBody>
    </div>
  )
}
