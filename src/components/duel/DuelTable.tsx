import type { MarkTarget, Marks } from '../../app/duel-protocol'
import type { SpotlightKind } from '../../app/mat-effects'
import { PHASES, type MatPile, type MatSpot, type MatState, type Placed } from '../../app/practice-mat'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { FX_CARD, FxFrame, SPOTLIGHT_TONE, TargetMark, fxVars } from '../probability/MatFx'
import { CardBack, PILE_TITLES } from '../probability/MatDialogs'
import { CELL, CELL_SQUARE, PENDULUM_GEM, PileBadge } from '../probability/PracticeMat'

/**
 * La mesa del duelo: los dos campos en una sola grilla, como la mesa real. El rival arriba y espejado (su
 * Main Monster Zone 1 queda del lado derecho de la pantalla, su Extra Deck arriba a la derecha, su Banish a
 * la izquierda), las dos Zonas Extra de monstruos en el medio, compartidas, y la mesa propia abajo. Las cartas del
 * rival miran hacia él (de cabeza, como en la mesa real) y las tuyas hacia vos; el aviso de un contador o de un material y las
 * miras quedan derechos.
 *
 * Dibuja y nada más: quien la usa decide qué se puede tocar (la mesa propia es la de siempre, con su menú y su
 * arrastre; la del rival es de sólo lectura).
 */

/** Lo que el duelo sabe de un lado: su mesa y cómo se ve cada carta. */
export interface DuelSideView {
  state: MatState
  /** El arte de una carta que se ve; `null` cuando no se sabe cuál es (boca abajo, secreta). */
  artOf: (id: string) => string | null
  /** Cartas en la mano: la del rival no se ve, sólo cuántas son. */
  handCount?: number
  /** La carta que acaba de destacarse (activada, mostrada, declarada o marcada como objetivo): destella un instante; cambiar `key` lo repite. */
  flash?: { id: string; key: number; kind: SpotlightKind }
  /** Lo que el otro jugador marcó como objetivo de este lado: cartas (por su id) y pilas enteras. */
  marks?: Marks
  /** Marcar algo de este lado (el del rival, desde quien juega del otro): quien llama abre su menú pegado a `rect`, con `place` por título. Sin esto, la mesa es de sólo lectura. */
  onMark?: (target: MarkTarget, rect: DOMRect, place: string) => void
}

/** Qué se dibuja: los dos campos, sólo el propio o sólo el del rival (para elegir entre uno y otro en una pantalla chica). */
export type DuelShow = 'both' | 'mine' | 'theirs'

interface DuelTableProps {
  mine: DuelSideView
  theirs: DuelSideView
  show?: DuelShow
  /** De quién es el turno: la tira del medio muestra su fase. */
  turn?: 'mine' | 'theirs'
  className?: string
}

type Owner = 'mine' | 'theirs'

// El campo del rival, espejado: de la fila de arriba a la de abajo, Deck · Mágicas y Trampas 5…1 · Extra, y GY · Monstruos 5…1 · Zona de campo.
const THEIR_ROWS = ["'tdeck ts5 ts4 ts3 ts2 ts1 textra'", "'tgy tm5 tm4 tm3 tm2 tm1 tfld'"]
const MINE_ROWS = ["'fld m1 m2 m3 m4 m5 gy'", "'extra s1 s2 s3 s4 s5 deck'"]

/** La tira del medio: el Banish de cada uno en su costado, las dos Zonas Extra (sobre la 2.ª y la 4.ª columna) y las fases entre medio. */
const middleRow = (theirs: boolean, mine: boolean) => `'${theirs ? 'tban' : '.'} p1 emz1 p2 emz2 p3 ${mine ? 'ban' : '.'}'`

/** Las áreas de la mesa con los dos campos, para quien arma la grilla por su cuenta (la mesa de práctica, que pone las suyas). */
export const DUEL_AREAS = [...THEIR_ROWS, middleRow(true, true), ...MINE_ROWS].join(' ')

