import { useState } from 'react'

import { t } from '../../i18n'
import type { CardTextHighlight } from '../../app/card-text'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { CardEffectText } from '../card-detail/CardEffectText'
import { CardEffectTraits } from '../card-detail/CardEffectTraits'
import { CardFlip, useCardFlip } from '../card-detail/CardFlip'
import { CardPanelBody } from '../card-detail/CardOverlay'
import { CardZoom } from '../card-detail/CardZoom'
import { buildCardSummary } from '../card-detail/card-summary'
import { TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from '../card-detail/card-tilt'
import { CARD_BACK } from '../probability/practice-styles'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { useRivalCard } from './RivalCardDetail'

/** Lo que muestra el detalle fijo: una carta que se conoce (la tuya) o una del rival por su id real (se pide por su número), y una boca abajo de la que no se sabe nada. */
export type CardPeek = { name: string; card: ApiCardReference | null } | { drawId: string } | { faceDown: true }

/** La carta que se agrandó desde el detalle: queda como se abrió aunque el detalle pase a otra carta (el mouse sigue señalando cartas de la mesa por detrás). */
interface Zoomed {
  name: string
  card: ApiCardReference
}

/**
 * El detalle de la carta que tocaste, siempre a la vista a la izquierda de la mesa en un duelo de pantalla ancha (desde 1440 px: con menos no entra junto al chat; ahí queda «Ver carta» del menú) (Gastón, 2026-10-19: «siempre que haga un click sobre una carta veré el detalle del lado izquierdo»):
 * la carta grande y, debajo, su nombre, su tipo y su efecto. No es un modal: no tapa la mesa y la mesa no se mueve cuando cambia (la columna está siempre, vacía hasta que se toca la primera).
 * La carta grande es como la de cualquier detalle (Gastón, 2026-10-20: «no puedo ver la animación 3d de la carta del detalle ni ampliarla ni moverla»): se inclina en 3D hacia el mouse, se da vuelta arrastrándola
 * y al tocarla se agranda (`CardZoom`). Sin una carta que se conozca (la boca abajo, la que todavía no llegó) queda quieta.
 */
export function DuelCardDock({ peek, highlight = null }: { peek: CardPeek | null; /** Un pedazo del texto de la carta que se resalta (la frase del efecto que se está eligiendo en el menú): sólo si es el texto de la carta que se ve. */ highlight?: CardTextHighlight | null }) {
  const [zoomed, setZoomed] = useState<Zoomed | null>(null)
  const zoom = (card: ApiCardReference, name: string) => setZoomed({ card, name })
  let view

  if (peek === null) {
    view = <p className="m-0 my-auto px-4 text-center text-body text-soft">{t('duel.dock.empty')}</p>
  } else if ('faceDown' in peek) {
    view = <CardPeekView name={t('duel.dock.faceDown')} card={null} back onZoom={zoom} />
  } else if ('drawId' in peek) {
    view = <RivalPeek key={peek.drawId} drawId={peek.drawId} onZoom={zoom} />
  } else {
    view = <CardPeekView name={peek.name} card={peek.card} highlight={highlight} onZoom={zoom} />
  }

  return (
    <>
      {view}
      {zoomed ? <CardZoom card={zoomed.card} name={zoomed.name} fallbackUrl={zoomed.card.imageUrlSmall ?? zoomed.card.imageUrl} onClose={() => setZoomed(null)} /> : null}
    </>
  )
}

function RivalPeek({ drawId, onZoom }: { drawId: string; onZoom: (card: ApiCardReference, name: string) => void }) {
  const card = useRivalCard(drawId)

  return <CardPeekView name={card?.name ?? t('duel.mark.rivalCard')} card={card} onZoom={onZoom} />
}

function CardPeekView({ name, card, back = false, highlight = null, onZoom }: { name: string; card: ApiCardReference | null; back?: boolean; highlight?: CardTextHighlight | null; onZoom: (card: ApiCardReference, name: string) => void }) {
  const summary = card ? buildCardSummary(card) : null
  // El texto se muestra sin los espacios de los bordes: el pedazo señalado se corre lo que se sacó del principio.
  const description = card?.description ?? ''
  const shift = description.length - description.trimStart().length
  const range = highlight && card && highlight.ygoprodeckId === card.ygoprodeckId ? { start: highlight.start - shift, end: highlight.end - shift } : undefined
  const typeLine = summary ? `${summary.typeLine}${summary.statLine ? ` · ${summary.statLine}` : ''}` : null
  // La carta que se da vuelta vuelve al frente al pasar a otra (si no, la siguiente se vería de dorso).
  const flip = useCardFlip()
  const [flippedFor, setFlippedFor] = useState(card?.ygoprodeckId)

  if (flippedFor !== card?.ygoprodeckId) {
    setFlippedFor(card?.ygoprodeckId)
    flip.reset()
  }

  const art = <CardArt remoteUrl={card?.imageUrl ?? card?.imageUrlSmall ?? null} name={name} className="block h-full w-full object-contain" limitCard={card} />

  return (
    // La carta empieza a una altura pareja y no pegada al borde de arriba: queda fija aunque cambie el texto (la que se ve nunca salta al pasar de una carta a otra) y el texto, que ocupa lo que queda, scrollea.
    <div className="flex min-h-0 flex-1 flex-col gap-3 pt-[clamp(0.5rem,12dvh,8rem)]">
      {card && !back ? (
        <div className={cx('relative mx-auto w-full max-w-[13rem] flex-none', TILT_PERSPECTIVE)} data-testid="duel-dock-art">
          <div
            className={cx('relative aspect-[421/614] cursor-zoom-in touch-none', TILT_ART)}
            title={t('search.flip.title')}
            // Tocar la carta la agranda, de frente o dada vuelta (el botón de adentro es para el teclado y los lectores de pantalla: su clic llega hasta acá). Lo que deja un arrastre (dar vuelta la carta) no es un toque.
            onClick={() => {
              if (!flip.consumeClick()) onZoom(card, name)
            }}
            onPointerDown={(event) => {
              tiltHandlers.onPointerDown(event)
              flip.onPointerDown(event)
            }}
            onPointerMove={(event) => {
              tiltHandlers.onPointerMove(event)
              flip.onPointerMove(event)
            }}
            onPointerLeave={tiltHandlers.onPointerLeave}
            onPointerUp={flip.onPointerUp}
            onPointerCancel={flip.onPointerCancel}
          >
            <CardFlip turns={flip.turns} flipperRef={flip.flipperRef} loadBack={flip.loadBack} shadow={false}>
              <button
                type="button"
                aria-label={t('duel.dock.zoom')}
                className="block size-full cursor-zoom-in rounded-none bg-transparent p-0 focus-visible:outline-none focus-visible:shadow-focus"
              >
                {art}
              </button>
            </CardFlip>
          </div>
        </div>
      ) : (
        <div className="relative mx-auto aspect-[421/614] w-full max-w-[13rem] flex-none overflow-hidden" data-testid="duel-dock-art">
          {back ? <span className={CARD_BACK} /> : art}
        </div>
      )}
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
