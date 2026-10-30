import { memo, useCallback, useEffect, useId, useRef, useState } from 'react'

import type { StepInfo, StepKind, StepMove, StepOrigin, StepPlace } from '../../app/mat-step-info'
import { prefersReducedMotion } from '../../app/motion'
import { PHASES, type MatPile, type MatState } from '../../app/practice-mat'
import { showToastMessage } from '../../app/use-toast-message'
import { readComboLink, type SharedCombo, type ShareResult } from '../../app/combo-share'
import type { SavedCombo } from '../../app/saved-combos'
import { formatDay, t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { OverflowMenu } from '../ui/OverflowMenu'
import { Segmented } from '../ui/Segmented'
import { Switch } from '../ui/Switch'
import { ConfirmDialog } from './ConfirmDialog'
import { SaveComboDialog } from './MatDialogs'
import { MatSnapshot } from './MatSnapshot'
import type { PanelStep } from './panel-steps'
import { FX_RGB, type FxTone } from './practice-styles'

type PanelTab = 'steps' | 'combos'

interface PracticeMatPanelProps {
  steps: PanelStep[]
  /** La mesa antes de la primera jugada: el tablero de «Mano inicial». */
  initial: MatState
  /** Hasta qué jugada se ve (0 = mano inicial). */
  cursor: number
  onSeek: (step: number) => void
  /** El nombre y el arte de una carta por su id: para «Qué se mueve» y los tableros chicos. */
  nameOf: (id: string) => string
  artOf: (id: string) => string | null
  combos: SavedCombo[]
  deckName: string
  onLoad: (combo: SavedCombo) => void
  onRename: (combo: SavedCombo, name: string) => void
  onDelete: (combo: SavedCombo) => void
  /** Compartir el enlace de un combo y bajarlo como video (el ⋯ de cada ficha), y pegar el enlace de uno (arriba de la lista). Sin ellos, la lista no los ofrece. */
  onShare?: (combo: SavedCombo) => void
  onVideo?: (combo: SavedCombo) => void
  onImport?: (result: ShareResult) => void
  /** Sin la pestaña de combos guardados (en un duelo, donde no se guardan combos). */
  showCombos?: boolean
  /** Lo que dice la lista vacía, si no es el de la práctica (en «Jugar solo automático» no se arrastra ni se mantiene). */
  emptyHint?: string
  className?: string
}

/** Si la lista lleva los detalles (los chips, el tablero de cada paso y, en el actual, «Qué se mueve») o es la lista compacta de siempre. Se recuerda en el navegador. */
const DETAILS_KEY = 'ygo-lab:steps-details'

function readDetails(): boolean {
  try {
    return localStorage.getItem(DETAILS_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeDetails(on: boolean) {
  try {
    localStorage.setItem(DETAILS_KEY, on ? 'on' : 'off')
  } catch {
    // Sin almacenamiento (ventana privada): vale mientras el panel esté abierto.
  }
}

const NO_CARDS: PanelStep['cards'] = []

/** Panel lateral de la mesa: las jugadas de esta partida (se toca una para volver a ese paso) y los combos guardados. */
export const PracticeMatPanel = memo(function PracticeMatPanel({ steps, initial, cursor, onSeek, nameOf, artOf, combos, deckName, onLoad, onRename, onDelete, onShare, onVideo, onImport, showCombos = true, emptyHint, className }: PracticeMatPanelProps) {
  const [tab, setTab] = useState<PanelTab>('steps')
  // ponytail: cada panel (el lateral y el del celular) lee la preferencia al abrirse; si se cambia en uno, el otro —que está escondido— la toma recién al volver a montarse.
  const [details, setDetails] = useState(readDetails)
  const toggleDetails = useCallback((on: boolean) => {
    setDetails(on)
    writeDetails(on)
  }, [])

  return (
    <div className={cx('flex min-h-0 flex-col gap-3', className)}>
      {showCombos ? (
        <Segmented
          value={tab}
          onChange={setTab}
          label={t('practice.panel.label')}
          size="sm"
          fullWidth
          options={[
            { value: 'steps', label: t('practice.panel.steps'), count: steps.length },
            { value: 'combos', label: t('practice.panel.combos'), count: combos.length },
          ]}
        />
      ) : null}

      {tab === 'steps' || !showCombos ? (
        steps.length === 0 ? (
          <EmptyState icon="hand" title={t('practice.panel.noPlays')}>
            {emptyHint ?? t('practice.panel.noPlaysHint')}
          </EmptyState>
        ) : (
          <>
            <div className="flex items-center justify-end gap-3">
              <span className="text-micro font-semibold text-muted">{t('practice.panel.details')}</span>
              <Switch checked={details} onChange={toggleDetails} label={t('practice.panel.details')} />
            </div>
            {/* Una línea de tiempo: la última jugada arriba, como un registro, y la mano inicial al final. */}
            <ol className={cx('m-0 grid list-none content-start overflow-y-auto overflow-x-hidden p-0', details ? 'gap-2' : 'gap-1')} aria-label={t('practice.panel.plays')}>
              {steps
                .map((step, index) => (
                  <StepTile
                    key={index}
                    index={index + 1}
                    label={step.label}
                    divider={step.divider}
                    cards={step.cards}
                    after={step.after}
                    info={step.info}
                    arrows={step.arrows}
                    tone={step.tone}
                    active={cursor === index + 1}
                    past={index + 1 < cursor}
                    details={details}
                    onSeek={onSeek}
                    nameOf={nameOf}
                    artOf={artOf}
                  />
                ))
                .reverse()}
              <StepTile index={0} label={t('practice.mat.startingHand')} divider={false} cards={NO_CARDS} after={initial} info={null} tone={null} active={cursor === 0} past={cursor > 0} details={details} onSeek={onSeek} nameOf={nameOf} artOf={artOf} />
            </ol>
          </>
        )
      ) : (
        <SavedCombosList combos={combos} deckName={deckName} onLoad={onLoad} onRename={onRename} onDelete={onDelete} onShare={onShare} onVideo={onVideo} onImport={onImport} />
      )}
    </div>
  )
})

interface SavedCombosListProps {
  combos: SavedCombo[]
  /** Deck actual: sus combos van primero. */
  deckName: string
  onLoad: (combo: SavedCombo) => void
  onRename: (combo: SavedCombo, name: string) => void
  onDelete: (combo: SavedCombo) => void
  onShare?: ((combo: SavedCombo) => void) | undefined
  onVideo?: ((combo: SavedCombo) => void) | undefined
  onImport?: ((result: ShareResult) => void) | undefined
}

/**
 * Traer un combo: el enlace que esté copiado (se lee del portapapeles: no hay campo de texto que abra el teclado). Abrir el enlace en el navegador también lo trae (`#combo=…`).
 * Como archivo se manda el video, que no se vuelve a abrir acá.
 */
function ComboImport({ onImport }: { onImport: (result: ShareResult) => void }) {
  const paste = async () => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      showToastMessage(t('practice.share.pasteFailed'), 'warning')
      return
    }
    onImport(await readComboLink(text))
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <IconButton tone="ghost" size="sm" aria-label={t('practice.share.paste')} title={t('practice.share.paste')} onClick={() => void paste()}>
        <Icon name="link" />
      </IconButton>
    </div>
  )
}

/** Los combos guardados en este dispositivo: cargar uno lo reproduce en la mesa, el lápiz le cambia el nombre, borrar pide confirmación y el ⋯ lo comparte (enlace o video). */
export function SavedCombosList({ combos, deckName, onLoad, onRename, onDelete, onShare, onVideo, onImport }: SavedCombosListProps) {
  const [renaming, setRenaming] = useState<SavedCombo | null>(null)
  const [deleting, setDeleting] = useState<SavedCombo | null>(null)
  const ordered = [...combos].sort(
    (a, b) => Number(b.deckName === deckName) - Number(a.deckName === deckName) || a.deckName.localeCompare(b.deckName, 'es') || b.savedAt.localeCompare(a.savedAt),
  )
  const importer = onImport ? <ComboImport onImport={onImport} /> : null

  if (ordered.length === 0) {
    return (
      <>
        {importer}
        <EmptyState icon="save" title={t('practice.panel.noCombos')}>
          {t('practice.panel.noCombosHint')}
        </EmptyState>
      </>
    )
  }

  return (
    <>
      {importer}
      <ul className="m-0 grid list-none content-start gap-2 overflow-y-auto p-0" aria-label={t('practice.panel.saved')}>
        {ordered.map((combo) => (
          <li key={combo.id} className="grid gap-2 rounded-card border border-border-subtle bg-card-background px-3 py-2">
            {/* El nombre y los datos arriba, con todo el ancho (con tres botones al lado el nombre quedaba en unas quince letras); las acciones, abajo. */}
            <div className="grid min-w-0 gap-0.5">
              {/* Con el panel angosto (se arrastra su borde) el nombre baja a un segundo renglón y los datos, a los que hagan falta: nada se corta a mitad de la fecha. */}
              <strong className="line-clamp-2 wrap-break-word text-body font-semibold text-foreground" title={combo.name}>
                {combo.name}
              </strong>
              <span className="wrap-break-word text-micro text-muted">
                {t('practice.panel.comboMeta', { deck: combo.deckName, plays: t('practice.panel.comboPlays', { count: combo.actions.length }), date: formatDay(combo.savedAt) })}
              </span>
            </div>
            <div className="flex items-center justify-end gap-1">
              <Button variant="secondary" size="sm" icon="play" aria-label={t('practice.panel.loadNamed', { name: combo.name })} onClick={() => onLoad(combo)}>
                {t('practice.panel.load')}
              </Button>
              <IconButton tone="ghost" size="sm" aria-label={t('practice.panel.renameNamed', { name: combo.name })} title={t('practice.panel.rename')} onClick={() => setRenaming(combo)}>
                <Icon name="pencil" />
              </IconButton>
              <IconButton tone="ghost" size="sm" aria-label={t('practice.panel.deleteNamed', { name: combo.name })} title={t('common.delete')} onClick={() => setDeleting(combo)}>
                <Icon name="trash" />
              </IconButton>
              {/* Compartir y bajar van al ⋯: con el panel al mínimo (16 rem) y los objetivos de 44 px del dedo, dos íconos más no entran en la fila. */}
              {onShare && onVideo ? (
                <OverflowMenu
                  label={t('practice.share.more', { name: combo.name })}
                  items={[
                    { label: t('practice.share.link'), icon: 'link', onSelect: () => onShare(combo) },
                    { label: t('practice.share.video'), icon: 'download', onSelect: () => onVideo(combo) },
                  ]}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {/* El campo arranca con el nombre del combo que se toca (lo pone al abrirse; al cerrarse sale como estaba). */}
      <SaveComboDialog
        rename
        isOpen={renaming !== null}
        defaultName={renaming?.name ?? ''}
        onSave={(name) => {
          if (renaming) {
            onRename(renaming, name)
          }

          setRenaming(null)
        }}
        onClose={() => setRenaming(null)}
      />

      <ConfirmDialog
        veil={false}
        isOpen={deleting !== null}
        title={deleting ? t('practice.panel.deleteTitle', { name: deleting.name }) : ''}
        description={t('practice.panel.deleteBody')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        confirmColor="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            onDelete(deleting)
          }

          setDeleting(null)
        }}
      />
    </>
  )
}

/**
 * El aviso de un combo que llegó por enlace, arriba de la mesa que lo repasa: qué combo es (nombre, deck, jugadas y fecha, como su ficha en la lista), «Descargar video» y «Guardar
 * en mis combos» (la principal, al final) o «Cerrar». Lo de adentro es texto: nada de lo que vino en el enlace se interpreta.
 */
export function SharedComboBar({ combo, onSave, onClose, onVideo }: { combo: SharedCombo; onSave: () => void; onClose: () => void; onVideo?: () => void }) {
  return (
    <div role="region" aria-label={t('practice.share.banner')} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle bg-card-background px-gutter py-2 min-[1101px]:px-4">
      <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
        <span className="text-micro font-semibold uppercase tracking-wide text-info-soft">{t('practice.share.banner')}</span>
        <strong className="line-clamp-2 wrap-break-word text-body font-semibold text-foreground">{combo.name}</strong>
        <span className="wrap-break-word text-micro text-muted">
          {t('practice.panel.comboMeta', { deck: combo.deckName, plays: t('practice.panel.comboPlays', { count: combo.actions.length }), date: formatDay(combo.savedAt) })}
        </span>
      </div>
      {/* Con «Descargar video», en un celular los tres no entran en una fila: bajan a otra, la principal siempre al final. */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Button variant="tertiary" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
        {onVideo ? (
          <Button variant="secondary" size="sm" icon="download" onClick={onVideo}>
            {t('practice.share.video')}
          </Button>
        ) : null}
        <Button variant="primary" size="sm" icon="save" onClick={onSave}>
          {t('practice.share.save')}
        </Button>
      </div>
    </div>
  )
}

/** El chip de cada clase de jugada: las palabras del menú de la carta (Invocación Normal, Colocar, Activar…). */
const KIND_KEY = {
  draw: 'practice.kind.draw',
  mill: 'practice.kind.mill',
  shuffle: 'practice.kind.shuffle',
  normal: 'practice.kind.normal',
  special: 'practice.kind.special',
  fusion: 'practice.kind.fusion',
  synchro: 'practice.kind.synchro',
  xyz: 'practice.kind.xyz',
  link: 'practice.kind.link',
  flip: 'practice.kind.flip',
  set: 'practice.kind.set',
  activate: 'practice.kind.activate',
  target: 'practice.kind.target',
  reveal: 'practice.kind.reveal',
  declare: 'practice.kind.declare',
  attack: 'practice.kind.attack',
  position: 'practice.kind.position',
  counter: 'practice.kind.counter',
  token: 'practice.kind.token',
  toHand: 'practice.kind.toHand',
  toGy: 'practice.kind.toGy',
  banish: 'practice.kind.banish',
  toExtra: 'practice.kind.toExtra',
  toDeck: 'practice.kind.toDeck',
  attach: 'practice.kind.attach',
  zone: 'practice.kind.zone',
  control: 'practice.kind.control',
  phase: 'practice.kind.phase',
  turn: 'practice.kind.turn',
  other: 'practice.kind.other',
} as const satisfies Record<StepKind, string>

const ORIGIN_KEY = {
  deck: 'practice.origin.deck',
  extra: 'practice.origin.extra',
  hand: 'practice.origin.hand',
  gy: 'practice.origin.gy',
  banished: 'practice.origin.banished',
  field: 'practice.origin.field',
} as const satisfies Record<StepOrigin, string>

const PLACE_KEY = {
  deck: 'practice.place.deck',
  extra: 'practice.place.extra',
  hand: 'practice.place.hand',
  gy: 'practice.place.gy',
  banished: 'practice.place.banished',
} as const satisfies Record<MatPile, string>

const ZONE_KEY = { mz: 'practice.zone.mz', emz: 'practice.zone.emz', st: 'practice.zone.st' } as const

/** Un lugar de la mesa dicho con palabras: «Mano», «Zona de monstruo 3», «Debajo de Zeus». */
function placeName(place: StepPlace, nameOf: (id: string) => string): string {
  if (place.kind === 'pile') return t(PLACE_KEY[place.pile])
  if (place.kind === 'material') return t('practice.place.material', { name: nameOf(place.of) })

  return place.spot === 'field' ? t('practice.zone.field') : t('practice.zone.numbered', { zone: t(ZONE_KEY[place.spot]), n: place.n })
}

/** De dónde a dónde va una carta; una ficha aparece de la nada o desaparece. */
function routeOf(move: StepMove, nameOf: (id: string) => string): string {
  if (move.from && move.to) return t('practice.moves.route', { from: placeName(move.from, nameOf), to: placeName(move.to, nameOf) })

  return move.to ? t('practice.moves.appears', { to: placeName(move.to, nameOf) }) : move.from ? t('practice.moves.leaves', { from: placeName(move.from, nameOf) }) : ''
}

/** Cuántas cartas se nombran en «Qué se mueve» (un Enlace con cuatro materiales son cinco); las demás, «y N cartas más». */
const MAX_MOVES = 6

/** El círculo de cada paso en la línea: el actual en ámbar (como su pastilla en el reproductor), los ya jugados llenos y los que faltan, sólo el borde. */
const CIRCLE = {
  current: 'bg-info text-accent-foreground',
  past: 'bg-lavender text-foreground',
  upcoming: 'border border-border bg-background text-soft',
} as const

interface StepTileProps {
  /** El número del paso (0 = la mano inicial). */
  index: number
  label: string
  divider: boolean
  cards: PanelStep['cards']
  after: MatState
  /** `null` en la mano inicial. */
  info: StepInfo | null
  /** Las flechas del tablero (ninguna en la mano inicial). */
  arrows?: PanelStep['arrows']
  tone: FxTone | null
  active: boolean
  past: boolean
  details: boolean
  onSeek: (step: number) => void
  nameOf: (id: string) => string
  artOf: (id: string) => string | null
}

/**
 * Un paso de la línea de tiempo (Gastón, 2026-10-20, con la lista de otro simulador: «nuestras replays y movimientos no se ven así»): el círculo con su número sobre la línea y,
 * con los detalles, una ficha con **un solo borde** (adentro nada lleva caja: se separa con aire y una línea fina): las miniaturas, el chip de la jugada con el color de su
 * destello y el de dónde sale la carta, la frase y el tablero de cómo quedó la mesa. El paso actual se abre con un fundido corto: el turno y la fase, y **«Qué se mueve»** (cada carta, de dónde a
 * dónde). Los cambios de fase y de turno son cabeceras (`data-divider`), sin ficha. Sin los detalles es la lista compacta de siempre (miniaturas y frase).
 *
 * El botón es sólo el número y la frase (lo que se lee y lo que dicen las pruebas); su `::after` cubre la ficha entera, así se toca en cualquier lado y el foco la rodea. Es `memo`
 * con props estables: al avanzar un combo sólo cambian `active` y `past` de dos fichas.
 */
const StepTile = memo(function StepTile({ index, label, divider, cards, after, info, arrows, tone, active, past, details, onSeek, nameOf, artOf }: StepTileProps) {
  const ref = useRef<HTMLLIElement | null>(null)
  const originId = useId()
  const movesId = useId()
  const state = active ? 'current' : past ? 'past' : 'upcoming'
  const boxed = details && !divider
  const kind = boxed && info ? info.kind : null
  // «Robar» ya dice que sale del deck.
  const origin = kind && kind !== 'draw' ? info?.origin ?? null : null
  const moves = boxed && active ? (info?.moves ?? []) : []
  const phase = PHASES.find((entry) => entry.id === after.phase)?.name ?? after.phase

  // El paso actual se mantiene a la vista mientras un combo se reproduce solo: la lista se desplaza suave hasta él. Al abrirse la lista el paso
  // actual ya está activo y va de un salto (no se barre la lista entera); con movimiento reducido, siempre de un salto.
  const primeraVez = useRef(true)
  useEffect(() => {
    const abriendo = primeraVez.current
    primeraVez.current = false
    if (!active) return
    // En el cuadro siguiente, con su layout: en el efecto forzaba estilo y layout de toda la página en la tarea que agregó el paso (cerrar el visor del deck lo baraja).
    const frame = requestAnimationFrame(() => ref.current?.scrollIntoView?.({ block: 'nearest', behavior: (abriendo || prefersReducedMotion()) ? 'auto' : 'smooth' }))

    return () => cancelAnimationFrame(frame)
  }, [active])

  // En la lista compacta la columna mide siempre lo mismo (el texto queda alineado); en la ficha, lo que ocupan sus cartas (una carta de 3 rem de alto mide 2,06 de ancho y cada una más asoma media).
  const thumbs =
    cards.length > 0 ? (
      <span aria-hidden="true" className={cx('relative block', boxed ? 'h-12' : 'h-9 w-10', kind && 'row-span-2 self-start')} style={boxed ? { width: `${2.06 + (cards.length - 1) * 0.5}rem` } : undefined}>
        {cards.map((card, position) => (
          <span key={position} className={cx('absolute top-0 aspect-[421/614] overflow-hidden bg-input shadow-[0_0_0_1px_rgb(var(--background-rgb)/0.9)]', boxed ? 'h-12' : 'h-9')} style={{ left: `${position * 0.5}rem`, zIndex: position }}>
            <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
          </span>
        ))}
      </span>
    ) : null

  const button = (
    <button
      type="button"
      aria-current={active ? 'step' : undefined}
      aria-describedby={origin ? originId : undefined}
      data-divider={divider ? 'true' : 'false'}
      className={cx(
        'block w-full min-w-0 rounded-none bg-transparent p-0 text-left focus-visible:outline-none',
        // El paso entero se toca: el `::after` cubre la ficha (o la fila) por encima de todo lo que tiene adentro y lleva el aro del foco.
        'after:absolute after:inset-0 after:z-10 focus-visible:after:shadow-focus',
        boxed ? 'after:rounded-card' : 'after:rounded-control',
      )}
      onClick={() => onSeek(index)}
    >
      <span className={cx('absolute right-full mr-2 grid size-7 place-items-center rounded-full text-micro font-semibold tabular-nums transition-colors duration-150 motion-reduce:transition-none', boxed ? 'top-2' : 'top-1/2 -translate-y-1/2', CIRCLE[state])}>{index}</span>
      <span
        className={cx(
          'block',
          // El cambio de fase separa las jugadas de cada fase: la frase de siempre, en versalitas y violeta claro.
          divider ? 'text-micro font-bold uppercase tracking-wide' : 'text-body',
          divider ? (state === 'upcoming' ? 'text-accent/80' : 'text-accent') : state === 'upcoming' ? 'text-muted' : 'text-foreground',
          boxed && 'font-semibold',
        )}
      >
        {label}
      </span>
    </button>
  )

  // Las miniaturas a la izquierda y, a su lado, los chips arriba de la frase (en la lista compacta, sólo la frase).
  const heading =
    thumbs || kind ? (
      <div className={cx('grid items-center gap-x-2.5 gap-y-1.5', thumbs ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-[minmax(0,1fr)]')}>
        {thumbs}
        {kind ? (
          // Los chips son lo que se ve de un vistazo: la clase de la jugada (la frase ya la dice: no se lee dos veces) y de dónde sale (eso sí: es la descripción del botón).
          <span aria-hidden="true" className="flex min-w-0 flex-wrap gap-1">
            <Badge size="sm" shape="tag" rgb={tone ? FX_RGB[tone] : undefined}>
              {t(KIND_KEY[kind])}
            </Badge>
            {origin ? (
              <Badge size="sm" shape="tag" id={originId}>
                {t(ORIGIN_KEY[origin])}
              </Badge>
            ) : null}
          </span>
        ) : null}
        {button}
      </div>
    ) : (
      button
    )
  const rail = cx('relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-2', 'before:absolute before:left-[0.8125rem] before:top-0 before:-bottom-2 before:w-0.5 before:bg-border-subtle first:before:top-4 last:before:bottom-auto last:before:h-4')

  if (!boxed) {
    return (
      <li ref={ref} className={rail}>
        {/* 44 px de alto como mínimo (con o sin miniaturas, también las cabeceras): es un objetivo táctil y las filas quedan parejas, como la lista de siempre. */}
        <div className={cx('relative col-start-2 grid min-h-11 min-w-0 items-center rounded-control px-2 py-1 transition-colors duration-150 motion-reduce:transition-none', active ? 'bg-tint/14' : 'hover:bg-tint/8')}>{heading}</div>
      </li>
    )
  }

  return (
    <li ref={ref} className={rail}>
      <div className={cx('@container relative col-start-2 min-w-0 rounded-card border bg-card-background p-3 transition-colors duration-150 motion-reduce:transition-none', active ? 'border-info' : 'border-border-subtle hover:border-border')}>
        {/* Angosta (la columna de la mesa, el celular), el tablero va abajo; ancha (el diálogo en una tableta), a la derecha, como en la referencia. */}
        <div className="grid gap-2.5 @min-[30rem]:grid-cols-[minmax(0,1fr)_15rem] @min-[30rem]:items-start">
          <div className="grid min-w-0 content-start gap-2.5">
            {active ? <p className="m-0 animate-step-in text-micro font-semibold uppercase tracking-wide text-info-soft motion-reduce:animate-none">{t('practice.steps.context', { turn: after.turn, phase })}</p> : null}
            {heading}
            {moves.length > 0 ? (
              <div className="grid animate-step-in gap-2 border-t border-border-subtle pt-2.5 motion-reduce:animate-none">
                <p id={movesId} className="m-0 text-micro font-semibold uppercase tracking-wide text-soft">
                  {t('practice.moves.title')}
                </p>
                <ul aria-labelledby={movesId} className="m-0 grid list-none gap-1.5 p-0">
                  {moves.slice(0, MAX_MOVES).map((move) => (
                    <li key={move.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2">
                      <span aria-hidden="true" className="relative block aspect-[421/614] h-8 overflow-hidden bg-input">
                        <CardArt remoteUrl={artOf(move.id)} name="" className="block h-full w-full object-cover" />
                      </span>
                      <span className="grid min-w-0">
                        <span className="truncate text-micro font-semibold text-foreground">{nameOf(move.id)}</span>
                        <span className="text-micro text-muted">{routeOf(move, nameOf)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {moves.length > MAX_MOVES ? <p className="m-0 text-micro text-soft">{t('practice.moves.more', { count: moves.length - MAX_MOVES })}</p> : null}
              </div>
            ) : null}
          </div>
          {/* Debajo de la frase, hasta 18 rem (más grande no dice más y aleja la ficha siguiente), con las flechas de lo que se movió. */}
          <MatSnapshot state={after} change={info?.change} arrows={arrows} artOf={artOf} className="w-full max-w-[18rem] @min-[30rem]:max-w-none" />
        </div>
      </div>
    </li>
  )
})