/** Las columnas de los costados miden lo justo de una carta (0,6857 de una del centro): todas las cartas del campo miden lo mismo. */
const GRID =
  'relative grid grid-cols-[minmax(0,0.6857fr)_repeat(5,minmax(0,1fr))_minmax(0,0.6857fr)] gap-1 min-[1101px]:justify-center min-[1101px]:gap-2 min-[1101px]:grid-cols-[minmax(0,calc(var(--cell,6.5rem)*0.6857))_repeat(5,minmax(0,var(--cell,6.5rem)))_minmax(0,calc(var(--cell,6.5rem)*0.6857))]'

const ZONE_LABEL: Record<MatSpot, () => string> = {
  mz: () => t('practice.zone.mz'),
  emz: () => t('practice.zone.emz'),
  st: () => t('practice.zone.st'),
  field: () => t('practice.zone.field'),
}

const zoneLabel = (owner: Owner, spot: MatSpot, index: number) => {
  const own = spot === 'field' ? ZONE_LABEL.field() : t('practice.zone.numbered', { zone: ZONE_LABEL[spot](), n: index + 1 })
  return owner === 'theirs' ? t('duel.zone.theirs', { zone: own }) : own
}

const CARD_SHADOW = 'shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]'

export function DuelTable({ mine, theirs, show = 'both', turn = 'mine', className }: DuelTableProps) {
  const showMine = show !== 'theirs'
  const showTheirs = show !== 'mine'
  const rows = [...(showTheirs ? THEIR_ROWS : []), middleRow(showTheirs, showMine), ...(showMine ? MINE_ROWS : [])]
  const phase = (turn === 'mine' ? mine : theirs).state.phase
  const hand = theirs.handCount

  return (
    <div className={cx('grid gap-1.5', className)}>
      {showTheirs && hand !== undefined ? <TheirHand count={hand} /> : null}
      <div role="group" aria-label={t('duel.table.label')} className={GRID} style={{ gridTemplateAreas: rows.join(' ') }}>
        {showTheirs ? <SideCells side={theirs} owner="theirs" /> : null}
        {[0, 1].map((index) => (
          <SharedZone key={index} area={`emz${index + 1}`} index={index} mine={mine} theirs={theirs} />
        ))}
        {[0, 2, 4].map((start, index) => (
          <div key={start} className="grid grid-cols-2 gap-0.5 self-center min-[1101px]:gap-1" style={{ gridArea: `p${index + 1}` }}>
            {PHASES.slice(start, start + 2).map((entry) => (
              <PhaseTag key={entry.id} short={entry.short} name={entry.name} active={phase === entry.id} />
            ))}
          </div>
        ))}
        {showMine ? <SideCells side={mine} owner="mine" /> : null}
      </div>
    </div>
  )
}

/** Un botón transparente sobre una carta o una pila del rival: se toca para marcarla como objetivo (el menú sale pegado). */
function MarkButton({ label, onMark }: { label: string; onMark: (rect: DOMRect) => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="absolute inset-0 z-10 cursor-pointer rounded-none border-0 bg-transparent p-0 opacity-0 focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus"
      onClick={(event) => onMark((event.currentTarget.closest<HTMLElement>('[role="group"]') ?? event.currentTarget).getBoundingClientRect())}
    />
  )
}

/**
 * La mano del rival: sólo se ve cuántas cartas tiene, de dorso y encimadas. `shrink-0` es lo que la deja verse: va dentro de una columna que scrollea y,
 * como los dorsos miden un porcentaje del alto, sin él la columna la aplastaba a 0 px y sólo quedaban sus sombras, como puntitos.
 */
