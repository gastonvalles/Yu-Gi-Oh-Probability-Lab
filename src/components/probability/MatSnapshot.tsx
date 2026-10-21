import { memo } from 'react'

import { spotKey, type BoardChange } from '../../app/mat-step-info'
import type { MatPile, MatSpot, MatState, Placed } from '../../app/practice-mat'
import { t } from '../../i18n'
import { cardImageSrc } from '../../app/card-image-source'
import { cx } from '../ui/cx'
import { CARD_BACK } from './practice-styles'

/**
 * El tablero chico de un paso (Gastón, 2026-10-20, con la lista de otro simulador: «nuestras replays y movimientos no se ven así»): la mesa como quedó después de la jugada,
 * con las mismas áreas que la de verdad (siete columnas: la zona de campo y el Extra Deck a la izquierda; el destierro, el cementerio y el deck a la derecha; las Zonas Extra arriba),
 * lo que cambió enmarcado en ámbar (el color de lo que se toca, el del paso actual del reproductor) y, debajo, la mano. Las cartas boca abajo se ven atenuadas, como en la mesa
 * (son tuyas); el deck, el Extra y lo desterrado boca abajo, de dorso.
 *
 * Es sólo un dibujo (`aria-hidden`: la frase del paso ya lo dice) y no recibe toques: en la lista, el paso entero es el botón. `content-visibility: auto`: en un combo de 70 pasos
 * los tableros que no se ven no se dibujan (`contain-intrinsic-size` reserva su alto mientras tanto, así el scroll no salta).
 */

interface MatSnapshotProps {
  state: MatState
  /** Lo que cambió con la jugada (las casillas, las pilas y las cartas que llegaron a la mano): se enmarca en ámbar. Sin esto, nada. */
  change?: BoardChange
  artOf: (id: string) => string | null
  className?: string
}

/** Una casilla: la línea blanca tenue del campo sobre un fondo más hundido que la tarjeta; la que cambió, con el marco ámbar (sólo el marco: un relleno ámbar sobre el índigo se ve marrón). */
const CELL = 'relative min-w-0 border bg-background/60'
const LOOK = 'border-field-line/15'
const CHANGED = 'border-info'

/** El número de una pila o de los materiales: chico, como el de la mesa (`PileBadge`), sobre un fondo que lo despega del arte. */
const COUNT = 'rounded-full bg-background/80 px-1 text-[0.6rem] font-extrabold leading-tight tabular-nums text-foreground'

export const MatSnapshot = memo(function MatSnapshot({ state, change, artOf, className }: MatSnapshotProps) {
  const changed = (spot: MatSpot, index: number) => change?.spots.has(spotKey(spot, index)) ?? false
  const pileChanged = (pile: MatPile) => change?.piles.has(pile) ?? false

  return (
    <div aria-hidden="true" data-snapshot="" className={cx('grid gap-1.5 [contain-intrinsic-size:auto_10rem] [content-visibility:auto]', className)}>
      {/* Las áreas de la mesa de escritorio (`PracticeMat`): las columnas de los costados miden lo justo de una carta y las cinco del centro son cuadradas. */}
      <div className="grid grid-cols-[minmax(0,0.6857fr)_repeat(5,minmax(0,1fr))_minmax(0,0.6857fr)] gap-0.5 [grid-template-areas:'._._emz1_._emz2_._ban'_'fld_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck']">
        {state.emz.map((placed, index) => (
          <Spot key={`emz${index}`} area={`emz${index + 1}`} spot="emz" placed={placed} changed={changed('emz', index)} artOf={artOf} />
        ))}
        {state.mz.map((placed, index) => (
          <Spot key={`mz${index}`} area={`m${index + 1}`} spot="mz" placed={placed} changed={changed('mz', index)} artOf={artOf} />
        ))}
        {state.st.map((placed, index) => (
          <Spot key={`st${index}`} area={`s${index + 1}`} spot="st" placed={placed} changed={changed('st', index)} artOf={artOf} />
        ))}
        <Spot area="fld" spot="field" placed={state.field} changed={changed('field', 0)} artOf={artOf} />
        <Pile area="deck" pile="deck" state={state} changed={pileChanged('deck')} artOf={artOf} />
        <Pile area="extra" pile="extra" state={state} changed={pileChanged('extra')} artOf={artOf} />
        <Pile area="gy" pile="gy" state={state} changed={pileChanged('gy')} artOf={artOf} />
        <Pile area="ban" pile="banished" state={state} changed={pileChanged('banished')} artOf={artOf} />
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <span className={cx('shrink-0 text-micro font-semibold tabular-nums', pileChanged('hand') ? 'text-info-soft' : 'text-soft')}>{t('practice.snapshot.hand', { count: state.hand.length })}</span>
        {/* Encimadas como la mano de la mesa; la que acaba de llegar, con el marco ámbar y por delante. */}
        <span className="flex min-w-0 overflow-hidden py-px pl-px">
          {state.hand.map((id, index) => (
            <span key={id} className={cx('relative aspect-[421/614] h-7 shrink-0 overflow-hidden shadow-[0_0_0_1px_rgb(var(--background-rgb)/0.9)]', index > 0 && '-ml-2', change?.toHand.has(id) && 'z-1 outline-1 outline-info')}>
              <Art url={artOf(id)} />
            </span>
          ))}
        </span>
      </div>
    </div>
  )
})

