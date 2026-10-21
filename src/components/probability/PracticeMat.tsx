import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { parseDerivedCardId } from '../../app/calculator-state'
import { matEffects, type LandingTone, type ShowcaseKind, type SpotlightKind } from '../../app/mat-effects'
import { opaqueOfForeign } from '../../app/mat-control'
import { isOpaqueId } from '../../app/mat-public'
import {
  allMatIds,
  type AttackTarget,
  banishItem,
  cardKindOf,
  describeMatSteps,
  type ControlOffer,
  fieldCards,
  freeTargets,
  isForeignId,
  isToken,
  listCardActions,
  listDropActions,
  locateCard,
  matReducer,
  monstersOnField,
  monsterZones,
  PHASES,
  pileAction,
  placedAt,
  randomSeed,
  replayMat,
  TOKEN_KIND,
  type MatAction,
  type MatMenuItem,
  type MatPhase,
  type MatPile,
  type MatSpot,
  type MatState,
  type MatTarget,
  type Placed,
} from '../../app/practice-mat'
import { mergeHandOrder } from '../../app/practice-hand-layout'
import { createSavedCombo, readSavedCombos, renameSavedCombo, writeSavedCombos, type SavedCombo } from '../../app/saved-combos'
import { supportsAdditiveAnimation } from '../../app/motion'
import { matStepCards } from '../../app/mat-steps'
import { DuelRailsContext, RAILS_SIDE_RESERVE_PX, fieldZoom, railsFit } from '../../app/duel-rails'
import type { Activity, Marks } from '../../app/duel-protocol'
import { playSfx } from '../../app/sfx'
import { setSoundsOn, useSoundsOn } from '../../app/sound-prefs'
import { setDuelFullscreen, toggleDuelFullscreen, useDuelFullscreen } from '../../app/duel-fullscreen'
import { riffle } from '../../app/shuffle-fx'
import { useCardFlights } from '../../app/use-card-flights'
import { useMatView } from '../../app/mat-view'
import { useElementSize } from '../../app/use-element-width'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useEscapeKey } from '../../app/use-overlay'
import { showToastMessage } from '../../app/use-toast-message'
import type { CardTextHighlight } from '../../app/card-text'
import { cardEffectMapLoaded, getCardEffectFacts, loadCardEffectMap, loadCardEffects } from '../../app/card-effect-data'
import { LIMIT_FACTS, activationFacts, cardEffects, countableEffects, effectChoices, effectKey, limitKey, spellTrapActivation, type Activation } from '../../app/mat-assistant'
import { repeatedTurnRule } from '../../app/turn-rules'
import { usePracticeSounds } from '../../app/use-practice-sounds'
import { useWakeLock } from '../../app/use-wake-lock'
import { useMatDrag, type MatDragSource, type MatDropTarget } from '../../app/use-mat-drag'
import type { MatSession } from '../../app/use-mat-session'
import { t } from '../../i18n'
import type { ApiCardReference, GlowKind, PatternKind } from '../../types'
import { fetchCardsByIds } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { CardDetailOverlay } from '../card-detail/CardDetailOverlay'
import { DuelMascot } from '../mascot/Mascot'
import { Button } from '../ui/Button'
import { ConfirmDialog } from './ConfirmDialog'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { AttackFx, measureStrike, type Strike, type StrikeSpec } from './AttackFx'
import { CardSheet } from './CardSheet'
import { THEIR_HAND } from '../duel/their-hand'
import { COMPACT_FIELD_MEDIA_QUERY, compactDuelFieldStyle } from './compact-field'
import { stepTone } from './step-tone'
import { CardBack, CardMenu, PILE_SHORT, PILE_TITLES, PileViewer, SaveComboDialog, type MenuItem } from './MatDialogs'
import { MatPlate, MatScene, PickMarks } from './MatArena'
import { MatViewToggle } from './MatViewToggle'
import { ShellMenuButton } from '../shell/ShellMenu'
import { CARD_HOVER, CARD_TRANSITION, FX_CARD, FxFrame, LandingBurst, PhaseBanner, SPOTLIGHT_TONE, Spotlight, TargetMark, fxVars } from './MatFx'
import { cardIdOfDrawId } from './practice'
import { PracticeHand, type HandCardData } from './PracticeHand'
import { PracticeMatPanel, type PanelStep } from './PracticeMatPanel'
import { ReplayBar, type ReplayMark, type ReplaySpeed } from './ReplayBar'
import { PileStack } from './PileStack'
import { CARD_BACK, CARD_BACK_URL, GLOW_TONE } from './practice-styles'

export interface MatCard {
  name: string
  apiCard: ApiCardReference | null
  /** Imagen propia, para lo que no es una carta del deck (la ficha). */
  art?: string
}

/**
 * El duelo por enlace en la mesa: el campo del rival (dos filas espejadas arriba del propio, con sus áreas `t…`), lo que va arriba de todo
 * (la barra con los puntos de vida y la mano del rival) y la carta del rival que ocupa una Zona Extra compartida. En un duelo no hay mano nueva
 * ni combos guardados, y la mascota no se sienta en el campo. Lo arma la pantalla del duelo: la mesa no sabe nada de la red.
 */
/** El aire entre el campo y la mano (`gap-2`) y el que la mano deja sobre sus cartas (`TOP_ROOM` de `PracticeHand`): la mano sube la primera distancia y queda separada del campo por la segunda. */
const MAT_GAP = 8
const HAND_TOP_ROOM = 8
/** Escritorio: cuánto se separa del campo la mano del rival (arriba). Las manos nunca tapan el campo (Gastón, 2026-10-19: «ya no quiero que las cartas tapen la mesa nunca»). */
const DESKTOP_HAND_GAP = 8
/** Celular: cuánto se separan las manos del campo (la del rival sube, la tuya baja) sin moverlo: se corren con `transform` y `margin` de un elemento absoluto, que no cambian el alto de lo que se centra. */
const MOBILE_HAND_GAP = 14

export interface DuelMatLink {
  /** Las áreas de la grilla con los dos campos. */
  areas: string
  /** Las mismas áreas en un celular en vertical (menos de 640 px): cinco columnas y una fila de pilas por jugador. */
  areasCompact: string
  /** Las casillas del rival (zonas, pilas y su Banish en el medio), ya con su `gridArea`. */
  opponent: ReactNode
  /** La carta del rival que ocupa, vista desde acá, la Zona Extra `index` (0 = izquierda); null si no hay. */
  sharedZone: (index: number) => ReactNode
  /** Arriba del campo: la barra del duelo (y, en escritorio, la mano del rival, en el centro de su fila). */
  header: ReactNode
  /** La mano del rival en el celular: pegada arriba del campo (no en la barra), así las dos se quedan juntas cuando sobra alto. */
  rivalHand?: ReactNode
  /** Los monstruos del rival en el campo (con el id que él les dio) y dónde están: a cuáles se puede atacar. */
  attackTargets: ReadonlyArray<{ id: string; zone: 'mz' | 'emz'; index: number; faceDown: boolean }>
  /** id que dio el rival → carta real, de lo que ya mostró: así se nombra a quien se ataca. */
  foreignKnown: Readonly<Record<string, string>>
  /** Celular: las reacciones rápidas (🤔 y 👍), centradas debajo de la mano. */
  reactions?: ReactNode
  /** Los botones propios del duelo (el chat y las señales) y tus puntos de vida: van abajo, en la barra del pulgar, junto a deshacer, el + y las fases. */
  tools: ReactNode
  /** Lo que el + ofrece además de la ficha y los contadores en un duelo (la moneda, el dado y los juegos): cada uno abre lo suyo. */
  plusItems?: ReadonlyArray<{ label: string; onSelect: () => void }>
  life: ReactNode
  /** El cartel de lo que el rival avanzó (una fase suya, o que empieza tu turno); cambiar `key` lo vuelve a mostrar. */
  notice?: { key: number; phase: MatPhase; who?: string; label?: string }
  /** El texto del cartel cuando terminás tu turno (volvés de la End Phase a la Draw Phase) y pasa al rival ("Turno de Ana"). */
  rivalTurnLabel: string
  /** La fase del duelo, igual para los dos (la de quien tiene el turno), y si el turno es tuyo: sólo quien tiene el turno cambia de fase. */
  phase: MatPhase
  myTurn: boolean
  /**
   * Lo que el rival acaba de hacer y se avisa (su ataque): un cartel arriba con `caption` y la espada de su monstruo (`attackerId`, el id que él le dio) a tu carta
   * (`targetId`, tu id real) o, sin `targetId`, a tu barra de vida; cambiar `key` lo vuelve a mostrar.
   */
  announcement?: { key: number; caption: string; attackerId: string; targetId?: string }
  /**
   * Lo que el rival acaba de hacer y se anima (activar, mostrar, declarar o marcar una carta, invocar, mandar cartas al cementerio, al destierro, a la mano o al deck…), como en un combo
   * guardado: las cartas (con el id que él les dio y su arte, o de dorso si no las mostró) grandes en el centro y `caption` arriba, que dice qué pasó. Cambiar `key` lo vuelve a mostrar.
   */
  rivalEffect?: { key: number; kind: SpotlightKind | ShowcaseKind; /** Sólo va al registro: no se dibuja en el centro (el cementerio y el destierro). */ quiet?: true; cards: ReadonlyArray<{ id: string; art: string | null; name?: string }>; flip?: boolean; caption: string; linger?: boolean; /** La carta que el rival sumó a su mano sin robar (su id real): el detalle de la izquierda se queda en ella hasta que se toque otra. */ peekId?: string; /** El efecto que activó, si eligió uno entre varios: cuándo se activa («Efecto 2 · When…») y qué hace, **textual**, para que quien tiene que decidir si responde lo lea. */ detail?: { lead: string; text: string } }
  /** Lo que el rival marcó como objetivo de mi lado (con mis ids reales): sus cartas y pilas enteras, la mano incluida, llevan la mira igual que lo que marqué yo. */
  marksOnMine?: Marks
  /** Mis cartas que pueden responder ahora (el rival preguntó si hacés algo antes de pasar de fase): brillan en ámbar, y la casilla del cementerio lleva un aro si hay una adentro. */
  respond?: ReadonlySet<string>
  /** Lo que hay que contestar ahora (la pregunta del rival de pasar de fase): va en el medio de la mesa, centrado en su columna y encima del campo, sin fondo que la tape ni empujar nada. */
  prompt?: ReactNode
  /** Lo que se está señalando de mi lado (el rival, o yo): una carta mía o una pila; late un rato. */
  pointed?: { card?: string; pile?: MatPile } | null
  /** Señalar una carta mía a la vista en el campo (se ve en las dos pantallas un rato; no es una jugada). */
  point?: (id: string) => void
  /** La mesa del rival (con ids opacos) y el arte de lo que mostró: sus cartas vuelan de un lugar a otro (al cementerio, a la mano, al campo…) como las propias. */
  rivalFlights?: { state: MatState; artOf: (id: string) => string | null }
  /** Cuenta las veces que el rival tocó su deck o sumó una carta a su mano: cada vez que sube, su deck y su mano se barajan a la vista. */
  rivalShuffle?: number
  /** Pedí volver atrás la última jugada de la mesa y espero que el rival la permita: Deshacer queda apagado hasta que conteste. */
  undoPending?: boolean
  /** Hay una jugada que deshacer: la última de la mesa, sea mía o del rival (sin esto, vale la cuenta de mis jugadas). */
  undoAvailable?: boolean
  /** La última jugada de la mesa cambió de manos un monstruo (la otra mesa ya la completó): no se deshace. */
  undoBlocked?: boolean
  /** A quién se le puede dar el control de un monstruo y si tiene dónde ponerlo. */
  control?: ControlOffer
  /** En qué turno del duelo van los dos juntos (`duelTurnNumber`): con él el asistente sabe si una activación es del mismo turno. Sin duelo, el turno de la mesa. */
  turnNumber?: number
  /** Qué Zonas Extra ocupa el rival, cada una por su número (la 0 suya es la 1 de acá): una que ocupa él no se puede usar, ni la otra si ya hay un monstruo propio en una. */
  rivalEmz: readonly boolean[]
  /** Una capa que tapa toda la mesa (el duelo en pausa): nada de lo de abajo se toca mientras está. */
  cover?: ReactNode
  /** Un panel fijo a la derecha de la mesa, sólo en escritorio (el chat): la mesa le deja 20rem. */
  aside?: ReactNode
  /** Un panel fijo a la izquierda de la mesa, sólo en pantallas anchas (`DUEL_DETAIL_DOCK_MEDIA_QUERY`: el detalle de la carta que se tocó): la mesa le deja 20rem y no se mueve cuando cambia. */
  detail?: ReactNode
  /** Se hizo click en una carta tuya (de la mano, del campo o de un visor de pila): `detail` la muestra y queda fija hasta un click afuera o en otra carta. */
  onPeek?: (peek: { name: string; card: ApiCardReference | null }) => void
  /** Se pasó el mouse por una carta tuya (de la mano o del campo): `detail` la muestra mientras no haya otra fija por un click. */
  onHover?: (peek: { name: string; card: ApiCardReference | null }) => void
  /** Lo mismo con una carta del rival a la vista (su id opaco, el que él le dio): de ahí sale lo que muestra `detail` si él la mostró. */
  onRivalHover?: (id: string) => void
  /** Se está eligiendo un efecto en el menú (pasar el mouse por una opción): el pedazo del texto de esa carta que `detail` tiene que resaltar; `null` al irse o al cerrar el menú. */
  onHighlight?: (highlight: CardTextHighlight | null) => void
  /** Lo que estoy haciendo y el rival tiene que ver (mirar mi deck, mi Extra Deck, mi cementerio o lo desterrado; elegir cómo jugar una carta); `null` si nada. Se llama sólo cuando cambia. */
  onActivity?: (activity: Activity | null) => void
  /** El reloj de turnos: va en el centro del campo, entre las dos Zonas Extra (la casilla `p2`, que en un duelo no lleva nada). */
  clock?: ReactNode
}

interface PracticeMatProps {
  session: MatSession
  state: MatState
  /** Las cartas del deck actual por id de copia ("card-123-2"). */
  cardsById: ReadonlyMap<string, MatCard>
  deckName: string
  onDispatch: (action: MatAction) => void
  onUndo: () => void
  onSeek: (step: number) => void
  onLoadCombo: (combo: SavedCombo) => void
  onNewHand: () => void
  /** Volver a la pantalla de antes (Jugar): sin esto la práctica no tiene salida más que el menú. Sólo en la práctica (el duelo trae la suya en su barra). */
  onExit?: () => void
  /** Debajo de la mano: las salidas y problemas de la mano inicial (aparece cuando terminó de repartirse). */
  footer?: ReactNode
  /** Cartas (por id) que brillan: las que cumplen la salida o el problema tocado. */
  highlighted?: ReadonlySet<string>
  highlightKind?: PatternKind | null
  /** Mano sin salida: las cartas de la mano se ven grises. */
  muted?: boolean
  /** Es un duelo por enlace: el campo del rival arriba del propio. */
  duel?: DuelMatLink
  /** El detalle fijo a la izquierda de la mesa, sólo en pantallas anchas (`DUEL_DETAIL_DOCK_MEDIA_QUERY`), para la práctica: en un duelo lo trae `duel.detail`. */
  detail?: ReactNode
  /** Se hizo click en una carta de la mesa (de la práctica): `detail` la muestra y queda fija. En un duelo es `duel.onPeek`. */
  onPeek?: (peek: { name: string; card: ApiCardReference | null }) => void
  /** Se pasó el mouse por una carta de la mesa (de la práctica): `detail` la muestra mientras no haya otra fija. En un duelo es `duel.onHover`. */
  onHover?: (peek: { name: string; card: ApiCardReference | null }) => void
  /** El pedazo del texto que `detail` resalta mientras se elige un efecto (en la práctica; en un duelo es `duel.onHighlight`). */
  onHighlight?: (highlight: CardTextHighlight | null) => void
}

/** Fuentes de arrastre que no son cartas: el tope del deck y la ficha. */
const DECK_TOP = 'deck-top'
const NEW_TOKEN = 'new-token'

/** La ficha se dibuja con la "Sheep Token" de YGOPRODeck, del mismo lugar de donde vienen las imágenes de todas las cartas. */
const TOKEN_ART = 'https://images.ygoprodeck.com/images/cards_small/73915052.jpg'
// El nombre se arma al leerlo (no al cargar el módulo): así sale en el idioma activo.
const TOKEN_CARD: MatCard = { get name() { return t('practice.token.name') }, apiCard: null, art: TOKEN_ART }
const UNKNOWN_CARD: MatCard = { get name() { return t('practice.card.unknown') }, apiCard: null }
/** Una carta del rival que todavía no mostró (el objetivo de un ataque a un monstruo boca abajo). */
const RIVAL_MONSTER: MatCard = { get name() { return t('practice.attack.rivalMonster') }, apiCard: null }
const EMPTY_IDS: ReadonlySet<string> = new Set()

/** Pausa antes de repartir la primera carta (el mazo se baraja antes: `riffle-*` dura 640 ms y se reparte cuando ya se golpeó contra la mesa) y entre carta y carta (el ritmo de quien reparte). */
const FIRST_DEAL_MS = 560
const NEXT_DEAL_MS = 105

/**
 * El borde y el velo de una casilla vacía: una línea fina **blanca** (`field-line`, como el campo de referencia: Gastón, 2026-10-19) con un velo parejo, para que la zona se lea como un lugar y no como un hueco.
 * Todas las casillas son iguales —las tuyas, las del rival, las pilas y las Zonas Extra—: no hay zonas de otro color; el color queda para lo que pasa (elegir, soltar una carta).
 */