export function TheirHand({ count, marked = false, onMark }: { count: number; /** El otro jugador la marcó como objetivo. */ marked?: boolean; /** Tocarla para marcarla (sólo quien juega contra ese rival). */ onMark?: (rect: DOMRect) => void }) {
  return (
    <div data-rival-drop="hand" data-targeted={marked ? 'true' : 'false'} className="relative shrink-0">
      <div role="img" aria-label={t('duel.hand.theirs', { count })} className="flex h-9 justify-center min-[1101px]:h-11">
        {Array.from({ length: Math.min(count, 12) }, (_, index) => (
          <span key={index} className={cx('-ml-3 block aspect-[421/614] h-full overflow-hidden first:ml-0', CARD_SHADOW)}>
            <CardBack className="h-full" />
          </span>
        ))}
      </div>
      {marked ? <TargetMark /> : null}
      {onMark ? <MarkButton label={t('duel.mark.label', { place: PILE_TITLES.hand })} onMark={onMark} /> : null}
    </div>
  )
}

function PhaseTag({ short, name, active }: { short: string; name: string; active: boolean }) {
  return (
    <span
      title={name}
      aria-label={active ? t('duel.phase.current', { phase: name }) : name}
      className={cx(
        'grid aspect-square w-full min-w-0 place-items-center rounded-full border text-[0.55rem] font-extrabold leading-none min-[1101px]:text-micro',
        active ? 'border-accent bg-accent text-[#06140e] shadow-[0_0_12px_rgb(var(--accent-rgb)/0.7)]' : 'border-tint/25 text-soft',
      )}
    >
      {short}
    </span>
  )
}

/** Las dos Zonas Extra son de los dos jugadores: la de la izquierda de uno es la de la derecha del otro. Si las ocupan los dos, se ve la propia y un aviso. */
function SharedZone({ area, index, mine, theirs }: { area: string; index: number; mine: DuelSideView; theirs: DuelSideView }) {
  const own = mine.state.emz[index] ?? null
  const other = theirs.state.emz[1 - index] ?? null
  const conflict = own !== null && other !== null
  const label = conflict ? t('duel.zone.conflict', { zone: zoneLabel('mine', 'emz', index) }) : zoneLabel('mine', 'emz', index)

  return (
    <div role="group" aria-label={label} className={cx(CELL_SQUARE, conflict && 'border-solid border-danger')} style={{ gridArea: area }}>
      {own ? <CardOnZone placed={own} spot="emz" side={mine} owner="mine" label={label} /> : other ? <CardOnZone placed={other} spot="emz" side={theirs} owner="theirs" label={label} /> : null}
      {conflict ? <span aria-hidden="true" className="absolute right-0.5 top-0.5 z-2 grid size-4 place-items-center rounded-full bg-danger text-[0.6rem] font-extrabold leading-none text-white">!</span> : null}
    </div>
  )
}

/** La carta del rival que ocupa, vista desde acá, la Zona Extra `index` (0 = izquierda), para dibujarla dentro de la casilla propia; null si no hay. */
export function sharedZoneCard(theirs: DuelSideView, index: number) {
  const placed = theirs.state.emz[1 - index] ?? null
  return placed ? <CardOnZone placed={placed} spot="emz" side={theirs} owner="theirs" label={zoneLabel('mine', 'emz', index)} /> : null
}

/** Las zonas y pilas de un lado. Las áreas del rival llevan una `t` delante (`tm1`, `tgy`…). */
export function SideCells({ side, owner }: { side: DuelSideView; owner: Owner }) {
  const prefix = owner === 'theirs' ? 't' : ''
  const { state } = side

  return (
    <>
      <Zone area={`${prefix}fld`} spot="field" index={0} placed={state.field} side={side} owner={owner} />
      {state.mz.map((placed, index) => (
        <Zone key={`m${index}`} area={`${prefix}m${index + 1}`} spot="mz" index={index} placed={placed} side={side} owner={owner} />
      ))}
      {state.st.map((placed, index) => (
        <Zone key={`s${index}`} area={`${prefix}s${index + 1}`} spot="st" index={index} placed={placed} side={side} owner={owner} />
      ))}
      <Pile area={`${prefix}deck`} pile="deck" side={side} owner={owner} />
      <Pile area={`${prefix}extra`} pile="extra" side={side} owner={owner} />
      <Pile area={`${prefix}gy`} pile="gy" side={side} owner={owner} />
      <Pile area={`${prefix}ban`} pile="banished" side={side} owner={owner} />
    </>
  )
}