/**
 * El arte de una carta en el tablero chico: una imagen sola, sin el esqueleto ni los reintentos de `CardArt` (un combo largo dibuja cientos y son de 24 px; es la misma
 * imagen que la mesa ya pidió, así que sale de la caché). Si no carga, queda la casilla oscura.
 */
function Art({ url }: { url: string | null }) {
  return url ? <img src={cardImageSrc(url)} alt="" loading="lazy" decoding="async" draggable={false} className="block h-full w-full object-cover" /> : null
}

/** Una zona del campo con su carta: parada ocupa el alto de la casilla; en defensa (o boca abajo en una de monstruo) se acuesta a su tamaño, como en la mesa. */
function Spot({ area, spot, placed, changed, artOf }: { area: string; spot: MatSpot; placed: Placed | null; changed: boolean; artOf: (id: string) => string | null }) {
  const sideways = placed !== null && spot !== 'st' && spot !== 'field' && placed.pos !== 'atk'

  return (
    <span className={cx(CELL, spot === 'field' ? 'aspect-[421/614]' : 'aspect-square', changed ? CHANGED : LOOK)} style={{ gridArea: area }}>
      {placed ? (
        <span className={cx('absolute overflow-hidden', spot === 'field' ? 'inset-0' : 'inset-x-0 top-0 mx-auto aspect-[421/614] w-[68.57%]', sideways && 'rotate-90')}>
          <span className={cx('block h-full w-full', placed.pos === 'set' && 'brightness-[0.4] saturate-[0.55]')}>
            <Art url={artOf(placed.id)} />
          </span>
          {placed.materials.length > 0 ? <span className={cx('absolute bottom-0 right-0', COUNT)}>+{placed.materials.length}</span> : null}
          {placed.counters > 0 ? <span className="absolute left-0 top-0 rounded-full bg-warning px-1 text-[0.6rem] font-extrabold leading-tight tabular-nums text-accent-foreground">{placed.counters}</span> : null}
        </span>
      ) : null}
    </span>
  )
}

/** Una pila con su cantidad: el deck y el Extra de dorso (el Extra muestra el último Péndulo boca arriba, si tiene); el cementerio y el destierro, con la carta de arriba. */
function Pile({ area, pile, state, changed, artOf }: { area: string; pile: Exclude<MatPile, 'hand'>; state: MatState; changed: boolean; artOf: (id: string) => string | null }) {
  const cards = state[pile]
  const up = pile === 'extra' ? state.extraUp : []
  const top = pile === 'gy' || pile === 'banished' ? (cards[cards.length - 1] ?? null) : (up[up.length - 1] ?? null)
  const back = pile === 'deck' ? cards.length > 0 : pile === 'extra' ? cards.length > 0 && up.length === 0 : top !== null && state.facedown.includes(top)

  return (
    <span className={cx(CELL, 'aspect-[421/614] overflow-hidden', changed ? CHANGED : LOOK)} style={{ gridArea: area }}>
      {back ? <span className={CARD_BACK} /> : top ? <Art url={artOf(top)} /> : null}
      {cards.length > 0 ? (
        <span className="absolute inset-0 z-2 grid place-items-center">
          <span className={COUNT}>{cards.length}</span>
        </span>
      ) : null}
    </span>
  )
}