/** El hueco de una casilla: más oscuro arriba y con una sombra hacia adentro, como una casilla grabada en la placa (la luz viene de arriba). */
const SLOT = 'bg-linear-to-b from-black/45 to-field-line/[0.05] shadow-[inset_0_3px_12px_rgb(0_0_0/0.65),inset_0_-1px_0_rgb(var(--field-line-rgb)/0.1)]'
const CELL_LOOK = `border border-solid border-field-line/50 ${SLOT}`
/** Las zonas del centro no se dibujan con el borde de su casilla cuadrada sino con las líneas de la carta (`ZoneLines`, como el tapete): el borde queda invisible (y se enciende al elegir o soltar una carta) y las de monstruos llevan el velo en toda la casilla. */
const CELL_LOOK_MONSTER = `border border-solid border-transparent ${SLOT}`
const CELL_LOOK_SPELL = 'border border-solid border-transparent'

/**
 * Lo que tiene toda casilla del campo o de una pila: su borde y velo (ver `CELL_LOOK`); se enciende con una carta arrastrada encima y se resalta cuando se está eligiendo.
 * La forma va aparte: ver `CELL`, `CELL_MONSTER` y `CELL_SPELL`.
 */
const cellLook = (look: string = CELL_LOOK) => [
  'relative min-w-0 transition-[color,background-color,border-color,box-shadow] duration-150',
  look,
  // Con una carta arrastrada encima: borde parejo, relleno y resplandor **ámbar** (el color de lo que se toca: sobre el fondo violeta de la mesa, el violeta no se distinguía; Gastón, 2026-10-20).
  'data-[over=true]:border-solid data-[over=true]:border-info data-[over=true]:bg-none data-[over=true]:bg-info/22 data-[over=true]:shadow-[0_0_0_2px_rgb(var(--info-rgb)/0.6),0_0_24px_rgb(var(--info-rgb)/0.5),inset_0_0_18px_rgb(var(--info-rgb)/0.3)]',
  // Una zona que se puede elegir: relleno ámbar claro y, encima, las esquinas y el rombo de `PickMarks` (las marcas de un visor).
  'data-[pick=true]:cursor-pointer data-[pick=true]:border-solid data-[pick=true]:border-info/55 data-[pick=true]:bg-none data-[pick=true]:bg-info/14 data-[pick=true]:hover:bg-info/26',
  'data-[chosen=true]:bg-none data-[chosen=true]:bg-info/40',
].join(' ')

/**
 * La zona de campo y las pilas (las columnas de los costados): del tamaño justo de una carta, que nunca se acuesta. Son angostas (38 px en un celular chico): el área que se toca crece 4 px a cada lado
 * (`before`, justo hasta la casilla vecina, que está a 4 px) sin agrandar lo que se ve.
 */
export const CELL = `aspect-[421/614] max-sm:w-[68.57%] max-sm:justify-self-center before:absolute before:-inset-1 ${cellLook()}`
/**
 * Las zonas del centro (monstruos, Mágicas y Trampas, Zonas Extra) son cuadradas, del lado largo de una carta: la carta entra parada (el alto de la casilla)
 * o acostada en defensa (el ancho de la casilla) con el mismo tamaño y sin salirse, así que dos cartas en defensa vecinas no se pisan ni se achican.
 */
export const CELL_MONSTER = `aspect-square ${cellLook(CELL_LOOK_MONSTER)}`
/** Mágicas y Trampas (y las escalas de péndulo): la casilla es cuadrada para que quepa igual, pero su línea es la de la carta parada. */
export const CELL_SPELL = `aspect-square ${cellLook(CELL_LOOK_SPELL)}`

/**
 * Las líneas de una zona del centro, como las del tapete (Gastón, 2026-10-19: «nos faltan las líneas del campo»): la carta **parada** (del alto de la casilla) y, en las de monstruos, la carta **acostada** (del ancho)
 * cruzadas en el medio, que juntas hacen la cruz de cada Main Monster Zone y de las Zonas Extra; las de Mágicas y Trampas, sólo la parada. Va adentro de la casilla, debajo de la carta, y no recibe toques.
 */
export function ZoneLines({ kind }: { kind: 'monster' | 'spell' }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      <span className={cx('absolute inset-y-0 left-1/2 w-[68.57%] -translate-x-1/2 border border-field-line/70', kind === 'spell' && 'bg-field-line/[0.05]')} />
      {kind === 'monster' ? <span className="absolute inset-x-0 top-1/2 h-[68.57%] -translate-y-1/2 border border-field-line/70" /> : null}
    </span>
  )
}
/** El ancho de una carta como parte de su alto (421 × 614 px): una carta parada en una casilla cuadrada mide ese tanto de ancho. */
const CARD_WIDTH_PER_HEIGHT = 421 / 614

/**
 * Carta en una zona del campo: arrastrable, sin menú de imagen ni selección (así el dedo no corta el arrastre). La posición y el tamaño los pone
 * `PlacedCard`. El brillo (salida verde / problema rojo), la atenuación, el destello y la marca de objetivo llegan por data-attributes.
 */
const MAT_CARD = [
  'block cursor-grab touch-none select-none overflow-hidden bg-input outline-none',
  '[-webkit-touch-callout:none] [-webkit-user-select:none] [&>*]:pointer-events-none [&_img]:[-webkit-user-drag:none]',
  '[--card-shadow:0_6px_14px_rgba(0,0,0,0.45),0_0_0_1px_rgb(var(--foreground-rgb)/0.1)]',
  // La sombra sale de `--card-shadow`: así el borde blanco de pasar el mouse y los aros de color se suman sin pisarse.
  '[box-shadow:var(--card-shadow)]',
  // Al cambiar de posición la carta se acuesta (o se para) pasándose un poco y volviendo; al pasar el mouse se eleva.
  CARD_TRANSITION,
  CARD_HOVER,
  'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-hover',
  'data-[dragging=true]:pointer-events-none data-[dragging=true]:opacity-30',
  'data-[dim=true]:brightness-[0.42] data-[dim=true]:saturate-[0.6]',
  'motion-safe:data-[glow=true]:animate-card-glow data-[glow=true]:[--glow-rgb:var(--accent-rgb)] data-[glow-kind=problem]:[--glow-rgb:var(--danger-rgb)] data-[glow-kind=respond]:[--glow-rgb:var(--warning-rgb)]!',
  'data-[glow=true]:shadow-[0_6px_14px_rgba(0,0,0,0.45),0_0_0_3px_rgb(var(--glow-rgb)),0_0_30px_5px_rgb(var(--glow-rgb)/0.7)]',
  // Activar, mostrar, declarar y marcar como objetivo: el aro de afuera (el marco de adentro y la mira son hijos de la carta).
  FX_CARD,
  'motion-reduce:animate-none motion-reduce:transition-none',
].join(' ')

/** Duración del destaque de una carta: lo que dura la carta grande en el centro de la pantalla (y el aro en su lugar). */
const ACTIVATE_MS = 950
/** Cuánto se queda el destello de una invocación (con lo que espera a que la carta aterrice) y el cartel de una fase. */
const LANDING_MS = 1300
const BANNER_MS = 1100
/** Cuánto se queda el marco de la mano cuando recibe una carta. */
const HAND_FLASH_MS = 900

/**
 * Dar vuelta una carta (boca abajo ↔ boca arriba), en 3D: gira hasta quedar de canto (ahí cambia la cara) y se abre del otro lado.
 * Se suma (`composite: 'add'`) a la `transform` que ya tiene la carta (su rotación de costado, el vuelo entre zonas) sin pisarla.
 */
const FLIP_FRAMES = [
  { transform: 'perspective(700px) rotateY(0deg)', easing: 'ease-in' },
  { transform: 'perspective(700px) rotateY(90deg)', offset: 0.5 },
  { transform: 'perspective(700px) rotateY(-90deg)', offset: 0.5, easing: 'ease-out' },
  { transform: 'perspective(700px) rotateY(0deg)' },
]
const FLIP_MS = 380

const ZONE_LABELS: Record<MatSpot, string> = {
  get mz() { return t('practice.zone.mz') },
  get emz() { return t('practice.zone.emz') },
  get st() { return t('practice.zone.st') },
  get field() { return t('practice.zone.field') },
}

/** Las zonas de péndulo (las puntas de la fila de magias y trampas) llevan la gema azul y la roja, como en la mesa real. */
export const PENDULUM_GEM: Record<number, string> = {
  0: 'bg-[#4aa8ff]/55 shadow-[0_0_10px_#4aa8ff80]',
  4: 'bg-[#ff4d6d]/55 shadow-[0_0_10px_#ff4d6d80]',
}

const artOf = (card: MatCard) => card.art ?? card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null

/**
 * Una jugada que todavía espera algo del jugador: los Sacrificios y/o la zona. `zone` es adonde sale la carta si ya se sabe;
 * `dropped`, que se la soltó ahí: se queda en esa zona mientras se eligen los Sacrificios o los materiales.
 */
type Picking =
  | { kind: 'zone'; label: string; action: Extract<MatAction, { type: 'place' | 'token' | 'tribute' | 'summon' }>; targets: MatTarget[] }
  | { kind: 'tributes'; label: string; required: number; chosen: string[]; action: Extract<MatAction, { type: 'tribute' }>; zone?: MatTarget; dropped?: boolean }
  /** Invocación desde el Extra: se tocan los materiales en el campo (los que sean, o ninguno) y se confirma con un botón; o se toca una casilla libre, iluminada, para invocar ahí. */
  | { kind: 'materials'; label: string; chosen: string[]; action: Extract<MatAction, { type: 'summon' }>; zone?: MatTarget; dropped?: boolean }

const NO_ART = () => null

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id])

/** Dos toques seguidos al mismo material (en escritorio) cuentan como doble clic: cuánto puede pasar entre uno y otro. */
const DOUBLE_CLICK_MS = 400

/** Reproducción de un combo: cuánto espera entre jugadas a velocidad normal (a 2× espera la mitad; a 0,5×, el doble). */
const AUTOPLAY_MS = 1400
/** Cuánto dura una marca de objetivo (Target) sobre una carta: pasado el plazo se quita sola. */
const TARGET_MS = 5000

/** `data-drop` y nombre de una zona de la mesa. */
const dropIdOf = (spot: MatSpot, index: number) => (spot === 'field' ? 'field' : `${spot}:${index}`)
const zoneLabelOf = (spot: MatSpot, index: number) => (spot === 'field' ? ZONE_LABELS.field : t('practice.zone.numbered', { zone: ZONE_LABELS[spot], n: index + 1 }))

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

/** Lo que hay que dibujar de un ataque: sus puntos en pantalla; nada si se pidió reducir el movimiento o no hay de dónde salir. */
const strikeOf = (spec: StrikeSpec): Strike | null => (prefersReducedMotion() ? null : measureStrike(spec))