function Zone({ area, spot, index, placed, side, owner }: { area: string; spot: MatSpot; index: number; placed: Placed | null; side: DuelSideView; owner: Owner }) {
  const label = zoneLabel(owner, spot, index)
  // Las puntas de la fila de Mágicas y Trampas son zonas de péndulo. Espejado, el índice 0 del rival queda del lado derecho, como en la mesa real.
  const gem = spot === 'st' ? PENDULUM_GEM[index] : undefined

  return (
    <div role="group" aria-label={label} className={spot === 'field' ? CELL : CELL_SQUARE} style={{ gridArea: area }}>
      {gem && !placed ? <span aria-hidden="true" className={cx('absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px]', gem)} /> : null}
      {spot === 'field' && !placed ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[0.5rem] font-semibold uppercase tracking-[0.04em] text-soft min-[1101px]:text-[0.6rem]">{t('practice.zone.fieldLabel')}</span> : null}
      {placed ? <CardOnZone placed={placed} spot={spot} side={side} owner={owner} label={label} /> : null}
    </div>
  )
}

/**
 * Una carta en una zona, de sólo lectura. Parada ocupa el alto de la casilla; en defensa o boca abajo en una zona de monstruo se
 * acuesta a su tamaño dentro de su casilla cuadrada. Boca abajo, la propia se ve atenuada (sabés cuál es) y la del rival de dorso.
 */
function CardOnZone({ placed, spot, side, owner, label }: { placed: Placed; spot: MatSpot; side: DuelSideView; owner: Owner; label: string }) {
  const art = side.artOf(placed.id)
  const flash = side.flash?.id === placed.id ? side.flash : null
  const targeted = side.state.targeted.includes(placed.id) || (side.marks?.cards.includes(placed.id) ?? false)
  const faceDown = placed.pos === 'set'
  const sideways = spot !== 'st' && spot !== 'field' && placed.pos !== 'atk'
  const back = (owner === 'theirs' && faceDown) || art === null

  return (
    <div
      data-card-id={owner === 'mine' ? placed.id : undefined}
      // La carta del rival, por el id (opaco) que él le dio: de ahí sale y a ahí llega la espada de un ataque.
      data-rival-card-id={owner === 'theirs' ? placed.id : undefined}
      // El aro de lo que acaba de hacer (activar, mostrar, declarar, marcar como objetivo) y la mira de lo que está marcado: igual que en las cartas propias.
      style={fxVars(flash ? SPOTLIGHT_TONE[flash.kind] : 'red')}
      data-flash={flash ? 'true' : 'false'}
      data-flash-kind={flash?.kind}
      data-targeted={targeted ? 'true' : 'false'}
      className={cx('absolute inset-x-0 top-0 mx-auto aspect-[421/614] overflow-hidden bg-input [--card-shadow:0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]', CARD_SHADOW, FX_CARD, spot === 'field' ? 'w-full' : 'w-[68.57%]', sideways && '[transform:rotate(90deg)]')}
    >
      <span className={cx('block h-full w-full', owner === 'mine' && faceDown && 'brightness-[0.4] saturate-[0.55]', owner === 'theirs' && 'rotate-180')}>
        {back ? <CardBack className="h-full" /> : <CardArt remoteUrl={art} name={label} className="block h-full w-full object-cover" />}
      </span>
      {flash && flash.kind !== 'target' ? <FxFrame key={flash.key} tone={SPOTLIGHT_TONE[flash.kind]} shine /> : null}
      {targeted ? <TargetMark /> : null}
      {side.onMark && owner === 'theirs' ? <MarkButton label={t('duel.mark.label', { place: label })} onMark={(rect) => side.onMark!({ card: placed.id }, rect, label)} /> : null}
      {placed.counters > 0 ? <span className="absolute left-0.5 top-0.5 z-2 rounded-full bg-warning px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-[#1a1204]">{placed.counters}</span> : null}
      {placed.materials.length > 0 ? <span className="absolute bottom-0.5 right-0.5 z-2 rounded-full bg-primary px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-primary-foreground">+{placed.materials.length}</span> : null}
    </div>
  )
}

/** Una pila: Main y Extra de dorso; GY y Banish con su carta de arriba (de dorso si está boca abajo); siempre la cantidad. */
function Pile({ area, pile, side, owner }: { area: string; pile: Exclude<MatPile, 'hand'>; side: DuelSideView; owner: Owner }) {
  const cards = side.state[pile]
  const top = pile === 'gy' || pile === 'banished' ? (cards[cards.length - 1] ?? null) : null
  const back = pile === 'deck' || pile === 'extra' ? cards.length > 0 : top !== null && side.state.facedown.includes(top)
  const art = top !== null && !back ? side.artOf(top) : null
  // La pila entera marcada, o una carta de adentro marcada como objetivo (se vea o no): la mira queda sobre la pila. Y lo que destella (activar, marcar) adentro, también.
  const marked = (side.marks?.piles.includes(pile) ?? false) || cards.some((id) => side.state.targeted.includes(id) || (side.marks?.cards.includes(id) ?? false))
  const flash = side.flash && cards.includes(side.flash.id) ? side.flash : null

  return (
    <div role="group" aria-label={`${PILE_TITLES[pile]}: ${cards.length}`} title={PILE_TITLES[pile]} data-rival-drop={owner === 'theirs' ? pile : undefined} data-targeted={marked ? 'true' : 'false'} data-flash={flash ? 'true' : 'false'} data-flash-kind={flash?.kind} className={cx(CELL, 'overflow-hidden', FX_CARD, '[--card-shadow:0_0_0_0_transparent]')} style={{ gridArea: area, ...fxVars(flash ? SPOTLIGHT_TONE[flash.kind] : 'red') }}>
      {/* La carta de arriba del rival, como las de su campo, mira hacia él. */}
      {pile === 'deck' && owner === 'theirs' && cards.length > 0 ? (
        // El deck del rival, de capas como el propio: así se baraja a la vista cuando lo toca.
        <>
          <span data-layer className="absolute inset-0 [transform:translate(-3px,3px)]">
            <CardBack className="h-full" />
          </span>
          <span data-layer className="absolute inset-0 [transform:translate(-1.5px,1.5px)]">
            <CardBack className="h-full" />
          </span>
          <span className="absolute inset-0">
            <CardBack className="h-full" />
          </span>
        </>
      ) : cards.length > 0 ? (art ? <CardArt remoteUrl={art} name={PILE_TITLES[pile]} className={cx('block h-full w-full object-cover', owner === 'theirs' && 'rotate-180')} /> : <CardBack className={cx('h-full', owner === 'theirs' && 'rotate-180')} />) : null}
      <PileBadge label={PILE_TITLES[pile]} count={cards.length} />
      {flash && flash.kind !== 'target' ? <FxFrame key={flash.key} tone={SPOTLIGHT_TONE[flash.kind]} shine /> : null}
      {marked ? <TargetMark /> : null}
      {side.onMark && owner === 'theirs' ? <MarkButton label={t('duel.mark.label', { place: PILE_TITLES[pile] })} onMark={(rect) => side.onMark!({ pile }, rect, PILE_TITLES[pile])} /> : null}
    </div>
  )
}
