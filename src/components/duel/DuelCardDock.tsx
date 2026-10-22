import { useState, type ReactNode } from 'react'

import { t } from '../../i18n'
import type { CardTextHighlight } from '../../app/card-text'
import { Presence } from '../../app/use-presence'
import { formatInteger } from '../../app/utils'
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
import { Icon } from '../ui/Icon'
import { overline } from '../ui/typography'
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
 * un lector de cartas: el título del panel, la carta grande en su marco y, debajo, su nombre, su tipo, sus números y su efecto. No es un modal: no tapa la mesa y la mesa no se mueve cuando cambia (la columna está siempre, vacía hasta que se toca la primera).
 * La carta grande es como la de cualquier detalle (Gastón, 2026-10-20: «no puedo ver la animación 3d de la carta del detalle ni ampliarla ni moverla»): se inclina en 3D hacia el mouse, se da vuelta arrastrándola
 * y al tocarla se agranda (`CardZoom`). Sin una carta que se conozca (la boca abajo, la que todavía no llegó) queda quieta.
 * La presentación (Gastón, 2026-10-20: «el panel izquierdo nuestro es muy distinto al de la imagen y el nuestro se ve peor»): título del panel, carta grande en un marco con bisel, nombre en grande, números rotulados y un texto que ocupa el resto.
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
      {/* La carta empieza a una altura pareja (el título y un corrimiento fijo, que crece un poco con el alto de la ventana) y no pegada al borde de arriba: queda en el mismo lugar aunque cambie el texto, y el texto, que ocupa lo que queda, scrollea. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3.5 pt-[clamp(0rem,4dvh,3rem)]">
        <p aria-hidden="true" className={cx(overline, 'm-0 flex items-center gap-2')}>
          <Icon name="cards" size={14} className="text-foreground" />
          {t('duel.dock.label')}
        </p>
        {view}
      </div>
      {/* Al cerrarse, la carta en grande sigue mientras sale (`Presence`). */}
      <Presence>{zoomed ? <CardZoom card={zoomed.card} name={zoomed.name} fallbackUrl={zoomed.card.imageUrlSmall ?? zoomed.card.imageUrl} onClose={() => setZoomed(null)} /> : null}</Presence>
    </>
  )
}

function RivalPeek({ drawId, onZoom }: { drawId: string; onZoom: (card: ApiCardReference, name: string) => void }) {
  const card = useRivalCard(drawId)

  return <CardPeekView name={card?.name ?? t('duel.mark.rivalCard')} card={card} onZoom={onZoom} />
}

/** Un número que pasa de texto a cifra con el separador del idioma («1800» → «1.800»); lo que no es un número («?») queda como está. */
function formatStat(value: string): string {
  const number = Number(value)

  return Number.isFinite(number) ? formatInteger(number) : value
}

/** Los números de una carta, rotulados: el nivel (el rango de una Xyz, o el Link) y el ATK y la DEF; sin los que no tiene (una Mágica no tiene ninguno, un Link no tiene DEF). */
function statsOf(card: ApiCardReference): Array<{ key: string; label: string; value: string }> {
  const stats = []

  if (card.linkValue !== null) stats.push({ key: 'link', label: t('duel.dock.link'), value: String(card.linkValue) })
  else if (card.level !== null) stats.push({ key: 'level', label: t(/xyz/i.test(card.cardType) ? 'duel.dock.rank' : 'duel.dock.level'), value: String(card.level) })

  if (card.atk) stats.push({ key: 'atk', label: t('duel.dock.atk'), value: formatStat(card.atk) })
  if (card.def && card.linkValue === null) stats.push({ key: 'def', label: t('duel.dock.def'), value: formatStat(card.def) })

  return stats
}