export function PracticeMat({
  session,
  state,
  cardsById,
  deckName,
  onDispatch,
  onUndo,
  onSeek,
  onLoadCombo,
  onNewHand,
  onExit,
  footer,
  highlighted = EMPTY_IDS,
  highlightKind = null,
  muted = false,
  duel,
  detail: practiceDetail,
  onPeek: practicePeek,
  onHover: practiceHover,
  onHighlight: practiceHighlight,
}: PracticeMatProps) {
  // El detalle fijo de la izquierda y la carta que se tocó: de un duelo, o de la práctica.
  const detail = duel?.detail ?? practiceDetail
  const onPeek = duel?.onPeek ?? practicePeek
  const onHover = duel?.onHover ?? practiceHover
  const onRivalHover = duel?.onRivalHover
  const onHighlight = duel?.onHighlight ?? practiceHighlight
  // Con el panel de la derecha (los pasos de la práctica o el chat de un duelo) y el detalle a la izquierda, la mesa queda entre los dos.
  const sidePanel = !duel || Boolean(duel.aside)
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // Celular en vertical: el campo del duelo se ajusta al alto de la pantalla para que se vea tu mano (ver `compact-field.ts`).
  const compact = useMediaQuery(COMPACT_FIELD_MEDIA_QUERY)
  // Laterales: en un duelo de escritorio, si la columna de la mesa tiene ancho de sobra, lo que rodea al campo va a sus costados (ver `duel-rails.ts`).
  const columnRef = useRef<HTMLDivElement | null>(null)
  const columnSize = useElementSize(columnRef)
  const rails = Boolean(duel) && isDesktop && railsFit(columnSize.width, columnSize.height)
  // La mesa (la práctica y la del duelo) mantiene la pantalla encendida: se piensa y se espera sin tocarla.
  useWakeLock(true)

  // Las cartas de un combo guardado pueden no estar más en el deck: se buscan por carta (otra copia) o se bajan.
  const byCardId = useMemo(() => {
    const map = new Map<string, MatCard>()
    for (const [drawId, card] of cardsById) {
      map.set(cardIdOfDrawId(drawId), card)
    }
    return map
  }, [cardsById])
  const [fetched, setFetched] = useState<ReadonlyMap<number, MatCard>>(new Map())
  const requestedRef = useRef(new Set<number>())

  const cardOf = useCallback(
    (shown: string): MatCard => {
      if (isToken(shown)) return TOKEN_CARD

      // Un id del rival (el objetivo de un ataque, o una carta suya que controlo: `f.c12`) se resuelve por la carta que él mostró; si no mostró ninguna, no se sabe cuál es.
      const id = duel && isOpaqueId(shown) ? duel.foreignKnown[shown] : duel && isForeignId(shown) ? duel.foreignKnown[opaqueOfForeign(shown)] : shown
      if (id === undefined) return RIVAL_MONSTER

      const known = cardsById.get(id) ?? byCardId.get(cardIdOfDrawId(id))
      if (known) return known

      const ygoId = parseDerivedCardId(cardIdOfDrawId(id))
      const remote = ygoId === null ? undefined : fetched.get(ygoId)
      return remote ?? { name: session.names[id] ?? UNKNOWN_CARD.name, apiCard: null }
    },
    [cardsById, byCardId, fetched, session.names, duel],
  )

  useEffect(() => {
    // Con los monstruos del rival a los que se puede atacar, también sus nombres (los de su deck no están en `cardsById`).
    const rivals = duel ? [...duel.attackTargets.map((target) => duel.foreignKnown[target.id]), ...allMatIds(state).filter(isForeignId).map((id) => duel.foreignKnown[opaqueOfForeign(id)])].flatMap((id) => id ?? []) : []
    const missing = [...new Set([...allMatIds(state), ...rivals].map(cardIdOfDrawId))]
      .filter((cardId) => !byCardId.has(cardId))
      .map(parseDerivedCardId)
      .filter((ygoId): ygoId is number => ygoId !== null && !fetched.has(ygoId) && !requestedRef.current.has(ygoId))

    if (missing.length === 0) return

    missing.forEach((ygoId) => requestedRef.current.add(ygoId))
    void fetchCardsByIds(missing)
      .then((cards) => setFetched((current) => new Map([...current, ...cards.map((card) => [card.ygoprodeckId, { name: card.name, apiCard: card }] as const)])))
      .catch(() => {})
  }, [state, byCardId, fetched, duel])

  // El dorso se pide una vez, al abrir la mesa: así está en la caché cuando se reparte la mano o una carta se da vuelta.
  useEffect(() => {
    new Image().src = CARD_BACK_URL
  }, [])

  const nameOf = useCallback((id: string) => cardOf(id).name, [cardOf])
  const kindOf = useCallback((id: string) => (isToken(id) ? TOKEN_KIND : cardKindOf(cardOf(id).apiCard)), [cardOf])
  // A quiénes se puede atacar (en un duelo): los monstruos del rival en el campo, nombrados sólo por su carta (Gastón, 2026-10-19: «solo el nombre»); si no la mostró, «Boca abajo». También se eligen tocándolos en el campo.
  const attackTargets = useMemo<AttackTarget[]>(
    () =>
      (duel?.attackTargets ?? []).map(({ id, faceDown }) => ({
        id,
        label: faceDown ? t('practice.attack.faceDown') : nameOf(id),
      })),
    [duel, nameOf],
  )
  const steps = useMemo(() => describeMatSteps(session.initial, session.actions, nameOf), [session.initial, session.actions, nameOf])
  // La lista de pasos: la frase de cada jugada, las miniaturas de las cartas que mueve (hasta tres, las que tienen imagen) y si es un cambio de fase.
  const stepCards = useMemo(() => matStepCards(session.initial, session.actions), [session.initial, session.actions])
  const panelSteps = useMemo<PanelStep[]>(
    () =>
      steps.map((label, index) => ({
        label,
        divider: session.actions[index]?.type === 'phase',
        cards: (stepCards[index] ?? []).slice(0, 3).flatMap((id) => {
          const art = artOf(cardOf(id))

          return art ? [{ name: cardOf(id).name, art }] : []
        }),
      })),
    [steps, stepCards, session.actions, cardOf],
  )
  const live = session.cursor === session.actions.length

  const [menu, setMenu] = useState<
    /**
     * `ask`: la opción elegida que pregunta cómo ("¿En ataque o en defensa?", "¿Boca arriba o boca abajo?"): la pregunta se muestra en el mismo menú.
     * `drop`: la zona donde se soltó la carta; el menú ofrece lo que la saca ahí y la carta se queda en la zona mientras se elige (si se cancela, vuelve).
     */
    | { kind: 'card'; id: string; rect: DOMRect; ask?: MatMenuItem; drop?: MatTarget }
    | { kind: 'deck'; rect: DOMRect; ask?: MatMenuItem }
    /** La ficha: sale en ataque o en defensa, en la zona donde se soltó (`zone`) o en la que se elija después. */
    /** Desde el botón +: primero qué agregar (`root`: una ficha o un contador) y, de la ficha, la posición; soltada en una zona libre, directo la posición. */
    | { kind: 'token'; rect: DOMRect; zone?: MatTarget; root?: true }
    /** Las fases de un duelo: el botón de la fase de ahora las muestra (cambiar de fase es elegir una). */
    | { kind: 'phases'; rect: DOMRect }
    | null
  >(null)
  const [viewer, setViewer] = useState<MatPile | null>(null)
  const [inspected, setInspected] = useState<{ id: string; rect: DOMRect } | null>(null)
  // La pausa y el final del duelo tapan la mesa: un menú o el detalle de una carta que estaba abierto se cierra, y el visor de una pila se esconde (sigue abierto: al cerrar el deck se baraja, y eso no es de la pausa).
  const covered = Boolean(duel?.cover)

  useEffect(() => {
    if (covered) {
      setMenu(null)
      setInspected(null)
    }
  }, [covered])
  const [saving, setSaving] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [combos, setCombos] = useState<SavedCombo[]>(() => readSavedCombos())
  const [picking, setPicking] = useState<Picking | null>(null)
  // Lo que se hace y el rival ve: mirar una pila (el visor abierto) o elegir cómo jugar una carta (materiales, Sacrificios, zona).
  const activity: Activity | null = viewer !== null && viewer !== 'hand' ? viewer : picking !== null ? 'choosing' : null
  const onActivity = duel?.onActivity

  useEffect(() => {
    onActivity?.(activity)
  }, [activity, onActivity])
  // Poner o quitar contadores: las cartas del campo se encienden y cada toque suma o resta uno, hasta tocar "Listo" (no es un `picking` porque sigue después de cada jugada).
  // Celular: la pregunta de terminar el turno (se abre al tocar el botón de la End Phase).
  const [endingTurn, setEndingTurn] = useState(false)
  const [counterMode, setCounterMode] = useState<1 | -1 | null>(null)
  // La carta que acaba de destacarse (activada, mostrada, declarada o marcada como objetivo) destella un instante; la `key` repite el destello si pasa dos veces seguidas.
  const [flash, setFlash] = useState<{ id: string; key: number; kind: SpotlightKind } | null>(null)
  // La zona donde acaba de caer un monstruo y el cartel de la fase nueva: cada uno se va solo.
  const [landing, setLanding] = useState<{ spot: MatSpot; index: number; tone: LandingTone; flies: boolean; key: number } | null>(null)
  const [banner, setBanner] = useState<{ phase: MatPhase; turn: number | null; key: number } | null>(null)
  // Las cartas grandes del centro (activar, mostrar, declarar y, al reproducir un combo, lo que mueve cada paso) y el marco de la mano cuando recibe una carta.
  const [stage, setStage] = useState<{ ids: string[]; kind: SpotlightKind | ShowcaseKind; flip?: true; step: number; key: number } | null>(null)
  const [handFlash, setHandFlash] = useState<number | null>(null)
  // El ataque que cruza la mesa (el propio o el del rival): se mide al empezar y `AttackFx` se saca solo al terminar.
  const [strike, setStrike] = useState<Strike | null>(null)
  const sectionRef = useRef<HTMLElement | null>(null)
  const view = useMatView()
  const isDuel = Boolean(duel)
  // Los sonidos de la práctica (Gastón, 2026-10-20: «en la práctica no suenan los efectos del duelo»): cada jugada, deshacer y los pasos de un combo. En un duelo suenan con `useDuelSounds`, las de los dos.
  usePracticeSounds(isDuel ? null : session)
  const sounds = useSoundsOn()
  // Ventana grande (Gastón, 2026-10-19: «la práctica no tiene modo pantalla completa y debería»): la práctica ocupa toda la pantalla, sin el menú lateral, como la mesa de un duelo. Es de la mesa: se apaga al salir.
  const bigWindow = useDuelFullscreen()

  useEffect(() => {
    if (isDuel) return

    return () => setDuelFullscreen(false)
  }, [isDuel])

  useEscapeKey(() => setPicking(null), picking !== null)
  useEscapeKey(() => setCounterMode(null), counterMode !== null)

  useEffect(() => {
    if (!flash) return
    const timer = window.setTimeout(() => setFlash(null), ACTIVATE_MS)
    return () => window.clearTimeout(timer)
  }, [flash])

  useEffect(() => {
    if (!stage) return
    const timer = window.setTimeout(() => setStage(null), ACTIVATE_MS)
    return () => window.clearTimeout(timer)
  }, [stage])

  useEffect(() => {
    if (handFlash === null) return
    const timer = window.setTimeout(() => setHandFlash(null), HAND_FLASH_MS)
    return () => window.clearTimeout(timer)
  }, [handFlash])

  useEffect(() => {
    if (!landing) return
    const timer = window.setTimeout(() => setLanding(null), LANDING_MS)
    return () => window.clearTimeout(timer)
  }, [landing])

  useEffect(() => {
    if (!banner) return
    const timer = window.setTimeout(() => setBanner(null), BANNER_MS)
    return () => window.clearTimeout(timer)
  }, [banner])

  // Los efectos salen con cada paso que avanza (jugadas propias y replay por igual): ver `matEffects`. Deshacer o saltar de paso no los repite.
  const lastCursorRef = useRef(session.cursor)
  // La carta que estaba soltada en una zona (esperando) hasta la jugada anterior: ya está ahí, así que su destello no espera ningún vuelo.
  const pendingRef = useRef<string | null>(null)

  useEffect(() => {
    const previous = lastCursorRef.current
    lastCursorRef.current = session.cursor

    if (session.cursor !== previous + 1) {
      // Deshacer, saltar a otro paso, una mano nueva o cargar otro combo: lo que estaba en curso se corta (no era de este paso).
      setFlash(null)
      setStage(null)
      setLanding(null)
      setBanner(null)
      setHandFlash(null)
      setStrike(null)
      return
    }

    const action = session.actions[session.cursor - 1]

    if (!action) return

    const effects = matEffects(replayMat(session.initial, session.actions, session.cursor - 1), action)
    const key = Date.now()

    if (effects.spotlight) setFlash({ ...effects.spotlight, key })
    // Atacar no agranda la carta: la espada va del atacante a su objetivo (a una carta del rival, o directo a su barra de vida; sin rival, al borde de la mesa).
    if (action.type === 'attack') {
      setStrike(strikeOf({ from: `[data-card-id="${action.id}"]`, to: action.target === undefined ? undefined : `[data-rival-card-id="${action.target}"]`, direct: 'theirs', bounds: sectionRef.current }))
    }
    // Activar, mostrar y declarar agrandan la carta siempre; marcar un objetivo o atacar, nunca; y reproduciendo un combo, cada paso que mueve cartas las muestra.
    // Un paso que no muestra nada saca las cartas del paso anterior (que seguirían con la línea de éste).
    setStage(
      effects.spotlight && effects.spotlight.kind !== 'target' && effects.spotlight.kind !== 'attack'
        ? { ids: [effects.spotlight.id], kind: effects.spotlight.kind, step: session.cursor, key }
        : effects.showcase && session.replay
          ? { ...effects.showcase, step: session.cursor, key }
          : null,
    )
    if (effects.landing) setLanding({ ...effects.landing, flies: effects.landing.flies && !('id' in action && action.id === pendingRef.current), key })
    if (effects.banner) setBanner({ ...effects.banner, key })
    if (effects.hand) setHandFlash(key)
    // Tocar el deck o sumar una carta a la mano: los dos se barajan (el deck con su animación, la mano carta por carta).
    if (effects.shuffle) {
      setShuffleKey((current) => current + 1)
      riffle(sectionRef.current?.querySelectorAll('[data-drop="hand"] [role="listitem"]') ?? [])
    }
  }, [session.cursor, session.actions, session.initial, session.replay])

  // El ataque del rival: la espada sale de su monstruo hacia la carta tuya atacada, o hacia tu barra de vida si es directo. `announcement` es el mismo objeto hasta que llega otro ataque.
  const announcement = duel?.announcement

  useEffect(() => {
    if (announcement) {
      setStrike(strikeOf({ from: `[data-rival-card-id="${announcement.attackerId}"]`, to: announcement.targetId === undefined ? undefined : `[data-card-id="${announcement.targetId}"]`, direct: 'mine', bounds: sectionRef.current }))
    }
  }, [announcement])

  // La mano: el orden que le dio el jugador, y el reparto de a una carta desde el mazo (que se baraja con cada mano nueva).
  const [handOrder, setHandOrder] = useState<string[]>([])
  const [dealt, setDealt] = useState(0)
  const [shuffleKey, setShuffleKey] = useState(0)
  const deckRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLDivElement | null>(null)
  // El campo se dibuja cuando ya hay mano repartida: el efecto de abajo lo espera (por eso es estado y no sólo una referencia).
  const [fieldNode, setFieldNode] = useState<HTMLDivElement | null>(null)
  const setField = useCallback((node: HTMLDivElement | null) => {
    fieldRef.current = node
    setFieldNode(node)
  }, [])

  // La vista 3D se agranda hasta ocupar el lugar que tiene (la inclinación le quita alto y la perspectiva, fondo): el campo con la mano del rival crece parejo desde su borde de abajo (que no se mueve, así la mano
  // y todo lo de abajo siguen en su lugar) hasta donde entra a lo ancho y hasta la barra de arriba. Se mide a tamaño natural y se le avisa al CSS con `--field-zoom`; no cambia el diseño (la grilla ni el scroll).
  useLayoutEffect(() => {
    const field = fieldNode
    const column = columnRef.current

    if (!field || !column) {
      return
    }

    if (view !== '3d' || !isDesktop) {
      field.style.removeProperty('--field-zoom')

      return
    }

    const measure = () => {
      field.style.setProperty('--field-zoom', '1')

      const box = field.getBoundingClientRect()
      const hand = field.querySelector('[data-rival-drop="hand"]')?.getBoundingClientRect()
      const area = column.getBoundingClientRect()
      // Con la barra de arriba dentro de la columna (sin laterales) el campo no puede subir más que ella; con laterales, la barra está a los costados.
      const headerBottom = isDuel && !rails ? (column.firstElementChild?.getBoundingClientRect().bottom ?? area.top) : area.top
      // El ancho del campo son sus casillas (la grilla se centra y puede ser más angosta que su caja).
      const style = getComputedStyle(field)
      const tracks = style.gridTemplateColumns.split(' ').map(parseFloat).filter(Number.isFinite)
      const tracksWidth = tracks.reduce((sum, track) => sum + track, 0) + (parseFloat(style.columnGap) || 0) * Math.max(0, tracks.length - 1)
      const zoom = fieldZoom({
        width: tracksWidth || box.width,
        height: box.bottom - Math.min(box.top, hand?.top ?? box.top),
        availWidth: area.width - (rails ? RAILS_SIDE_RESERVE_PX : 32),
        availHeight: box.bottom - Math.max(area.top, headerBottom) - 8,
      })

      field.style.setProperty('--field-zoom', String(Math.round(zoom * 1000) / 1000))
    }

    measure()

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)

    observer?.observe(column)
    observer?.observe(field)

    return () => {
      observer?.disconnect()
      field.style.removeProperty('--field-zoom')
    }
  }, [fieldNode, view, isDesktop, isDuel, rails])
  // El reparto de una mano nueva suena (el barajado y una carta por vez); las cartas que se suman después, por una jugada, ya suenan con ella.
  const initialDealRef = useRef(true)

  useEffect(() => {
    initialDealRef.current = true
    setHandOrder([])
    setDealt(0)
    setShuffleKey((key) => key + 1)
    setPicking(null)
    setCounterMode(null)
    playSfx('shuffle')
  }, [session.initial])

  const handTotal = state.hand.length

  useEffect(() => {
    if (dealt >= handTotal) {
      initialDealRef.current = false
      return
    }

    if (prefersReducedMotion()) {
      setDealt(handTotal)
      return
    }

    const timer = window.setTimeout(
      () => {
        if (initialDealRef.current) playSfx('draw')
        setDealt((count) => count + 1)
      },
      dealt === 0 ? FIRST_DEAL_MS : NEXT_DEAL_MS,
    )
    return () => window.clearTimeout(timer)
  }, [dealt, handTotal])

  // La carta soltada en una zona que todavía espera que se elija cómo sale (el menú de esa zona, o los Sacrificios o materiales) se queda en la zona,
  // en vez de volver a la mano; si se cancela, vuelve. Sin jugada no hay cambio de estado: es sólo cómo se la dibuja mientras tanto.
  const pending = useMemo<({ id: string } & MatTarget) | null>(() => {
    const waiting =
      menu?.kind === 'card' && menu.drop
        ? { id: menu.id, ...menu.drop }
        : (picking?.kind === 'tributes' || picking?.kind === 'materials') && picking.dropped && picking.zone
          ? { id: picking.action.id, ...picking.zone }
          : null

    // Sólo espera mientras la mesa sigue como estaba al soltarla (la carta en una pila y la zona libre): si cambió por debajo (deshacer, un arrastre
    // a esa zona), no hay nada que dibujar esperando y la carta se queda donde está.
    return waiting && locateCard(state, waiting.id)?.kind === 'pile' && !placedAt(state, waiting.zone, waiting.index) ? waiting : null
  }, [menu, picking, state])
  const pendingId = pending?.id ?? null

  // Si la mesa cambia por debajo de lo que esperaba una elección (deshacer, un paso del panel, un arrastre, otro combo), el menú y los Sacrificios o
  // materiales que se estaban eligiendo ya no valen: se cancelan. Jugar desde el menú ya los cierra por su cuenta.
  // Una marca de objetivo que se quita sola (ver `TARGET_MS`) es una jugada más, pero no mueve nada: no cancela lo que se estaba eligiendo.
  const lastType = session.actions[session.cursor - 1]?.type
  useEffect(() => {
    if (lastType === 'target') return

    setMenu(null)
    setPicking(null)
  }, [session.cursor, session.initial, lastType])

  // Va después del efecto del paso (que lee la anterior): al jugarse, la carta ya no está esperando.
  useEffect(() => {
    pendingRef.current = pendingId
  }, [pendingId])

  const orderedHand = useMemo(() => mergeHandOrder(handOrder, state.hand), [handOrder, state.hand])
  const handCards = useMemo<HandCardData[]>(() => orderedHand.slice(0, dealt).filter((id) => id !== pendingId).map((id) => ({ id, ...cardOf(id) })), [orderedHand, dealt, cardOf, pendingId])
  const isDealt = dealt >= handTotal

  // Las cartas vuelan entre zonas con cada jugada (y al reproducir un combo).
  const artById = useCallback((id: string) => artOf(cardOf(id)), [cardOf])
  // Las cartas se miden de nuevo cuando todo quedó quieto (ver `useCardFlights`): si no, el reparto, una carta robada o buscada y la mano reacomodada
  // dejaban la medida de cuando todavía volaban, y la próxima jugada arrancaba de ahí (desde el mazo, con una carta gigante y estirada).
  const { dealsFromDeck } = useCardFlights(sectionRef, state, artById, `${isDesktop}:${dealt}:${handOrder.join(',')}:${pendingId ?? ''}`)
  // El rival tocó su deck o sumó una carta a su mano: su deck y su mano se barajan (lo ve quien mira).
  const rivalShuffle = duel?.rivalShuffle ?? 0
  useEffect(() => {
    if (rivalShuffle === 0) return

    const root = sectionRef.current
    riffle(root?.querySelectorAll('[data-rival-drop="deck"] [data-layer]') ?? [])
    riffle(root?.querySelectorAll('[data-rival-drop="hand"] [role="img"] > span') ?? [])
  }, [rivalShuffle])
  // Las cartas del rival, con sus propias marcas en el DOM (`data-rival-card-id`, `data-rival-drop`).
  useCardFlights(sectionRef, duel?.rivalFlights?.state ?? null, duel?.rivalFlights?.artOf ?? NO_ART, 'rival', 'theirs')

  // Reproducir un combo: las jugadas avanzan solas (arranca al cargarlo; cualquier jugada propia lo pausa), más rápido con el avance rápido.
  const [autoplay, setAutoplay] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)

  useEffect(() => {
    if (!autoplay || !isDealt) return

    if (session.cursor >= session.actions.length) {
      setAutoplay(false)
      return
    }

    const timer = window.setTimeout(() => onSeek(session.cursor + 1), AUTOPLAY_MS / speed)
    return () => window.clearTimeout(timer)
  }, [autoplay, isDealt, session.cursor, session.actions.length, onSeek, speed])

  // Abrir un menú o elegir Sacrificios también pausa la reproducción: si no, los pasos seguirían avanzando por debajo de lo que se está eligiendo.
  useEffect(() => {
    if (menu || picking || counterMode !== null) setAutoplay(false)
  }, [menu, picking, counterMode])

  // Una marca de objetivo dura `TARGET_MS` y se quita sola, con la misma jugada que la saca a mano (así el rival también la ve irse). Si se está repasando un combo, no se toca.
  const dispatchRef = useRef(onDispatch)
  const targetTimers = useRef(new Map<string, number>())
  const idle = session.cursor === session.actions.length && !autoplay

  useEffect(() => {
    dispatchRef.current = onDispatch
  }, [onDispatch])

  useEffect(() => {
    const timers = targetTimers.current

    for (const [id, timer] of timers) {
      if (!idle || !state.targeted.includes(id)) {
        window.clearTimeout(timer)
        timers.delete(id)
      }
    }

    if (!idle) return

    for (const id of state.targeted) {
      if (!timers.has(id)) {
        timers.set(id, window.setTimeout(() => { timers.delete(id); dispatchRef.current({ type: 'target', id }) }, TARGET_MS))
      }
    }
  }, [state.targeted, idle])

  useEffect(() => {
    const timers = targetTimers.current

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const closeViewer = useCallback(() => {
    // Después de mirar el deck sin sacar nada se baraja, como en la mesa real (y la jugada queda anotada).
    if (viewer === 'deck') {
      onDispatch({ type: 'shuffle', seed: randomSeed() })
      setShuffleKey((key) => key + 1)
    }

    setViewer(null)
  }, [viewer, onDispatch])

  /** Sacar una carta mirando el deck: el resto se baraja en la misma jugada (buscar = un paso, que se deshace entero). */
  const searching = useCallback(
    (action: MatAction): action is Extract<MatAction, { type: 'move' | 'place' }> =>
      viewer === 'deck' && (action.type === 'move' || action.type === 'place') && state.deck.includes(action.id),
    [viewer, state.deck],
  )

  // El asistente de la mesa (`app/mat-assistant.ts`): se acuerda de lo que se activó acá para decirlo **en el menú**, en voz baja, cuando se elige qué efecto activar («Ya lo usaste este turno»). No hay ningún cartel: sin manejo de
  // cadenas, activar otra vez un efecto es la forma de preguntarle al rival si quiere responder (Gastón, 2026-10-20), así que repetir una activación no es un error de nadie.
  const activationsRef = useRef<Activation[]>([])
  const turnNumber = duel?.turnNumber ?? state.turn
  // Los efectos de cada carta, por separado, llegan en un archivo aparte: cuando llegan, el menú de una carta se vuelve a armar.
  const [effectsReady, setEffectsReady] = useState(cardEffectMapLoaded)

  useEffect(() => {
    void loadCardEffects()
    void loadCardEffectMap().then(() => setEffectsReady(true))
  }, [])

  // `action` es la jugada que activa la carta `id`: `activate` (el efecto de una carta boca arriba, de una de la mano o del Cementerio) o, en una Mágica o una Trampa, la carta que queda boca arriba (`spellTrapActivation`).
  const recordUsage = useCallback(
    (action: MatAction, id: string) => {
      const card = cardOf(id)
      const api = card.apiCard
      const passcode = api?.ygoprodeckId
      const effectIndex = action.type === 'activate' ? action.effect : undefined

      if (passcode === undefined || isForeignId(id)) return

      // Con el efecto elegido (en una carta que se cuenta por efecto) vale el límite de **ese** efecto; si no, el de la carta entera. Al activar una Mágica o una Trampa (dejarla boca arriba) vale sólo el límite de la activación.
      const effect = effectIndex === undefined ? undefined : countableEffects(cardEffects(passcode, api?.description ?? '').effects)?.[effectIndex]
      const activation = action.type !== 'activate'
      const cardFacts = getCardEffectFacts(passcode) ?? 0
      const facts = effect ? effect.facts : activation ? activationFacts(cardFacts) : cardFacts

      if ((facts & LIMIT_FACTS) === 0) return

      // Sólo cuentan las activaciones que siguen en el registro: si se deshizo una, no cuenta.
      const live = new Set<MatAction>(session.actions)
      const past = activationsRef.current.filter((activation) => live.has(activation.action))
      const key = effect && effectIndex !== undefined ? effectKey(facts, passcode, id, effectIndex) : limitKey(facts, passcode, id)

      activationsRef.current = [...past, { action, turn: turnNumber, key }]
    },
    [cardOf, session.actions, turnNumber],
  )

  const play = useCallback(
    (action: MatAction) => {
      const searched = searching(action)
      const played: MatAction = searched ? { ...action, shuffle: randomSeed() } : action
      const activated = played.type === 'activate' ? played.id : spellTrapActivation(state, played, kindOf)
      // Las reglas de turno (una Invocación Normal, una de Péndulo): avisa, no frena.
      const repeated = repeatedTurnRule(session.initial, session.actions.slice(0, session.cursor), played)

      onDispatch(played)
      if (activated !== null) recordUsage(played, activated)
      if (repeated !== null) showToastMessage(t(repeated === 'normalSummon' ? 'practice.assistant.normalAgain' : 'practice.assistant.pendulumAgain'), 'warning')
      setMenu(null)
      setPicking(null)
      setAutoplay(false)

      if (played.type === 'shuffle' || ((played.type === 'move' || played.type === 'place') && played.shuffle !== undefined)) {
        setShuffleKey((key) => key + 1)
      }

      if (searched) {
        setViewer(null)
      } else if (viewer && played.type !== 'target') {
        // Poner un target no mueve la carta: el visor sigue abierto (para elegir otra y ver la mira caer sobre ella).
        closeViewer()
      }
    },
    [onDispatch, viewer, closeViewer, searching, recordUsage, state, kindOf, session.initial, session.actions, session.cursor],
  )

  // Eligiendo a quién atacar (el segundo paso de «Atacar»): el menú no tapa la mesa y se toca el monstruo del rival en el campo; los que se pueden atacar laten (`data-attack-target`, ver index.css).
  const attackAsk = menu?.kind === 'card' && menu.ask?.choices?.some((choice) => choice.action.type === 'attack') ? menu : null
  const attackerId = attackAsk?.id ?? null

  useEffect(() => {
    const section = sectionRef.current

    if (!attackerId || !section) return

    const marked = attackTargets.flatMap((target) => {
      const card = section.querySelector<HTMLElement>(`[data-rival-card-id="${CSS.escape(target.id)}"]`)

      card?.setAttribute('data-attack-target', 'true')

      return card ? [card] : []
    })

    // Un toque en un monstruo del rival lo ataca (antes que su menú de Señalar y Target); un toque en otra carta suya cierra este menú, que no tiene nada que ver.
    const onClick = (event: MouseEvent) => {
      const card = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-rival-card-id]') : null

      if (!card) return

      const target = attackTargets.find((entry) => entry.id === card.dataset.rivalCardId)

      if (!target) {
        setMenu(null)
        return
      }

      event.stopPropagation()
      event.preventDefault()
      play({ type: 'attack', id: attackerId, target: target.id })
    }

    section.addEventListener('click', onClick, true)

    return () => {
      section.removeEventListener('click', onClick, true)
      marked.forEach((card) => card.removeAttribute('data-attack-target'))
    }
  }, [attackerId, attackTargets, play])

  /** Una jugada del menú: con Sacrificios primero se eligen; si puede salir a varias zonas, la mesa pide elegir una (como "Choose Zones" en DuelingBook). */
  const choose = useCallback(
    (item: MatMenuItem, dropped?: MatTarget) => {
      // Segundo paso del menú ("¿En ataque o en defensa?"): la pregunta se muestra en el mismo menú.
      if (item.choices) {
        setMenu((current) => (current && current.kind !== 'token' && current.kind !== 'phases' ? { ...current, ask: item } : current))
        return
      }

      // "Al deck: al azar": la carta se pone en el deck y se baraja todo con una semilla nueva.
      if (item.shuffleDeck && item.action.type === 'move') {
        play({ ...item.action, shuffle: randomSeed() })
        return
      }

      const pick = (picking: Picking) => {
        setMenu(null)

        // La carta sale del deck recién al elegir la zona: la jugada ya lleva el barajado y el visor se cierra sin barajar aparte.
        if (picking.kind === 'zone' && picking.action.type === 'place' && searching(picking.action)) {
          setPicking({ ...picking, action: { ...picking.action, shuffle: randomSeed() } })
          setViewer(null)
          return
        }

        setPicking(picking)

        if (viewer) {
          closeViewer()
        }
      }

      // La zona se fija sólo si se soltó la carta en una: si no, se elige al final entre las que quedan libres contando las que se liberan (la única libre de antes no vale por sí sola).
      if (item.tributes && item.action.type === 'tribute') {
        pick({ kind: 'tributes', label: item.label, required: item.tributes, chosen: [], action: item.action, zone: dropped, dropped: dropped !== undefined })
        return
      }

      if (item.materials && item.action.type === 'summon') {
        pick({ kind: 'materials', label: item.label, chosen: [], action: item.action, zone: dropped, dropped: dropped !== undefined })
        return
      }

      if (item.targets && item.targets.length > 1 && item.action.type === 'place') {
        pick({ kind: 'zone', label: item.label, action: item.action, targets: item.targets })
        return
      }

      play(item.action)
    },
    [play, viewer, closeViewer, searching],
  )

  const pickZone = (zone: MatSpot, index: number) => {
    // Invocando desde el Extra, tocar una casilla libre invoca ahí con los materiales que haya (o sin ninguno).
    if (picking?.kind === 'materials') {
      if (!picking.zone && (zone === 'mz' || zone === 'emz')) summonAfter(picking.label, { ...picking.action, materials: picking.chosen }, picking.chosen, { zone, index })
      return
    }

    if (picking?.kind !== 'zone') return

    if (picking.action.type === 'token' || picking.action.type === 'tribute' || picking.action.type === 'summon') {
      if (zone === 'mz' || zone === 'emz') play({ ...picking.action, zone, index })
      return
    }

    play({ ...picking.action, zone, index })
  }

  /** Con los Sacrificios o los materiales elegidos (que dejan el campo), la carta sale a la zona donde se soltó (si sigue libre) o la mesa pide elegir una: confirmar (botón, doble clic) nunca decide la casilla, ni siquiera si queda una sola libre. */
  const summonAfter = (label: string, action: Extract<MatAction, { type: 'tribute' | 'summon' }>, removed: string[], dropped?: MatTarget) => {
    const after = removed.reduce((current, id) => matReducer(current, { type: 'move', id, to: 'gy' }), state)
    const targets = freeTargets(after, monsterZones(action.type === 'summon'), duel?.rivalEmz)
    const zone = dropped && targets.some((target) => target.zone === dropped.zone && target.index === dropped.index) ? dropped : null

    if (zone) play({ ...action, zone: zone.zone as 'mz' | 'emz', index: zone.index })
    else if (targets.length > 0) setPicking({ kind: 'zone', label, action, targets })
  }

  /** Un monstruo del campo elegido como Sacrificio; con todos elegidos, se pasa a la zona. */
  const pickTribute = (id: string) => {
    if (picking?.kind !== 'tributes') return

    const chosen = toggle(picking.chosen, id)

    if (chosen.length < picking.required) setPicking({ ...picking, chosen })
    else summonAfter(picking.label, { ...picking.action, tributes: chosen }, chosen, picking.zone)
  }

  /** Un monstruo del campo elegido (o deselegido) como material de una Invocación desde el Extra; se confirma con el botón (o, en escritorio, con doble clic en el único material). */
  const lastMaterialTap = useRef<{ id: string; at: number } | null>(null)
  const pickMaterial = (id: string) => {
    if (picking?.kind !== 'materials') return

    const now = Date.now()
    const last = lastMaterialTap.current
    lastMaterialTap.current = { id, at: now }

    // El primer clic lo dejó como único material: el segundo, enseguida y sobre el mismo, confirma sin buscar el botón.
    if (isDesktop && last?.id === id && now - last.at <= DOUBLE_CLICK_MS && picking.chosen.length === 1 && picking.chosen[0] === id) {
      lastMaterialTap.current = null
      summonAfter(picking.label, { ...picking.action, materials: picking.chosen }, picking.chosen, picking.zone)
      return
    }

    setPicking({ ...picking, chosen: toggle(picking.chosen, id) })
  }

  const confirmMaterials = () => {
    // Sin materiales también se invoca: los materiales son una opción, no un requisito.
    if (picking?.kind === 'materials') summonAfter(picking.label, { ...picking.action, materials: picking.chosen }, picking.chosen, picking.zone)
  }

  /** La ficha en esa posición: en la zona donde se soltó, en la única libre, o la mesa pide tocar una zona (de las principales: una ficha no viene del Extra). */
  const summonToken = useCallback(
    (pos: 'atk' | 'def', dropped?: MatTarget) => {
      const targets = freeTargets(state, monsterZones(false))
      const first = dropped ?? targets[0]

      if (!first) {
        setMenu(null)
        return
      }

      const action = { type: 'token' as const, zone: first.zone as 'mz' | 'emz', index: first.index, pos }

      if (dropped || targets.length === 1) {
        play(action)
      } else {
        setMenu(null)
        setPicking({ kind: 'zone', label: t('practice.token.the'), action, targets })
      }
    },
    [state, play],
  )

  // El mouse sobre una carta (la propia, o la del rival a la vista) la muestra en el detalle fijo de la izquierda; al sacarlo, queda la última. Un solo oyente en la mesa: las cartas no llevan uno cada una (y quien lo recibe no vuelve a dibujar
  // si es la misma carta: `useDockPeek`).
  const showHovered = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      // El dedo no pasa el mouse por encima: tocar una carta ya la fija.
      if (event.pointerType === 'touch' || !(event.target instanceof Element)) return

      const own = event.target.closest<HTMLElement>('[data-card-id]')?.dataset.cardId
      const rival = own === undefined ? event.target.closest<HTMLElement>('[data-rival-card-id]')?.dataset.rivalCardId : undefined
      const id = own ?? rival

      if (id === undefined) return

      if (own !== undefined) {
        const { name, apiCard } = cardOf(own)

        onHover?.({ name, card: apiCard })
      } else if (rival !== undefined) {
        onRivalHover?.(rival)
      }
    },
    [cardOf, onHover, onRivalHover],
  )

  const openCard = useCallback(
    (id: string, rect: DOMRect) => {
      // Tocar una carta (la que sea y para lo que sea) también la muestra, fija, en el detalle de la izquierda.
      if (onPeek) {
        const { name, apiCard } = cardOf(id)

        onPeek({ name, card: apiCard })
      }

      // Poniendo o quitando contadores: tocar una carta del campo suma o resta uno y se sigue; lo demás no hace nada.
      if (counterMode !== null) {
        const where = locateCard(state, id)

        if (where?.kind === 'spot' && (counterMode > 0 || where.placed.counters > 0)) play({ type: 'counter', id, delta: counterMode })
        return
      }

      if (picking?.kind === 'tributes' || picking?.kind === 'materials') {
        if (monstersOnField(state).includes(id)) (picking.kind === 'tributes' ? pickTribute : pickMaterial)(id)
        return
      }

      // Eligiendo la zona, tocar la carta que la ocupa (un Sacrificio o un material que se va) elige esa zona, como en el juego real.
      if (picking?.kind === 'zone') {
        const where = locateCard(state, id)

        if (where?.kind === 'spot' && picking.targets.some((target) => target.zone === where.spot && target.index === where.index)) {
          pickZone(where.spot, where.index)
          return
        }
      }

      setPicking(null)
      setMenu({ kind: 'card', id, rect })
    },
    // pickTribute y pickMaterial leen `picking` y `state` del render actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picking, state, counterMode, cardOf, onPeek],
  )

  /** Soltar una carta de una pila en una zona libre: el menú ofrece lo que la saca ahí (si es una sola jugada, sale así) y la carta se queda en la zona mientras se elige. */
  const dropInto = useCallback(
    (id: string, zone: MatSpot, index: number) => {
      const drop = { zone, index }

      // Una Zona Extra que no se puede usar (la ocupa el rival, o ya hay un monstruo propio en la otra) no recibe cartas.
      if (zone === 'emz' && !freeTargets(state, ['emz'], duel?.rivalEmz).some((free) => free.index === index)) return

      const items = listDropActions(state, id, kindOf, nameOf, drop, duel?.rivalEmz)
      const [first] = items
      const anchor = sectionRef.current?.querySelector(`[data-drop="${dropIdOf(zone, index)}"]`) ?? sectionRef.current

      if (!first) {
        onDispatch({ type: 'place', id, zone, index, pos: 'atk' })
      } else if (items.length === 1 && !first.choices) {
        choose(first, drop)
      } else if (anchor) {
        setPicking(null)
        // Una sola jugada que pregunta (p. ej. Invocación Especial) abre directo la pregunta.
        setMenu({ kind: 'card', id, rect: anchor.getBoundingClientRect(), drop, ask: items.length === 1 ? first : undefined })
      }
    },
    [state, kindOf, nameOf, choose, onDispatch, duel?.rivalEmz],
  )

  const handleDrop = useCallback(
    (source: MatDragSource, target: MatDropTarget) => {
      // La ficha soltada en una zona de monstruo principal libre pregunta si sale en ataque o en defensa, ahí mismo.
      if (source.id === NEW_TOKEN) {
        if (target.kind === 'spot' && target.spot === 'mz' && !placedAt(state, target.spot, target.index)) {
          const anchor = sectionRef.current?.querySelector(`[data-drop="${dropIdOf(target.spot, target.index)}"]`) ?? sectionRef.current

          if (anchor) {
            setPicking(null)
            setMenu({ kind: 'token', rect: anchor.getBoundingClientRect(), zone: { zone: target.spot, index: target.index } })
          }
        } else {
          // Soltado sobre una carta del campo (como en DuelingBook), le pone un contador.
          const occupant = target.kind === 'spot' ? placedAt(state, target.spot, target.index) : null

          if (occupant) onDispatch({ type: 'counter', id: occupant.id, delta: 1 })
        }
        return
      }

      if (source.id === DECK_TOP) {
        const top = state.deck[0]
        if (!top) return
        if (target.kind === 'pile') {
          if (target.pile === 'hand') onDispatch({ type: 'draw', count: 1 })
          else if (target.pile === 'gy') onDispatch({ type: 'mill', count: 1 })
          else if (target.pile === 'banished') onDispatch({ type: 'move', id: top, to: 'banished' })
        } else if (target.spot !== 'emz' && !placedAt(state, target.spot, target.index)) {
          dropInto(top, target.spot, target.index)
        }
        return
      }

      const where = locateCard(state, source.id)
      if (!where) return

      if (target.kind === 'pile') {
        if (where.kind === 'pile' && where.pile === target.pile) return
        // Un Monstruo de Péndulo del campo soltado en el cementerio va al Extra Deck boca arriba (regla de Péndulo).
        onDispatch(pileAction(state, source.id, target.pile, kindOf))
        return
      }

      const occupant = placedAt(state, target.spot, target.index)

      if (occupant) {
        if (occupant.id !== source.id && kindOf(occupant.id).xyz && kindOf(source.id).monster) {
          onDispatch({ type: 'attach', id: source.id, to: occupant.id })
        }
        return
      }

      if (where.kind === 'pile') {
        // La Extra Monster Zone es sólo para lo que viene del Extra Deck: de la mano o de otra pila no se cae ahí ni arrastrando.
        if (target.spot === 'emz' && where.pile !== 'extra') return
        dropInto(source.id, target.spot, target.index)
        return
      }

      // Una carta que ya está en el campo cambia de zona como está.
      const pos = where.kind === 'spot' ? where.placed.pos : 'atk'
      onDispatch({ type: 'place', id: source.id, zone: target.spot, index: target.index, pos })
    },
    [state, onDispatch, kindOf, dropInto],
  )

  const handleTap = useCallback(
    (source: MatDragSource, rect: DOMRect) => {
      // El +: primero qué agregar (una ficha o un contador); de la ficha, la posición (en ataque o en defensa), y la zona se toca después si hay más de una libre.
      if (source.id === NEW_TOKEN) {
        setPicking(null)
        setCounterMode(null)
        setMenu({ kind: 'token', rect, root: true })
        return
      }

      if (source.id === DECK_TOP) {
        setPicking(null)
        setMenu({ kind: 'deck', rect })
        return
      }

      openCard(source.id, rect)
    },
    [openCard],
  )

  // La zona bajo una carta arrastrada (de la mesa o de la mano) se enciende por el DOM, no por el estado: si no, cada zona que se cruza dibujaba la mesa entera.
  // Por eso el `data-over` de las casillas es siempre "false" en el JSX (React no vuelve a tocarlo): acá se enciende y se apaga.
  const lightZone = useCallback((previous: string | null, next: string | null) => {
    const light = (drop: string | null, on: boolean) => {
      // La mano también es un `data-drop`, pero nunca se ilumina.
      if (drop && drop !== 'hand') sectionRef.current?.querySelector(`[data-drop="${drop}"]`)?.setAttribute('data-over', String(on))
    }

    light(previous, false)
    light(next, true)
  }, [])
  const { drag, bind, setGhostElement } = useMatDrag({ onDrop: handleDrop, onTap: handleTap, onOver: lightZone })

  // La zona que enciende la mano (la otra fuente de arrastre): se recuerda para apagarla cuando cambia.
  const handLit = useRef<string | null>(null)
  const lightFromHand = useCallback(
    (next: string | null) => {
      lightZone(handLit.current, next)
      handLit.current = next
    },
    [lightZone],
  )

  // Red de seguridad: pase lo que pase con un arrastre (el celular lo corta sin avisar, la mano se vuelve a armar a mitad de camino…), al levantar el dedo ninguna casilla queda
  // encendida. Se espera un poco para que el arrastre termine solo si puede (y suelte la carta donde corresponde).
  useEffect(() => {
    const clear = () => {
      window.setTimeout(() => {
        sectionRef.current?.querySelectorAll('[data-over="true"]').forEach((element) => element.setAttribute('data-over', 'false'))
        handLit.current = null
      }, 120)
    }

    window.addEventListener('pointerup', clear, true)
    window.addEventListener('pointercancel', clear, true)

    return () => {
      window.removeEventListener('pointerup', clear, true)
      window.removeEventListener('pointercancel', clear, true)
    }
  }, [])

  const menuItems: MenuItem[] = useMemo(() => {
    if (!menu) return []

    // Las fases: elegir una es pasar a ella (la Draw Phase después de la End Phase es pasar el turno). Sólo lo hace quien tiene el turno (el botón no abre si no es el tuyo).
    if (menu.kind === 'phases') {
      const current = duel ? duel.phase : state.phase

      return PHASES.map((phase) => ({
        label: phase.name,
        current: phase.id === current,
        onSelect: () => {
          setMenu(null)
          play({ type: 'phase', phase: phase.id, ...(duel ? { skipDraw: true as const } : {}) })
          // En el celular no hay «Pasar turno»: llegar a la End Phase pregunta si se termina el turno.
          if (!isDesktop && phase.id === 'end') setEndingTurn(true)
        },
      }))
    }

    // El + tocado: una ficha (pregunta la posición después) o poner / quitar un contador (sólo si hay cartas a las que ponérselo o quitárselo).
    if (menu.kind === 'token' && menu.root) {
      const root: MenuItem[] = []

      if (freeTargets(state, monsterZones(false)).length > 0) root.push({ label: t('practice.menu.plusToken'), onSelect: () => setMenu({ kind: 'token', rect: menu.rect }) })
      // Poner contadores se ve siempre (Gastón, 2026-10-19: «falta la posibilidad de poner contadores a una carta»): tocarlo pide tocar la carta; sin ninguna en el campo, dice qué falta en vez de esconderse.
      const onField = fieldCards(state).length > 0

      root.push({ label: t('practice.menu.plusCounter'), onSelect: () => { setMenu(null); setCounterMode(1) }, disabled: !onField, hint: onField ? undefined : t('practice.menu.counterNeedsCard') })
      if (fieldCards(state).some((placed) => placed.counters > 0)) root.push({ label: t('practice.menu.minusCounter'), onSelect: () => { setMenu(null); setCounterMode(-1) } })
      for (const item of duel?.plusItems ?? []) root.push({ label: item.label, onSelect: () => { setMenu(null); item.onSelect() } })

      return root
    }

    if (menu.kind === 'token') {
      const dropped = menu.zone

      return [
        { label: t('practice.menu.attack'), onSelect: () => summonToken('atk', dropped) },
        { label: t('practice.menu.defense'), onSelect: () => summonToken('def', dropped) },
      ]
    }

    // Elegir en la pregunta arma la jugada completa ("Invocación Especial: en ataque") para lo que la mesa pida después.
    const { ask } = menu

    if (ask?.choices) {
      const dropped = menu.kind === 'card' ? menu.drop : undefined

      const passcode = menu.kind === 'card' ? cardOf(menu.id).apiCard?.ygoprodeckId : undefined

      return ask.choices.map((choice) => ({
        label: choice.label,
        lead: choice.lead,
        hint: choice.hint,
        // Al pasar el mouse por un efecto, el detalle de la carta resalta su frase (donde hay detalle a la izquierda).
        onPreview: choice.preview && passcode !== undefined && onHighlight ? (active: boolean) => onHighlight(active ? { ygoprodeckId: passcode, ...choice.preview! } : null) : undefined,
        onSelect: () => choose({ ...choice, label: `${ask.label}: ${choice.label.toLowerCase()}` }, dropped),
      }))
    }

    if (menu.kind === 'deck') {
      const top = state.deck[0]
      const view = { label: t('practice.deckMenu.view'), onSelect: () => { setMenu(null); setViewer('deck') } }

      if (!top) return [view]

      return [
        { label: t('practice.deckMenu.draw'), onSelect: () => play({ type: 'draw', count: 1 }) },
        { label: t('practice.deckMenu.revealTop'), onSelect: () => play({ type: 'reveal', id: top }), utility: true },
        { label: t('practice.deckMenu.mill'), onSelect: () => play({ type: 'mill', count: 1 }), utility: true },
        { label: t('practice.deckMenu.banishTop'), onSelect: () => choose(banishItem(top, t('practice.deckMenu.banishTop'))), utility: true },
        { ...view, utility: true },
        { label: t('practice.deckMenu.shuffle'), onSelect: () => play({ type: 'shuffle', seed: randomSeed() }), utility: true },
      ]
    }

    const listed = menu.drop ? listDropActions(state, menu.id, kindOf, nameOf, menu.drop, duel?.rivalEmz) : listCardActions(state, menu.id, kindOf, nameOf, attackTargets, duel?.rivalEmz, duel?.control)
    // «Activar efecto» de una carta con varios efectos (`countableEffects`) pregunta **siempre** cuál: la pregunta va en el segundo paso, como el resto (la posición, a quién se ataca), y el rival ve cuál se activa.
    const api = cardOf(menu.id).apiCard
    const listing = !effectsReady || menu.drop || !api || isForeignId(menu.id) ? null : cardEffects(api.ygoprodeckId, api.description ?? '')
    const effects = listing ? countableEffects(listing.effects) : null
    const live = new Set<MatAction>(session.actions)
    const past = activationsRef.current.filter((activation) => live.has(activation.action))
    const items = !api || !effects ? listed : listed.map((item) => (item.action.type === 'activate' && !item.choices ? { ...item, choices: effectChoices(menu.id, api.ygoprodeckId, effects, past, turnNumber, listing!.verified) } : item))

    const mapped: MenuItem[] = items.map((item) => ({ label: item.label, onSelect: () => choose(item, menu.drop), utility: item.utility }))
    const point = duel?.point

    // Una carta mía a la vista en el campo se puede señalar: un aro que late un rato en las dos pantallas. Comunica, no es una jugada (no cambia la mesa ni queda en los pasos), y va junto a Target.
    if (point && !menu.drop && locateCard(state, menu.id)?.kind === 'spot') {
      const item: MenuItem = { label: t('duel.point.label'), onSelect: () => { setMenu(null); point(menu.id) }, utility: true }
      const targetAt = mapped.findIndex((entry) => entry.label === t('practice.menu.target') || entry.label === t('practice.menu.untarget'))

      mapped.splice(targetAt >= 0 ? targetAt : mapped.length, 0, item)
    }

    return mapped
  }, [menu, state, kindOf, nameOf, attackTargets, play, choose, summonToken, duel, isDesktop, cardOf, session.actions, turnNumber, effectsReady, onHighlight])

  const menuCard = menu?.kind === 'card' ? cardOf(menu.id) : menu?.kind === 'token' && !menu.root ? TOKEN_CARD : null
  // En la lista de efectos de «Activar efecto» cada uno lleva sus rasgos: los de la carta entera no se repiten arriba (cada dato se dice una sola vez).
  const choosingEffect = menu?.kind === 'card' && menu.ask?.choices?.some((choice) => choice.action.type === 'activate' && choice.action.effect !== undefined) === true
  const menuWhere = menu?.kind === 'card' ? locateCard(state, menu.id) : null

  // El resaltado del detalle vale mientras se elige el efecto: al cerrar el menú, elegir uno o volver, se apaga (el `mouseleave` no llega si el menú desaparece).
  useEffect(() => {
    if (!choosingEffect || !onHighlight) return

    return () => onHighlight(null)
  }, [choosingEffect, onHighlight])
  const menuKicker =
    menu?.kind === 'phases'
      ? t('practice.mat.phases')
      : menu?.kind === 'token'
      ? menu.root ? t('practice.mat.name') : menu.zone ? zoneLabelOf(menu.zone.zone, menu.zone.index) : t('practice.menu.specialSummon')
      : menu?.ask
        ? menu.ask.label
        : menu?.kind === 'card' && menu.drop
          ? zoneLabelOf(menu.drop.zone, menu.drop.index)
          : menuWhere
            ? menuWhere.kind === 'pile' ? PILE_TITLES[menuWhere.pile] : menuWhere.kind === 'spot' ? ZONE_LABELS[menuWhere.spot] : t('practice.mat.materialOf', { name: nameOf(menuWhere.of) })
            : PILE_TITLES.deck
  // Las fases no llevan título: el nombre de la de ahora ya está en la lista, marcado.
  const menuTitle = menuCard?.name ?? (menu?.kind === 'phases' ? '' : menu?.kind === 'token' ? t('practice.token.plusTitle') : t('practice.mat.cardCount', { count: state.deck.length }))
  // En el celular todo menú de la mesa (una carta de la mano, del campo o de una pila, lo soltado en una zona, el deck, el +) es una hoja de abajo con las jugadas a un toque (`CardSheet`); en escritorio, el menú pegado a la carta (`CardMenu`).
  const sheeted = !isDesktop && menu !== null && !covered

  const saveCombo = (name: string) => {
    const combo = createSavedCombo({ name, deckName, initial: session.initial, actions: session.actions.slice(0, session.cursor), nameOf }, combos)
    const next = [...combos, combo]
    writeSavedCombos(next)
    setCombos(next)
    setSaving(false)
    showToastMessage(t('practice.combo.saved', { name: combo.name }), 'success')
  }

  const renameCombo = useCallback(
    (combo: SavedCombo, name: string) => {
      const next = renameSavedCombo(combos, combo.id, name)
      writeSavedCombos(next)
      setCombos(next)
    },
    [combos],
  )

  const deleteCombo = useCallback(
    (combo: SavedCombo) => {
      const next = combos.filter((entry) => entry.id !== combo.id)
      writeSavedCombos(next)
      setCombos(next)
      showToastMessage(t('practice.combo.deleted', { name: combo.name }), 'warning')
    },
    [combos],
  )

  // Los callbacks del panel y de los controles del replay son estables: así, con un destello o un cartel que se va, no se vuelven a dibujar (el panel es una lista de todos los pasos).
  const seekFromPanel = useCallback((step: number) => { setAutoplay(false); onSeek(step); setPanelOpen(false) }, [onSeek])
  const loadFromPanel = useCallback((combo: SavedCombo) => { onLoadCombo(combo); setAutoplay(true); setPanelOpen(false) }, [onLoadCombo])
  const panel = (
    <PracticeMatPanel
      steps={panelSteps}
      cursor={session.cursor}
      onSeek={seekFromPanel}
      combos={combos}
      deckName={deckName}
      onLoad={loadFromPanel}
      onRename={renameCombo}
      onDelete={deleteCombo}
      showCombos={!duel}
      className="min-h-0 flex-1"
    />
  )

  // Eligiendo Sacrificios o materiales, los monstruos del campo se encienden y el elegido lleva su etiqueta.
  const choosingOnField = picking?.kind === 'tributes' || picking?.kind === 'materials' || counterMode !== null
  // Para Sacrificios y materiales, los monstruos; para un contador, cualquier carta del campo (y, al quitar, las que tienen).
  const tributeCandidates = counterMode !== null ? fieldCards(state).filter((placed) => counterMode > 0 || placed.counters > 0).map((placed) => placed.id) : choosingOnField ? monstersOnField(state) : []
  // Eligiendo materiales (y si la carta no se soltó ya en una zona), las casillas libres se iluminan: tocar una invoca ahí, con los materiales que haya o sin ninguno.
  const materialZones = picking?.kind === 'materials' && !picking.zone ? freeTargets(state, monsterZones(true), duel?.rivalEmz) : []
  // Eligiendo la zona, los Sacrificios o materiales ya confirmados siguen marcados: su zona se libera y también se puede elegir.
  const leaving = picking?.kind === 'zone' ? (picking.action.type === 'tribute' ? picking.action.tributes : picking.action.type === 'summon' ? picking.action.materials : []) : []
  const chosenLabel = picking?.kind === 'materials' || (picking?.kind === 'zone' && picking.action.type === 'summon') ? t('practice.mat.chosenMaterial') : t('practice.mat.chosenTribute')
  // Las cartas con la mira: las que marqué yo y las que marcó el rival (de las pilas enteras y de la mano, también se marca lo de adentro).
  const rivalMarks = duel?.marksOnMine
  // Las cartas que brillan: cuando el rival pregunta si hacés algo antes, las que pueden responder (ámbar); si no, las de la salida o el problema del Lab.
  const responders = duel?.respond
  const glowing = responders && responders.size > 0 ? responders : highlighted
  const glowKind: GlowKind | null = responders && responders.size > 0 ? 'respond' : highlightKind
  const targetedIds = useMemo(() => new Set([...state.targeted, ...(rivalMarks?.cards ?? [])]), [state.targeted, rivalMarks])
  // La carta de la que se está viendo el menú lleva un marco celeste mientras tanto.
  // En el celular la hoja tapa la mano: una carta de la mano no se levanta (quedaba encima de los botones); la del campo sí lleva el marco.
  const selectedId = menu?.kind === 'card' && !(!isDesktop && menuWhere?.kind === 'pile' && menuWhere.pile === 'hand') ? menu.id : null

  const cell = (spot: MatSpot, index: number, area: string) => {
    const placed = placedAt(state, spot, index)
    // La carta soltada acá que espera que se elija cómo sale se queda en la zona (en ataque, hasta que se elija) en vez de volver a la mano.
    const waiting = !placed && pending && pending.zone === spot && pending.index === index ? pending : null
    const shown: Placed | null = placed ?? (waiting ? { id: waiting.id, pos: 'atk', counters: 0, materials: [] } : null)
    const drop = dropIdOf(spot, index)
    const label = zoneLabelOf(spot, index)
    const gem = spot === 'st' ? PENDULUM_GEM[index] : undefined
    const pickableZone = (picking?.kind === 'zone' && picking.targets.some((target) => target.zone === spot && target.index === index)) || materialZones.some((target) => target.zone === spot && target.index === index)
    const pickableTribute = choosingOnField && placed !== null && tributeCandidates.includes(placed.id)
    const chosen = placed !== null && (((picking?.kind === 'tributes' || picking?.kind === 'materials') && picking.chosen.includes(placed.id)) || leaving.includes(placed.id))

    return (
      <div
        key={drop}
        role={pickableZone ? 'button' : 'group'}
        tabIndex={pickableZone ? 0 : undefined}
        aria-label={pickableZone ? t('practice.zone.pick', { zone: label }) : label}
        data-drop={drop}
        data-over="false"
        data-pick={pickableZone || pickableTribute ? 'true' : 'false'}
        data-chosen={chosen ? 'true' : 'false'}
        data-pointed={placed !== null && duel?.pointed?.card === placed.id ? 'true' : undefined}
        className={spot === 'field' ? CELL : spot === 'st' ? CELL_SPELL : CELL_MONSTER}
        style={{ gridArea: area }}
        // Una carta se elige con su toque (`openCard`); su click, que el navegador manda después, no: si no, el que cierra el doble clic de los materiales caería en la casilla del material, ya pidiendo zona, e invocaría ahí.
        onClick={pickableZone ? (event) => { if (!(event.target as Element).closest('[data-card-id]')) pickZone(spot, index) } : undefined}
        onKeyDown={pickableZone ? (event) => activate(event, () => pickZone(spot, index)) : undefined}
      >
        {spot === 'field' ? null : <ZoneLines kind={spot === 'st' ? 'spell' : 'monster'} />}
        {pickableZone || pickableTribute ? <PickMarks diamond={pickableZone && !shown} /> : null}
        {gem && !placed ? <span aria-hidden="true" className={cx('absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[3px]', gem)} /> : null}
        {spot === 'field' && !placed ? <span aria-hidden="true" className="absolute inset-0 grid place-items-center text-[0.5rem] font-semibold uppercase tracking-[0.04em] text-soft min-[1101px]:text-[0.6rem]">{t('practice.zone.fieldLabel')}</span> : null}
        {shown ? (
          <PlacedCard
            key={shown.id}
            placed={shown}
            spot={spot}
            card={cardOf(shown.id)}
            pending={waiting !== null}
            dragging={drag?.source.id === shown.id}
            flash={flash?.id === shown.id ? flash : null}
            glow={glowing.has(shown.id)}
            glowKind={glowKind}
            dim={glowKind !== 'respond' && glowing.size > 0 && !glowing.has(shown.id)}
            chosen={chosen ? chosenLabel : null}
            targeted={targetedIds.has(shown.id)}
            selected={selectedId === shown.id}
            bind={bind}
            onOpen={(rect) => openCard(shown.id, rect)}
          />
        ) : null}
        {!shown && spot === 'emz' && duel ? duel.sharedZone(index) : null}
        {landing?.spot === spot && landing.index === index ? <LandingBurst key={landing.key} tone={landing.tone} flies={landing.flies} /> : null}
      </div>
    )
  }

  const topOf = (pile: MatPile) => state[pile][state[pile].length - 1] ?? null
  const pileCell = (pile: 'extra' | 'gy' | 'banished', area: string) => {
    // El Extra se ve de dorso, salvo que tenga cartas boca arriba (Monstruos de Péndulo): ahí se ve la última que llegó. Una carta desterrada boca abajo también va de dorso (el visor de la pila la muestra igual).
    const up = pile === 'extra' ? state.extraUp : []
    const top = pile === 'extra' ? (up[up.length - 1] ?? null) : topOf(pile)
    const count = state[pile].length
    const back = pile === 'extra' ? count > 0 && up.length === 0 : top !== null && state.facedown.includes(top)
    // Una carta marcada como objetivo adentro (se vea o no: no es siempre la de arriba) lleva la mira sobre la casilla.
    const marked = state[pile].some((id) => targetedIds.has(id)) || (rivalMarks?.piles.includes(pile) ?? false)

    return (
      <button
        key={pile}
        type="button"
        aria-label={`${PILE_TITLES[pile]}: ${count}${up.length > 0 ? `, ${t('practice.pile.faceUpCount', { count: up.length })}` : ''}`}
        title={PILE_TITLES[pile]}
        data-drop={pile}
        data-over="false"
        data-targeted={marked ? 'true' : 'false'}
        data-respond={pile === 'gy' && state.gy.some((id) => responders?.has(id)) ? 'true' : undefined}
        data-pointed={duel?.pointed?.pile === pile ? 'true' : undefined}
        // `rounded-none`: el reset global le da a todo <button> el radio de los controles, y una casilla no va redondeada.
        className={cx(CELL, 'cursor-pointer rounded-none bg-transparent p-0 text-left focus-visible:outline-none focus-visible:shadow-focus', FX_CARD, '[--card-shadow:0_0_0_0_transparent]')}
        style={{ gridArea: area, ...fxVars('red') }}
        onClick={() => setViewer(pile)}
      >
        {pile === 'extra' ? <PileStack count={count} /> : null}
        {/* El recorte va en un contenedor aparte: el botón no recorta, así el área que se toca (`before` de `CELL`) puede salirse 4 px de la casilla. */}
        <span className="absolute inset-0 overflow-hidden">
          {back ? <span className={CARD_BACK} /> : top ? <CardArt remoteUrl={artOf(cardOf(top))} name={cardOf(top).name} className="block h-full w-full object-cover" /> : null}
          <PileBadge label={PILE_SHORT[pile]} count={count} />
          {marked ? <TargetMark /> : null}
        </span>
      </button>
    )
  }

  const getDeckRect = useCallback(() => deckRef.current?.getBoundingClientRect() ?? null, [])
  const getField = useCallback(() => {
    const field = fieldRef.current
    const zone = field?.querySelector('[data-drop="mz:0"]')

    // La casilla es cuadrada y la carta parada ocupa su alto: de ahí sale cuánto mide de ancho.
    return field && zone ? { rect: field.getBoundingClientRect(), zoneWidth: zone.getBoundingClientRect().height * CARD_WIDTH_PER_HEIGHT } : null
  }, [])
  // La ficha del menú se arrastra como una carta del tamaño de una zona del campo.
  const tokenSource = useMemo<MatDragSource>(
    () => ({
      id: NEW_TOKEN,
      name: TOKEN_CARD.name,
      art: TOKEN_ART,
      size: () => {
        const width = getField()?.zoneWidth

        return width ? { width, height: (width * 614) / 421 } : null
      },
    }),
    [getField],
  )

  const describeStep = useCallback(
    (step: number) => (step === 0 ? t('practice.mat.startingHand') : t('practice.replay.stepOf', { step, total: session.actions.length, text: steps[step - 1] ?? '' })),
    [steps, session.actions.length],
  )
  const togglePlay = useCallback(() => {
    if (autoplay) {
      setAutoplay(false)
    } else {
      // Al final, reproducir vuelve a empezar ("Ver de nuevo").
      if (live) onSeek(0)
      setAutoplay(true)
    }
  }, [autoplay, live, onSeek])
  const restart = useCallback(() => onSeek(0), [onSeek])
  const previousStep = useCallback(() => { setAutoplay(false); onSeek(session.cursor - 1) }, [onSeek, session.cursor])
  const nextStep = useCallback(() => { setAutoplay(false); onSeek(session.cursor + 1) }, [onSeek, session.cursor])
  const openSteps = useCallback(() => setPanelOpen(true), [])
  const replayLabel = autoplay ? t('practice.mat.pause') : live ? t('practice.mat.watchAgain') : t('practice.mat.play')
  // La línea de tiempo del replay: una marca por jugada (cambio de fase, comienzo de turno). Se arma una vez por combo, no por paso.
  const replayMarks = useMemo<ReplayMark[]>(() => {
    if (!session.replay) return []

    let current = session.initial

    return session.actions.map((action) => {
      const before = current
      current = matReducer(current, action)

      return { phase: action.type === 'phase', turnStart: current.turn !== before.turn, tone: stepTone(before, action) }
    })
  }, [session.replay, session.initial, session.actions])
  const pickingText =
    picking?.kind === 'tributes'
      ? t('practice.mat.pickTributes', { count: picking.required, chosen: picking.chosen.length })
      : picking?.kind === 'materials'
        ? t(isDesktop && picking.chosen.length === 1 ? 'practice.mat.pickMaterialsOne' : 'practice.mat.pickMaterials', { count: picking.chosen.length })
        : picking
          ? t('practice.mat.pickZone', { label: picking.label })
          : counterMode !== null
            ? t(counterMode > 0 ? 'practice.mat.pickCounterAdd' : 'practice.mat.pickCounterRemove')
            : null
  // Eligiendo (una zona, Sacrificios, materiales o a quién ponerle contadores) las fases y el replay se van y el estado pide lo que falta.
  const choosing = picking !== null || counterMode !== null

  // Deshacer, la ficha (o los contadores) y la lista de pasos: arriba en la práctica; en un duelo, abajo, donde llega el pulgar.
  // En un duelo los botones de abajo van en cajas oscuras de 44 px (como en el diseño); en la práctica, arriba, sin caja.
  const dockTone = duel ? 'tile' : 'flat'
  const undoButton = (
    <IconButton tone={dockTone} size="sm" aria-label={t('practice.mat.undo')} title={duel?.undoPending ? t('duel.undo.waiting') : t('practice.mat.undo')} disabled={(duel?.undoAvailable === undefined ? session.cursor === 0 : !duel.undoAvailable) || Boolean(duel?.undoPending) || Boolean(duel?.undoBlocked)} className="disabled:opacity-35" onClick={() => { setAutoplay(false); onUndo() }}>
      <Icon name="undo" />
    </IconButton>
  )
  // Ficha: se toca para elegir la posición (y la zona) o se arrastra a una zona de monstruo.
  const tokenButton = (
    <IconButton
      tone={dockTone}
      size="sm"
      aria-label={t('practice.token.name')}
      title={t('practice.token.create')}
      className="touch-none select-none [-webkit-touch-callout:none]"
      {...bind(tokenSource)}
      onKeyDown={(event) => activate(event, () => handleTap(tokenSource, event.currentTarget.getBoundingClientRect()))}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Icon name="plus" />
    </IconButton>
  )
  const stepsButton = (
    <IconButton tone="flat" size="sm" aria-label={t('practice.mat.stepsAndCombos')} title={t('practice.mat.stepsAndCombos')} className="min-[1101px]:hidden" onClick={() => setPanelOpen(true)}>
      <Icon name="list" />
    </IconButton>
  )

  // La fase de ahora y de quién es el turno: el botón de las fases (`p3`, en el medio del campo) es el mismo en un duelo y en la práctica; al tocarlo muestra las seis y elegir una pasa a ella (la Draw Phase
  // después de la End Phase pasa el turno: ahí sube la cuenta de turnos). En la práctica el turno nuevo roba solo; en un duelo roba el otro (por eso va `skipDraw`). En un duelo la fase es la compartida, la de quien
  // tiene el turno; en la práctica el turno siempre es tuyo.
  const phaseNow = duel ? duel.phase : state.phase
  const myTurn = duel ? duel.myTurn : true
  const passTurn = () => play({ type: 'phase', phase: 'draw', ...(duel ? { skipDraw: true as const } : {}) })
  // El estado: eligiendo, pide lo que falta; si no, es sólo para el lector de pantalla (la última jugada y el contador ya están en la lista de pasos).
  // Eligiendo se apoya sobre la fila de abajo que ese momento no se usa (`absolute inset-0`): no suma ni quita alto. En un duelo de escritorio es una cápsula centrada que sí recibe toques (la barra de abajo no los ataja: el medio es de la mano).
  const status = (
    <div
      className={cx(
        'flex min-w-0 items-center gap-2 px-1 text-micro text-muted',
        choosing ? (duel ? 'pointer-events-auto absolute inset-0 z-10' : 'pointer-events-auto absolute inset-x-0 bottom-0 z-10 h-10 border-t border-primary-hover/30 bg-background/80') : 'sr-only',
        choosing && duel && 'max-[1100px]:bg-background min-[1101px]:inset-auto min-[1101px]:left-1/2 min-[1101px]:top-1/2 min-[1101px]:w-max min-[1101px]:max-w-full min-[1101px]:-translate-x-1/2 min-[1101px]:-translate-y-1/2 min-[1101px]:rounded-card min-[1101px]:border min-[1101px]:border-border-subtle min-[1101px]:bg-card-background min-[1101px]:px-3 min-[1101px]:py-1.5 min-[1101px]:shadow-card',
      )}
      role="status"
      aria-label={t('practice.mat.currentStep')}
    >
      {pickingText ? (
        <>
          <span className="line-clamp-2 min-w-0 flex-1 font-semibold leading-tight text-accent">{pickingText}</span>
          <Button variant={counterMode !== null ? 'primary' : 'tertiary'} size="sm" className="px-3" onClick={() => { setPicking(null); setCounterMode(null) }}>
            {counterMode !== null ? t('practice.mat.pickDone') : t('common.cancel')}
          </Button>
          {picking?.kind === 'materials' ? (
            <Button variant="primary" size="sm" className="px-3" onClick={confirmMaterials}>
              {t('practice.mat.confirm')}
            </Button>
          ) : null}
        </>
      ) : null}
      {!choosing && session.actions.length > 0 ? (
        <span className="font-semibold tabular-nums text-foreground">
          {session.cursor}/{session.actions.length}
        </span>
      ) : null}
      {!choosing ? <span className="min-w-0 flex-1 truncate">{session.cursor === 0 ? (session.actions.length > 0 ? t('practice.mat.startingHand') : t('practice.mat.hint')) : steps[session.cursor - 1]}</span> : null}
    </div>
  )

  return (
    <section
      ref={sectionRef}
      aria-label={t('practice.mat.label')}
      onPointerOver={detail ? showHovered : undefined}
      className={cx(
        // `select-none`: un arrastre que arranca entre dos cartas no debe pintar texto seleccionado por toda la mesa.
        // `relative isolate`: las cartas grandes del centro se acomodan sobre la mesa (no sobre la pantalla) y sus capas no se mezclan con las de afuera.
        // `grid-cols-[minmax(0,1fr)]`: la columna mide lo que mide la pantalla; sin eso crece hasta lo más ancho que tenga adentro (la barra de arriba) y en un celular chico se corta todo el lado derecho.
        'relative isolate grid h-full min-h-0 select-none grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-background',
        // Los pasos y combos son de la práctica: en un duelo la mesa ocupa todo el ancho.
        sidePanel && 'min-[1101px]:grid-cols-[minmax(0,1fr)_20rem]',
        // Con el detalle fijo a la izquierda (y los pasos o el chat a la derecha) son tres columnas: 20 rem, la mesa y 20 rem.
        Boolean(detail) && (sidePanel ? 'min-[1440px]:grid-cols-[20rem_minmax(0,1fr)_20rem]' : 'min-[1440px]:grid-cols-[20rem_minmax(0,1fr)]'),
      )}
    >
      {/* El fondo de la mesa (la arena): la columna de la mesa, a todo el alto. Es decoración: va detrás de todo y no ocupa lugar en la grilla. */}
      <MatScene className={cx('absolute inset-0 -z-10 col-start-1 row-span-2 row-start-1', Boolean(detail) && 'min-[1440px]:col-start-2')} />
      {/* Barra (práctica): el turno a la izquierda y, a la derecha, nueva mano, deshacer, guardar, ficha y (en el celu) el panel. En un duelo estos botones van abajo, junto a las fases (ver `dock`). */}
      {duel ? null : (
        // En un celular angosto los 7 botones (de 44 px) y el turno no entran en una fila: se achican (40 px hasta 419 px de ancho, 36 hasta 379 px) y, en uno muy chico (menos de 340 px), el turno se esconde.
        // Con el detalle fijo a la izquierda (columna 1), la barra va arriba de la mesa (columna 2), no encima del detalle.
        <div className={cx('col-start-1 row-start-1 flex items-center gap-1 px-2 pt-2 max-[419px]:gap-0.5 max-[419px]:px-1 max-[419px]:[&>button]:size-10! max-[379px]:[&>button]:size-9! min-[1101px]:px-4 min-[1101px]:pt-3', Boolean(detail) && 'min-[1440px]:col-start-2')} role="toolbar" aria-label={t('practice.mat.name')}>
          <ShellMenuButton className="-ml-1" />
          {onExit ? (
            <IconButton tone="flat" size="sm" aria-label={t('practice.mat.exit')} title={t('practice.mat.exit')} onClick={onExit}>
              <Icon name="chevron-left" />
            </IconButton>
          ) : null}
          <span className="whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted max-[419px]:hidden" aria-label={t('practice.mat.turn', { turn: state.turn })}>
            {t('practice.mat.turn', { turn: state.turn })}
          </span>
          <MatViewToggle className="ml-auto" />
          {/* Los sonidos de las jugadas: el mismo ajuste que «Más opciones» de un duelo (se recuerda en el navegador). */}
          <IconButton tone="flat" size="sm" aria-label={t('practice.mat.sounds')} title={t(sounds ? 'practice.mat.soundsOff' : 'practice.mat.soundsOn')} aria-pressed={sounds} onClick={() => setSoundsOn(!sounds)}>
            <Icon name={sounds ? 'volume' : 'volume-off'} />
          </IconButton>
          {/* Ventana grande: sin el menú lateral y, si el navegador deja, en pantalla completa. Sólo en escritorio: en el celular la mesa ya ocupa todo. */}
          {isDesktop ? (
            <IconButton tone="flat" size="sm" aria-label={bigWindow ? t('duel.bar.bigWindowOff') : t('duel.bar.bigWindowOn')} title={bigWindow ? t('duel.bar.bigWindowOff') : t('duel.bar.bigWindowOn')} aria-pressed={bigWindow} onClick={toggleDuelFullscreen}>
              <Icon name={bigWindow ? 'minimize' : 'maximize'} />
            </IconButton>
          ) : null}
          <IconButton tone="flat" size="sm" aria-label={t('practice.mat.newHand')} title={t('practice.mat.newHand')} onClick={onNewHand}>
            <Icon name="refresh" />
          </IconButton>
          {undoButton}
          <IconButton tone="flat" size="sm" aria-label={t('practice.mat.saveCombo')} title={t('practice.mat.saveCombo')} disabled={session.cursor === 0} className="disabled:opacity-35" onClick={() => setSaving(true)}>
            <Icon name="save" />
          </IconButton>
          {stepsButton}
        </div>
      )}

      <div
        ref={columnRef}
        // Con laterales: una grilla de tres columnas (lateral, campo, lateral) y tres filas (arriba, el medio que se estira y abajo); el campo ocupa las tres. `--cell-h` es la casilla que deja el alto: sin la barra de arriba ni la de abajo sobran 17,25 rem.
        style={rails ? ({ '--cell-h': 'max(3.5rem, min(12rem, calc((100dvh - 22.95rem) / 5)))' } as CSSProperties) : undefined}
        className={cx(
          !duel && '@container',
          Boolean(detail) && 'min-[1440px]:col-start-2',
          'col-start-1 row-start-2 min-h-0 overflow-y-auto overflow-x-hidden px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] min-[1101px]:px-4 min-[1101px]:pb-4 min-[1101px]:pt-2',
          rails ? 'grid grid-cols-[minmax(13rem,1fr)_minmax(0,calc(var(--cell-h)*6.3714+3rem))_minmax(13rem,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] gap-x-4' : 'flex flex-col gap-2',
        )}
      >
        <DuelRailsContext.Provider value={rails}>{duel?.header}</DuelRailsContext.Provider>
        {/* En un duelo el campo y tu mano van en un mismo grupo, centrado: el aire que sobra queda arriba y abajo del grupo y no entre los dos (la mano tapa un poco de tu zona de magias y trampas). */}
        <div className={cx(duel ? (rails ? '@container col-start-2 row-span-3 row-start-1 flex flex-col gap-2 self-center' : 'my-auto flex flex-col gap-2 max-[1100px]:pb-12') : 'contents')}>
        {/* Celular: la mano del rival y el campo van juntos y centrados: el alto que sobra se reparte arriba y abajo (ni pegado a la barra ni un hueco antes de tu mano). Escritorio: sin envoltorio y el campo se centra. */}
        <div className={cx('flex flex-col gap-2 min-[1101px]:contents', !duel && 'max-[1100px]:my-auto')}>
        {/* El campo en todos los tamaños: a la izquierda la zona de campo y el Extra Deck; a la derecha, de arriba abajo, destierro, cementerio y deck (como pidió Gastón: el Banish arriba del GY); las fases y las zonas extra entre medio.
            Las cinco columnas del centro son cuadradas (una carta acostada entra en su zona sin pisar a la vecina) y las de los costados miden lo justo de una carta (0,6857 de una del centro), así que todas las cartas miden lo mismo. */}
        <div
          ref={setField}
          // Escritorio: `my-auto` reparte el aire que sobra arriba y abajo del campo (ni pegado a la barra ni un hueco antes de la mano). En el celular, de arriba, el campo deja lugar a la mano del rival (que se apoya en su borde de arriba).
          data-tilted={view === '3d' ? 'true' : undefined}
          className={cx(!duel && 'min-[1101px]:my-auto min-[1101px]:[--cell:max(8rem,min(calc((100cqw-3rem)/6.3714),calc((100dvh-19.5rem)/3.2),15rem))]', "relative isolate grid grid-cols-[minmax(0,0.6857fr)_repeat(5,minmax(0,1fr))_minmax(0,0.6857fr)] gap-1 [transform-origin:50%_100%] max-sm:grid-cols-[repeat(5,minmax(0,1fr))] min-[1101px]:justify-center min-[1101px]:gap-2 min-[1101px]:grid-cols-[minmax(0,calc(var(--cell,8rem)*0.6857))_repeat(5,minmax(0,var(--cell,8rem)))_minmax(0,calc(var(--cell,8rem)*0.6857))]", view === '3d' && '[transform:scale(var(--field-zoom,1))_perspective(var(--field-perspective))_rotateX(var(--field-tilt))_scaleY(var(--field-stretch))]',
            // Las áreas: en la práctica, escritas acá; en un duelo las arma la pantalla (`duel.areas` y `duel.areasCompact`, por variables: el estilo en línea no se puede cambiar con un medio).
            // En un celular en vertical (menos de 640 px) son cinco columnas y una fila de pilas abajo —el Extra Deck a la izquierda y el Deck a la derecha, en los extremos, la Zona de campo en el medio, el Banish a su izquierda y el Cementerio a su derecha—: las casillas pasan de 55 a 72 px.
            duel
              ? '[grid-template-areas:var(--areas)] max-sm:[grid-template-areas:var(--areas-compact)]'
              : "[grid-template-areas:'._p1_emz1_p2_emz2_p3_ban'_'fld_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck'] max-sm:[grid-template-areas:'p1_emz1_p2_emz2_p3'_'m1_m2_m3_m4_m5'_'s1_s2_s3_s4_s5'_'extra_ban_fld_gy_deck']",
          )}
          aria-label={t('practice.mat.field')}
          // En un duelo, las áreas de los dos campos (el estilo en línea gana a la clase de las áreas de uno solo); y en escritorio las cartas se achican hasta que las cinco filas, la mano y la barra de abajo (con su propia fila: 23,5 rem de alto de lo que no es campo) entran en la pantalla.
          style={duel ? ({ '--areas': duel.areas, '--areas-compact': duel.areasCompact, '--cell': rails ? 'max(3.5rem, min(var(--cell-h), calc((100cqw - 3rem) / 6.3714)))' : 'max(3.5rem, min(12rem, calc((100dvh - 30.45rem) / 5)))', ...(duel.rivalHand ? { marginTop: isDesktop ? THEIR_HAND.desktop.room + DESKTOP_HAND_GAP : THEIR_HAND.mobile.room } : null), ...(compact ? compactDuelFieldStyle(view === '3d') : null) } as CSSProperties) : undefined}
        >
          {/* La placa de la arena, debajo de todo el campo (decoración). */}
          <MatPlate />
          {/* La mano del rival queda arriba del borde del campo (inclinada con él en la vista 3D), sin tapar nada de él. */}
          {duel?.rivalHand ? (
            <div className="absolute bottom-full left-1/2 z-10 -translate-x-1/2" style={{ marginBottom: isDesktop ? DESKTOP_HAND_GAP : MOBILE_HAND_GAP }}>
              {duel.rivalHand}
            </div>
          ) : null}
          {/* La mascota del duelo, una sola: en escritorio, en la esquina libre de arriba a la izquierda del campo; en el celular, parada sobre esa esquina, detrás de lo demás. */}
          {duel ? duel.opponent : <DuelMascot className="absolute bottom-full left-0 -z-10 mb-1 size-[4.5rem] min-[1101px]:static min-[1101px]:z-0 min-[1101px]:mb-0 min-[1101px]:size-[5.25rem] min-[1101px]:self-end min-[1101px]:justify-self-center min-[1101px]:[grid-area:1/1]" />}
          {/* La fila del medio, de izquierda a derecha: el reloj de turnos (`p1`, entre el Banish del rival y la Zona Extra de monstruos), el + al medio del campo (`p2`, entre las dos Zonas Extra; también en la práctica) y el botón de la fase de ahora (`p3`), que al tocarlo muestra todas (Gastón, 2026-10-19). */}
          {duel?.clock ? <div className="grid min-h-0 min-w-0 place-items-center" style={{ gridArea: 'p1' }}>{duel.clock}</div> : null}
          <div className="grid min-h-0 min-w-0 place-items-center" style={{ gridArea: 'p2' }}>{tokenButton}</div>
          <div className="relative grid min-h-0 min-w-0 place-items-center" style={{ gridArea: 'p3' }}>
              <button
                type="button"
                aria-label={`${t('practice.mat.phases')}: ${PHASES.find((phase) => phase.id === phaseNow)?.name ?? ''}`}
                aria-haspopup="menu"
                aria-expanded={menu?.kind === 'phases'}
                disabled={!myTurn}
                className={cx(
                  'grid size-11 place-items-center rounded-control border text-micro font-extrabold leading-none transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default',
                  // Ámbar cuando el turno es tuyo (es lo que se toca), violeta cuando es del rival.
                  myTurn ? 'cursor-pointer border-info bg-info text-accent-foreground hover:bg-info-soft' : 'border-accent bg-accent text-accent-foreground',
                )}
                onClick={(event) => {
                  // En el celular, en la End Phase el botón pregunta si se termina el turno (no hay «Pasar turno»); antes, muestra las fases.
                  if (!isDesktop && phaseNow === 'end') setEndingTurn(true)
                  else setMenu({ kind: 'phases', rect: event.currentTarget.getBoundingClientRect() })
                }}
              >
                {PHASES.find((phase) => phase.id === phaseNow)?.short}
              </button>
              {/* En escritorio, «Pasar turno» no está hasta llegar a la End Phase y entonces aparece justo debajo del botón de las fases (encima de la zona de abajo, sin correr nada). */}
              {isDesktop && myTurn && phaseNow === 'end' ? (
                <Button
                  variant="primary"
                  size="sm"
                  iconEnd="arrow-right"
                  className="absolute left-1/2 top-[calc(50%+1.75rem)] z-20 -translate-x-1/2 whitespace-nowrap"
                  onClick={passTurn}
                >
                  {t('practice.mat.passTurn')}
                </Button>
              ) : null}
          </div>
          {cell('field', 0, 'fld')}
          {cell('emz', 0, 'emz1')}
          {cell('emz', 1, 'emz2')}
          {state.mz.map((_, index) => cell('mz', index, `m${index + 1}`))}
          {state.st.map((_, index) => cell('st', index, `s${index + 1}`))}

          {/* Deck: se arrastra su tope (robar, mandar al cementerio, sacar al campo) o se toca para el menú. Se baraja con cada mano nueva y reparte de a una. */}
          <div
            ref={deckRef}
            role="button"
            tabIndex={0}
            aria-label={`${PILE_TITLES.deck}: ${state.deck.length}`}
            title={t('practice.mat.mainDeck')}
            data-drop="deck"
            data-over="false"
            data-targeted={rivalMarks?.piles.includes('deck') ? 'true' : 'false'}
            data-pointed={duel?.pointed?.pile === 'deck' ? 'true' : undefined}
            className={cx(CELL, state.deck.length > 0 && 'cursor-grab touch-none select-none [-webkit-touch-callout:none]', 'focus-visible:outline-none focus-visible:shadow-focus')}
            style={{ gridArea: 'deck' }}
            {...bind({ id: DECK_TOP, name: 'Deck', art: null, back: true })}
            onKeyDown={(event) => activate(event, () => setMenu({ kind: 'deck', rect: event.currentTarget.getBoundingClientRect() }))}
            onContextMenu={(event) => event.preventDefault()}
          >
            {/* El grosor del deck, debajo: se afina al robar. */}
            <PileStack count={state.deck.length} />
            {state.deck.length > 0 ? (
              <span key={shuffleKey} className={cx('absolute inset-0', shuffleKey > 0 && 'animate-riffle-lift motion-reduce:animate-none')}>
                <span className={cx(CARD_BACK, '[transform:translate(-3px,3px)]', shuffleKey > 0 && 'animate-riffle-left motion-reduce:animate-none')} />
                <span className={cx(CARD_BACK, '[transform:translate(-1.5px,1.5px)]', shuffleKey > 0 && 'animate-riffle-right motion-reduce:animate-none')} />
                {/* Cada carta repartida le da un tirón a la de arriba. */}
                <span key={dealt} className={cx(CARD_BACK, 'animate-pile-draw motion-reduce:animate-none')} />
              </span>
            ) : null}
            <PileBadge label={PILE_SHORT.deck} count={state.deck.length} />
            {rivalMarks?.piles.includes('deck') ? <TargetMark /> : null}
          </div>
          {pileCell('extra', 'extra')}
          {pileCell('gy', 'gy')}
          {pileCell('banished', 'ban')}

          {/* Cambio de fase: el cartel se asoma en el medio del campo y se va agrandándose. */}
          {banner ? (
            <PhaseBanner
              key={banner.key}
              phase={banner.phase}
              turn={duel ? null : banner.turn}
              // En un duelo, pasar de la End Phase a la Draw Phase es pasar el turno: el cartel dice que ahora juega el rival.
              label={duel && banner.turn !== null ? duel.rivalTurnLabel : undefined}
              className="absolute inset-0 z-30"
            />
          ) : null}
          {/* El ataque del rival en un duelo: quién ataca a quién, en un cartelito sobre la fila de las fases (que en ese momento no se tocan: ataca el rival), así no tapa las vidas ni el reloj. Se va solo, como los otros avisos. */}
          {announcement ? (
            <span
              key={announcement.key}
              role="status"
              className="pointer-events-none absolute left-1/2 top-1/2 z-30 w-max max-w-[92%] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border-2 border-[color:rgb(var(--fx-rgb)/0.9)] bg-background/90 px-3.5 py-1 text-micro font-bold text-foreground shadow-[0_0_18px_rgb(var(--fx-rgb)/0.5)]"
              style={fxVars('red')}
            >
              {announcement.caption}
            </span>
          ) : null}
          {duel?.notice ? <PhaseBanner key={duel.notice.key} phase={duel.notice.phase} turn={null} who={duel.notice.who} label={duel.notice.label} className="absolute inset-0 z-30" /> : null}
        </div>
        </div>

        {/* Abajo del todo, como en la mesa real: la mano en abanico. Las salidas y problemas flotan sobre la mano en el celu, y van en el panel lateral en escritorio. */}
        {/* Cuando la mano recibe una carta (robada, buscada o devuelta), se enmarca un instante en celeste. */}
        <div className={cx('relative', duel && 'pointer-events-none z-10')} style={duel ? { marginTop: isDesktop ? -MAT_GAP : -(MAT_GAP + HAND_TOP_ROOM), ...(isDesktop ? null : { transform: `translateY(${MOBILE_HAND_GAP}px)` }) } : undefined} data-pointed={duel?.pointed?.pile === 'hand' ? 'true' : undefined}>
          {/* Celular: las salidas y problemas flotan justo arriba de la mano (el aire que queda abajo del campo): no ocupan lugar, así que el campo no se mueve cuando aparecen, se explican o se van. Sólo los chips y la explicación atajan toques. */}
          {footer && isDealt && !isDesktop ? <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 px-1 pb-1.5 animate-sheet-in motion-reduce:animate-none">{footer}</div> : null}
          {rivalMarks?.piles.includes('hand') ? (
            <span
              role="img"
              aria-label={t('practice.card.targetMark')}
              data-targeted="true"
              data-marked="hand"
              className="pointer-events-none absolute -inset-x-1 -top-1 bottom-0 z-20 animate-fx-lock rounded-card border-2 border-[color:rgb(var(--fx-rgb))] bg-[rgb(var(--fx-rgb)/0.08)] shadow-[0_0_22px_rgb(var(--fx-rgb)/0.6)] motion-reduce:animate-none"
              style={fxVars('red')}
            />
          ) : null}
          <PracticeHand
            cards={handCards}
            sizeSlots={Math.max(session.initial.hand.length, 1)}
            maxCardWidth={isDesktop ? (duel ? 100 : 124) : duel ? 84 : 110}
            fanDegrees={2.2}
            highlighted={glowing}
            highlightKind={glowKind}
            muted={muted}
            flash={flash}
            targeted={targetedIds}
            selectedId={selectedId}
            getDeckRect={getDeckRect}
            dealsFromDeck={dealsFromDeck}
            getField={getField}
            onReorder={setHandOrder}
            onTap={(card, rect) => openCard(card.id, rect)}
            onDragOver={lightFromHand}
            onDrop={(card, target) => {
              lightFromHand(null)
              const parsed = parseDrop(target)
              if (parsed) handleDrop({ id: card.id, name: card.name, art: artOf(card) }, parsed)
            }}
          />
          {handFlash !== null ? (
            <span
              key={handFlash}
              aria-hidden="true"
              data-fx="hand"
              className="pointer-events-none absolute inset-0 animate-fx-zone border-2 border-[color:rgb(var(--fx-rgb))] bg-[color:rgb(var(--fx-rgb)/0.06)] shadow-[0_0_20px_rgb(var(--fx-rgb)/0.5),inset_0_0_24px_rgb(var(--fx-rgb)/0.18)] motion-reduce:hidden"
              style={fxVars('cyan')}
            />
          ) : null}
        </div>
        </div>

        {/* Replay (sólo viendo un combo guardado): los controles de YGOPocket. La lista de pasos se abre aparte, en el mismo panel del celular. */}
        {session.replay && !choosing ? (
          <ReplayBar
            marks={replayMarks}
            cursor={session.cursor}
            playing={autoplay}
            playLabel={replayLabel}
            speed={speed}
            describe={describeStep}
            onSeek={onSeek}
            onTogglePlay={togglePlay}
            onRestart={restart}
            onPrevious={previousStep}
            onNext={nextStep}
            onOpenSteps={openSteps}
            onSpeed={setSpeed}
          />
        ) : null}

        {/* Abajo: las seis fases con Pasar turno pegado a la End Phase (Deshacer está arriba y los pasos en la lista, así que ni Anterior / Siguiente ni la última jugada hacen falta). En un duelo de escritorio van a la derecha, junto a tus vidas.
            Eligiendo (una zona, Sacrificios, materiales, contadores) ninguna fila se saca: la que no se usa queda invisible y quieta, y lo que falta elegir se apoya encima (`status`). El alto de la barra es siempre el mismo, así el campo y la mano no se corren. */}
        {/* La barra tiene su propia fila abajo de la mano, también en escritorio: antes subía sobre la franja de abajo de la mano, y con la mano ancha de una notebook (1280–1440 px, con el menú y el chat abiertos) las fases y Pasar turno quedaban encima de las cartas, entre el 55 y el 75 % de su área. */}
        {/* Las fases y los botones van siempre arriba de la mano: una carta recién robada o seleccionada (z 50) no los tapa; sólo la que se arrastra (z 100) pasa por encima. */}
        <div className={cx('z-55 grid grid-cols-[minmax(0,1fr)] gap-1 max-[1100px]:bg-background', rails ? 'relative col-start-3 row-start-3 self-end' : 'sticky bottom-0')}>
          {/* Duelo: una sola fila abajo con tus vidas y los botones que se tocan seguido. Celular: las vidas a la izquierda, las dos reacciones en el medio (centradas, alineadas con las vidas y los botones) y deshacer y el chat a la derecha
              (el pulgar de quien juega con la derecha). Escritorio: deshacer junto a tus vidas, en la esquina opuesta a las del rival. */}
          {duel ? (
            <div className="relative">
              <div
                role="toolbar"
                aria-label={t('practice.mat.name')}
                inert={choosing}
                className={cx('flex items-center justify-between max-[1100px]:grid max-[1100px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]', rails && 'flex-col! items-end! gap-2', choosing && 'max-[1100px]:opacity-35 min-[1101px]:invisible')}
              >
                <span className="pointer-events-auto flex items-center max-[1100px]:col-start-3 max-[1100px]:row-start-1 max-[1100px]:justify-self-end">
                  {isDesktop ? null : undoButton}
                  {duel.tools}
                </span>
                {isDesktop ? null : <span className="pointer-events-auto col-start-2 row-start-1">{duel.reactions}</span>}
                <span className={cx('pointer-events-auto flex items-center gap-2 max-[1100px]:col-start-1 max-[1100px]:row-start-1', rails && 'flex-col-reverse items-end')}>
                  {/* Deshacer, abajo a la derecha, junto a tus vidas (las fases y, en la End Phase, Pasar turno están en el centro del campo; en el celular, Deshacer queda en la botonera de abajo). */}
                  {isDesktop ? undoButton : null}
                  {duel.life}
                </span>
              </div>
              {status}
            </div>
          ) : (
            <div className="relative">{status}</div>
          )}
        </div>
      </div>

      {/* El panel fijo de un duelo (el chat), a la derecha y a todo el alto, sólo en escritorio. */}
      {duel?.aside ? (
        <section className={cx('hidden min-h-0 border-l border-border-subtle px-3 pb-3 pt-3 min-[1101px]:row-span-2 min-[1101px]:row-start-1 min-[1101px]:flex min-[1101px]:flex-col', 'min-[1101px]:col-start-2', Boolean(detail) && 'min-[1440px]:col-start-3')}>{duel.aside}</section>
      ) : null}

      {/* El detalle fijo (la carta que se tocó) de un duelo y de la práctica, a la izquierda y a todo el alto, sólo en escritorio: la columna está siempre (vacía hasta la primera carta), así la mesa no se corre. */}
      {detail ? (
        <section aria-label={t('duel.dock.label')} data-card-dock="" className="hidden min-h-0 border-r border-primary/30 bg-linear-to-b from-card-background to-background px-4 pb-4 pt-4 shadow-[inset_0_1px_0_rgb(var(--foreground-rgb)/0.06),10px_0_28px_-14px_rgb(0_0_0/0.7)] min-[1440px]:col-start-1 min-[1440px]:row-span-2 min-[1440px]:row-start-1 min-[1440px]:flex min-[1440px]:flex-col">{detail}</section>
      ) : null}

      {/* Panel lateral (escritorio): arriba los pasos y combos y abajo, a la altura de la mano, las salidas y problemas; la explicación del chip tocado crece hacia arriba sobre la lista. El detalle de una carta se abre desde su menú. */}
      {duel ? null : (
        <>
          <section className={cx('hidden min-h-0 border-l border-border-subtle px-3 pb-3 pt-3 min-[1101px]:col-start-2 min-[1101px]:row-span-2 min-[1101px]:row-start-1 min-[1101px]:flex min-[1101px]:flex-col min-[1101px]:gap-3', Boolean(detail) && 'min-[1440px]:col-start-3')} aria-label={t('practice.mat.stepsAndCombos')}>
            {panel}
            {footer && isDealt && isDesktop ? <div className="flex-none animate-sheet-in motion-reduce:animate-none">{footer}</div> : null}
          </section>

          <Modal isOpen={panelOpen} onClose={() => setPanelOpen(false)} size="md" kicker={t('practice.mat.name')} title={t('practice.mat.stepsAndCombos')}>
            {panel}
          </Modal>
        </>
      )}

      {/* Celular: la hoja se va con la jugada, la X, Escape o al tocar afuera. */}
      {sheeted && menu ? (
        <CardSheet
          name={menu.kind === 'phases' ? menuKicker : menuTitle}
          kicker={menu.kind === 'phases' ? undefined : menuKicker}
          plain={menu.kind === 'phases'}
          art={menuCard ? artOf(menuCard) : null}
          back={menuCard === null}
          apiCard={menuCard?.apiCard ?? null}
          items={menuItems}
          traits={!choosingEffect}
          stacked={choosingEffect}
          asking={menu.kind !== 'token' && menu.kind !== 'phases' ? menu.ask?.label : undefined}
          onInspect={menu.kind === 'card' && !menu.ask && !menu.drop && !isToken(menu.id) ? () => { setInspected({ id: menu.id, rect: menu.rect }); setMenu(null) } : undefined}
          passThrough={attackAsk !== null}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {/* Celular: sin «Pasar turno», la End Phase pregunta si se termina el turno. «Seguir jugando» deja todo como está; para pasar el turno hay que volver a tocar el botón de la End Phase. */}
      <ConfirmDialog
          isOpen={endingTurn && !isDesktop && !covered && myTurn && phaseNow === 'end'}
          title={t('practice.mat.endTurnTitle')}
          description={duel ? t('practice.mat.endTurnText', { name: duel.control?.rival ?? t('duel.bar.rival') }) : t('practice.mat.endTurnSolo')}
          confirmLabel={t('practice.mat.endTurnConfirm')}
          cancelLabel={t('duel.bar.keepPlaying')}
          onCancel={() => setEndingTurn(false)}
          onConfirm={() => {
            setEndingTurn(false)
            passTurn()
          }}
        />

      <CardMenu
        anchor={covered || sheeted ? null : (menu?.rect ?? null)}
        kicker={menuKicker}
        title={menuTitle}
        items={menuItems}
        wide={choosingEffect}
        // Con el detalle fijo a la izquierda (desde 1440 px) «Ver carta» no hace falta: tocar una carta ya lo muestra ahí. Con menos ancho, es la forma de verlo.
        onInspect={menu?.kind === 'card' && !menu.ask && !menu.drop && !isToken(menu.id) && !detail ? () => { setInspected({ id: menu.id, rect: menu.rect }); setMenu(null) } : undefined}
        passThrough={attackAsk !== null}
        onClose={() => setMenu(null)}
      />

      {/* Una instancia por pila: cada visor arranca sin filtro (lo buscado en el deck no se hereda al abrir el cementerio, donde con pocas cartas el buscador ni se ve). */}
      <PileViewer
        key={viewer ?? 'closed'}
        pile={covered ? null : viewer}
        ids={viewer ? state[viewer] : []}
        info={(id) => ({ name: cardOf(id).name, art: artOf(cardOf(id)), faceDown: state.facedown.includes(id), faceUp: state.extraUp.includes(id) })}
        targeted={targetedIds}
        onPick={(id, rect) => {
          // Elegir una carta del visor también la muestra en el detalle fijo de la izquierda (como tocar una de la mano o del campo).
          if (onPeek) {
            const { name, apiCard } = cardOf(id)

            onPeek({ name, card: apiCard })
          }

          setMenu({ kind: 'card', id, rect })
        }}
        onClose={closeViewer}
      />

      <SaveComboDialog key={String(saving)} isOpen={saving} defaultName={t('practice.combo.defaultName', { n: combos.length + 1 })} onSave={saveCombo} onClose={() => setSaving(false)} />

      {inspected && !covered ? <CardDetailOverlay key={inspected.id} name={cardOf(inspected.id).name} card={cardOf(inspected.id).apiCard} origin={inspected.rect} onClose={() => setInspected(null)} /> : null}

      {/* Activar, mostrar o declarar (y, al reproducir un combo, lo que mueve cada paso): las cartas aparecen grandes en el centro de la mesa, con su marco de color, su nombre y lo que pasó arriba, y se desvanecen. Marcar un objetivo o atacar no las agranda: ahí sólo cae la mira o cruza la espada. En escritorio el centro es el del campo, sin el panel lateral (20 rem, como en la grilla de arriba). */}
      {stage ? (
        <Spotlight
          key={stage.key}
          kind={stage.kind}
          cards={stage.ids.map((id) => ({ id, name: cardOf(id).name, art: artOf(cardOf(id)) }))}
          caption={steps[stage.step - 1] ?? null}
          flip={stage.flip}
          className={cx('absolute inset-y-0 left-0 right-0 z-[120]', sidePanel && 'min-[1101px]:right-[20rem]', Boolean(detail) && 'min-[1440px]:left-[20rem]')}
        />
      ) : null}

      {/* Lo que hace el rival y se anima: sus cartas aparecen grandes en el centro con un cartel que dice qué pasó, como en un combo guardado. */}
      {duel?.rivalEffect && !duel.rivalEffect.quiet ? (
        <Spotlight
          key={duel.rivalEffect.key}
          kind={duel.rivalEffect.kind}
          cards={duel.rivalEffect.cards.map((card) => ({ id: card.id, name: card.name ?? '', art: card.art, back: card.art === null }))}
          flip={duel.rivalEffect.flip}
          linger={duel.rivalEffect.linger}
          caption={duel.rivalEffect.caption}
          detail={duel.rivalEffect.detail}
          className={cx('absolute inset-y-0 left-0 right-0 z-[120]', Boolean(duel.aside) && 'min-[1101px]:right-[20rem]', Boolean(detail) && 'min-[1440px]:left-[20rem]')}
        />
      ) : null}

      {/* Un ataque (el propio o el del rival): la espada cruza la mesa desde el atacante hasta su objetivo y se va sola. */}
      {strike ? <AttackFx key={strike.key} strike={strike} onDone={() => setStrike(null)} /> : null}

      {/* La pausa y el final del duelo tapan la mesa, no el chat de al lado: se centran en su columna y el chat sigue a mano (un "gg" al terminar). */}
      {/* La pregunta del rival (pasar de fase): en el medio de la pantalla, centrada en la columna de la mesa (sin el chat ni el detalle). La capa deja pasar los toques; sólo la pregunta los recibe. */}
      {duel?.prompt ? (
        <div data-testid="duel-prompt-layer" className={cx('pointer-events-none absolute inset-y-0 left-0 right-0 z-[130] grid place-items-center px-4', Boolean(duel.aside) && 'min-[1101px]:right-[20rem]', Boolean(detail) && 'min-[1440px]:left-[20rem]')}>
          <div className="pointer-events-auto w-[min(24rem,100%)]">{duel.prompt}</div>
        </div>
      ) : null}

      {duel?.cover ? <div className={cx('absolute inset-y-0 left-0 right-0 z-[140]', Boolean(duel.aside) && 'min-[1101px]:right-[20rem]', Boolean(detail) && 'min-[1440px]:left-[20rem]')}>{duel.cover}</div> : null}

      {drag
        ? createPortal(
            <div ref={setGhostElement} className="pointer-events-none fixed left-0 top-0 z-200 opacity-90 will-change-transform" style={{ width: drag.width, height: drag.height }} aria-hidden="true">
              {drag.source.back ? (
                <CardBack className="h-full" />
              ) : (
                <CardArt remoteUrl={drag.source.art} name={drag.source.name} className="block h-full w-full object-cover shadow-[0_18px_32px_rgba(0,0,0,0.55)]" />
              )}
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

/** "mz:2" / "field" / "gy" → destino de la mesa (lo mismo que lee el arrastre de las zonas). */
function parseDrop(value: string): MatDropTarget | null {
  if (value === 'field') return { kind: 'spot', spot: 'field', index: 0 }
  if (value === 'deck' || value === 'extra' || value === 'hand' || value === 'gy' || value === 'banished') return { kind: 'pile', pile: value }

  const [zone, index] = value.split(':')
  const at = Number(index)

  return (zone === 'mz' || zone === 'emz' || zone === 'st') && Number.isInteger(at) ? { kind: 'spot', spot: zone, index: at } : null
}

function activate(event: ReactKeyboardEvent<HTMLElement>, run: () => void) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    run()
  }
}

/** Cantidad grande en el centro de la pila, como en la mesa real, y el nombre de la casilla chico debajo. */
export function PileBadge({ label, count }: { label: string; count: number }) {
  return (
    <span className="pointer-events-none absolute inset-0 z-2 grid place-content-center justify-items-center text-center leading-none">
      <span className={cx('rounded-full px-1.5 py-0.5 text-lead font-extrabold tabular-nums text-foreground min-[1101px]:text-title', count > 0 && 'bg-background/70')}>{count}</span>
      <span className="mt-0.5 text-[0.5rem] font-semibold uppercase tracking-[0.04em] text-soft min-[1101px]:text-[0.6rem]">{label}</span>
    </span>
  )
}

/** La carta que se está mirando (al pasar el mouse o tocarla), como el panel de la izquierda de DuelingBook. */
interface PlacedCardProps {
  placed: Placed
  spot: MatSpot
  card: MatCard
  dragging: boolean
  /** El destaque en curso (activar, mostrar, declarar o marcar como objetivo), con su clave; null = quieta. */
  flash: { key: number; kind: SpotlightKind } | null
  glow: boolean
  glowKind: GlowKind | null
  dim: boolean
  /** Elegida como Sacrificio o como material (la etiqueta que lleva), o null. */
  chosen: string | null
  /** Marcada como objetivo. */
  targeted: boolean
  /** Es la carta de la que se está viendo el menú. */
  selected: boolean
  /** La carta soltada que todavía espera que se elija cómo sale: está en la zona (como se la verá, si la elección es otra se acomoda) pero no se toca ni se arrastra, y lleva el marco de la carta del menú. */
  pending: boolean
  bind: ReturnType<typeof useMatDrag>['bind']
  onOpen: (rect: DOMRect) => void
}

/**
 * Carta en una zona del campo: es tuya, así que boca abajo se ve su imagen atenuada (como en DuelingBook); en defensa o
 * colocada en una zona de monstruo se acuesta a su tamaño y dentro de su casilla (cuadrada, ver `CELL_MONSTER`): sin achicarse ni pisar a la
 * de al lado; contadores, materiales y objetivo como etiquetas. Al darla vuelta se angosta y se abre; los contadores y los materiales rebotan al cambiar.
 */
function PlacedCard({ placed, spot, card, dragging, flash, glow, glowKind, dim, chosen, targeted, selected, pending, bind, onOpen }: PlacedCardProps) {
  // El nombre y lo que lo acompaña (boca abajo o en defensa, etiqueta de elegida, con target): cada pedazo es su mensaje.
  let label = placed.pos === 'set' ? t('practice.mat.cardFaceDown', { name: card.name }) : placed.pos === 'def' ? t('practice.mat.cardDefense', { name: card.name }) : card.name
  if (chosen) label = t('practice.mat.cardChosen', { label, chosen })
  if (targeted) label = t('practice.card.targeted', { name: label })
  const sideways = spot !== 'st' && spot !== 'field' && placed.pos !== 'atk'
  // El marco celeste: la carta del menú y la que espera en la zona (tiene el menú, o los Sacrificios, todavía por delante).
  const framed = selected || pending

  const cardRef = useRef<HTMLDivElement | null>(null)
  const previousPos = useRef(placed.pos)

  useEffect(() => {
    const wasFaceDown = previousPos.current === 'set'
    previousPos.current = placed.pos

    if (wasFaceDown === (placed.pos === 'set') || prefersReducedMotion() || !supportsAdditiveAnimation()) return

    cardRef.current?.animate(FLIP_FRAMES, { duration: FLIP_MS, composite: 'add' })
  }, [placed.pos])

  return (
    <div
      ref={cardRef}
      // Esperando que se elija cómo sale, la carta es sólo una imagen: lo que se puede hacer lo dice el menú (o la barra de pasos).
      role={pending ? undefined : 'button'}
      tabIndex={pending ? undefined : 0}
      aria-hidden={pending || undefined}
      aria-label={pending ? undefined : label}
      title={pending ? undefined : label}
      // Rotación en `transform` (no en `rotate`): así el vuelo entre zonas la lee y la compone bien.
      // Parada, la carta ocupa el alto de la casilla y queda centrada (en la zona de campo, de la forma de una carta, es la casilla entera); acostada gira sobre su centro y entra justo.
      className={cx(MAT_CARD, 'absolute inset-x-0 top-0 mx-auto aspect-[421/614]', spot === 'field' ? 'w-full' : 'w-[68.57%]', sideways && '[transform:rotate(90deg)]', pending && 'pointer-events-none')}
      // El color de su aro: el del destaque, o el rojo de la mira.
      style={fxVars(flash ? SPOTLIGHT_TONE[flash.kind] : 'red')}
      data-card-id={placed.id}
      data-pending={pending ? 'true' : undefined}
      data-dragging={dragging ? 'true' : 'false'}
      data-flash={flash ? 'true' : 'false'}
      data-flash-kind={flash?.kind}
      data-targeted={targeted ? 'true' : 'false'}
      data-selected={framed ? 'true' : 'false'}
      data-glow={glow ? 'true' : 'false'}
      data-glow-kind={glow ? (glowKind ?? 'opening') : undefined}
      data-dim={dim ? 'true' : 'false'}
      {...bind({ id: placed.id, name: card.name, art: artOf(card) })}
      onKeyDown={(event) => activate(event, () => onOpen(event.currentTarget.getBoundingClientRect()))}
      onContextMenu={(event) => event.preventDefault()}
    >
      {/* El cambio de brillo (boca abajo se ve atenuada) espera a que la carta, al darse vuelta, esté de canto. */}
      <span className={cx('block h-full w-full transition-[filter] duration-150 delay-[115ms] motion-reduce:delay-0', placed.pos === 'set' && 'brightness-[0.4] saturate-[0.55]', pending && 'animate-pop motion-reduce:animate-none')}>
        <CardArt remoteUrl={artOf(card)} name={card.name} className="block h-full w-full object-cover" />
      </span>
      {placed.counters > 0 ? <span key={placed.counters} className="absolute left-0.5 top-0.5 z-2 animate-pop rounded-full bg-warning px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-[#1a1204] motion-reduce:animate-none">{placed.counters}</span> : null}
      {placed.materials.length > 0 ? <span key={placed.materials.length} className="absolute bottom-0.5 right-0.5 z-2 animate-pop rounded-full bg-primary px-1.5 py-px text-[0.6rem] font-extrabold leading-tight text-primary-foreground motion-reduce:animate-none">+{placed.materials.length}</span> : null}
      {chosen ? <span className="absolute inset-x-0 bottom-0 z-2 bg-accent/85 py-0.5 text-center text-[0.55rem] font-extrabold uppercase tracking-[0.06em] text-[#06140e]">{chosen}</span> : null}
      {framed ? <FxFrame tone="cyan" /> : null}
      {glow ? <FxFrame tone={GLOW_TONE[glowKind ?? 'opening']} orbit={false} /> : null}
      {flash && flash.kind !== 'target' ? <FxFrame key={flash.key} tone={SPOTLIGHT_TONE[flash.kind]} shine /> : null}
      {targeted ? <TargetMark /> : null}
    </div>
  )
}