/** La luz detrás de la carta, como la del pedestal de un lector: un pozo violeta que se apaga hacia los bordes (el contenedor es `isolate`: queda detrás de la carta y delante del fondo del panel). */
const ART_LAMP = 'pointer-events-none absolute -inset-x-10 -inset-y-8 -z-10 bg-[radial-gradient(ellipse_at_center,rgb(var(--primary-rgb)/0.4),transparent_68%)]'
/** El marco de la carta: un bisel recto (las cartas van rectas) de un violeta metálico —claro arriba a la izquierda, más oscuro abajo a la derecha—, con una sombra con desplazamiento (cae hacia abajo, como si la luz viniera de arriba) y un filo de luz arriba. */
const ART_BEZEL = 'relative bg-linear-to-br from-foreground/55 via-primary-soft/30 to-foreground/20 p-1.5 shadow-[0_22px_36px_-8px_rgb(0_0_0/0.75),inset_0_1px_0_rgb(var(--foreground-rgb)/0.55)]'
/** El hueco de la carta dentro del marco: negro, con un filo oscuro que la separa del bisel. */
const ART_WELL = 'relative bg-input ring-1 ring-black/70'

/** El lugar de la carta grande: el pedestal con su luz y el marco. De ancho, lo que entra (el alto de la ventana lo achica: la carta no empuja al texto fuera del panel) hasta 15,5 rem. */
function ArtHolder({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate mx-auto w-[min(100%,15.5rem,24dvh)] flex-none" data-testid="duel-dock-art">
      <span aria-hidden="true" className={ART_LAMP} />
      <div className={ART_BEZEL}>{children}</div>
    </div>
  )
}

function CardPeekView({ name, card, back = false, highlight = null, onZoom }: { name: string; card: ApiCardReference | null; back?: boolean; highlight?: CardTextHighlight | null; onZoom: (card: ApiCardReference, name: string) => void }) {
  const summary = card ? buildCardSummary(card) : null
  // El texto se muestra sin los espacios de los bordes: el pedazo señalado se corre lo que se sacó del principio.
  const description = card?.description ?? ''
  const shift = description.length - description.trimStart().length
  const range = highlight && card && highlight.ygoprodeckId === card.ygoprodeckId ? { start: highlight.start - shift, end: highlight.end - shift } : undefined
  // El tipo va solo y los números aparte, rotulados: cada dato se dice una sola vez.
  const typeLine = summary?.typeLine ?? null
  const stats = card ? statsOf(card) : []
  // La carta que se da vuelta vuelve al frente al pasar a otra (si no, la siguiente se vería de dorso).
  const flip = useCardFlip()
  const [flippedFor, setFlippedFor] = useState(card?.ygoprodeckId)

  if (flippedFor !== card?.ygoprodeckId) {
    setFlippedFor(card?.ygoprodeckId)
    flip.reset()
  }

  const art = <CardArt remoteUrl={card?.imageUrl ?? card?.imageUrlSmall ?? null} name={name} className="block h-full w-full object-contain" limitCard={card} />

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {card && !back ? (
        <ArtHolder>
          {/* La perspectiva va en el contenedor directo de la carta que se inclina: si no, la inclinación sería plana. */}
          <div className={cx(ART_WELL, TILT_PERSPECTIVE)}>
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
        </ArtHolder>
      ) : (
        <ArtHolder>
          <div className={cx(ART_WELL, 'aspect-[421/614] overflow-hidden')}>{back ? <span className={CARD_BACK} /> : art}</div>
        </ArtHolder>
      )}
      <header className="grid flex-none gap-1.5">
        <Heading level="section">{name}</Heading>
        {typeLine ? <p className="m-0 text-body text-muted [overflow-wrap:anywhere]">{typeLine}</p> : null}
        {stats.length > 0 ? (
          <dl className="m-0 flex flex-wrap items-baseline gap-x-5 gap-y-1 pt-0.5">
            {stats.map((stat) => (
              <div key={stat.key} className="flex items-baseline gap-1.5">
                <dt className={overline}>{stat.label}</dt>
                <dd className="m-0 text-lead font-bold tabular-nums text-foreground">{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>
      <CardPanelBody label={t('search.detail.effect')} className="text-body">
        {back ? null : <CardEffectTraits ygoprodeckId={card?.ygoprodeckId} className="mb-2" />}
        <CardEffectText text={back ? t('duel.dock.faceDownText') : card?.description?.trim() || t('search.detail.noText')} highlight={range} />
      </CardPanelBody>
    </div>
  )
}
