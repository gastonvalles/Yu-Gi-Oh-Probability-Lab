import { useLayoutEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

import type { AutoPrefs } from '../../app/auto-prefs'
import { useDuelRails } from '../../app/duel-rails'
import { PHASES, type MatPhase } from '../../app/practice-mat'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t, type MessageKey } from '../../i18n'
import { LaneBanner, LifeTile, RAIL_LANE_STYLE, type LaneNotice } from '../duel/DuelBar'
import { MAT_BAR_ROW, MatBarActions, MatExitButton } from '../probability/MatBarActions'
import { ShellMenuButton } from '../shell/ShellMenu'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { Segmented, type SegmentedOption } from '../ui/Segmented'
import { Switch } from '../ui/Switch'

/** Cuándo te pregunta si respondés a una cadena: siempre que se pueda (`always`), sólo si algo responde de verdad (`ask`) o nunca (`never`: contesta «No responder» solo). */
export type AutoChainMode = AutoPrefs['chain']

const CHAIN_MODES = {
  always: ['auto.bar.always', 'auto.bar.chainAlwaysHint'],
  ask: ['auto.bar.whenItMatters', 'auto.bar.chainAskHint'],
  never: ['auto.bar.never', 'auto.bar.chainNeverHint'],
} as const satisfies Record<AutoChainMode, readonly [MessageKey, MessageKey]>

/** Los tres modos de respuesta, en el orden de la pista («Siempre · Cuando importa · Nunca»), cada uno con lo que hace para el lector de pantalla: en «Más opciones» y en la banda de responder. */
export const chainModeOptions = (): SegmentedOption<AutoChainMode>[] => (['always', 'ask', 'never'] as const).map((value) => ({ value, label: t(CHAIN_MODES[value][0]), detailLabel: t(CHAIN_MODES[value][1]) }))
/** Lo que hace el modo elegido (la línea chica del ajuste). */
export const chainModeHint = (mode: AutoChainMode) => t(CHAIN_MODES[mode][1])
/** Si la casilla de cada carta la elegís vos (`ask`) o va a la primera libre (`auto`). */
export type AutoPlaceMode = 'ask' | 'auto'

/** Lo que se ajusta del duelo: en «Más opciones» (el engranaje de la barra) y, en escritorio, en la botonera (`AutoDock`). El estado entra y sale por acá (la pantalla lo guarda en las preferencias). */
export interface AutoOptions {
  chain: AutoChainMode
  onChain: (mode: AutoChainMode) => void
  place: AutoPlaceMode
  onPlace: (mode: AutoPlaceMode) => void
  /** «Reiniciar el mismo duelo» de «Más opciones»: desde el principio, con las mismas cartas (sin esto, no se ofrece). */
  onRestart?: () => void
  /** «Seguir en modo manual»: abre el diálogo para seguir la partida en la mesa manual (sin esto, no se ofrece). */
  onManual?: () => void
  /** «Handtraps del rival»: si las usa, lo que tiene y «Cambiar handtraps» (la pantalla abre la hoja del simulador; al aplicar, el duelo empieza de nuevo). Apagadas, el rival es el pasivo. */
  handtraps: { on: boolean; summary: string; onChange: () => void }
  /** «A ciegas» (sólo con handtraps): la mano del rival de dorso. */
  blind: boolean
  onBlind: (on: boolean) => void
}

interface AutoBarProps extends AutoOptions {
  rivalName: string
  /** Los puntos de vida de los dos (los cuentan y destellan como en el duelo: `LifeTile`): acá sólo con laterales (en el izquierdo). Sin ellos van en las esquinas del campo (escritorio) o abajo (celular): los pone la pantalla. */
  life: { mine: number; theirs: number }
  /** Las cartas de la mano de cada uno, junto a su nombre en las vidas (sin esto, no se dicen). */
  hands?: { mine: number; theirs: number }
  /** Si la mesa va con laterales (las vidas, en el izquierdo): sin ellos, la pantalla pone las vidas en la mesa. */
  onRails?: (rails: boolean) => void
  /** En escritorio el engranaje va en la botonera de la mesa (`AutoDock`), no en la barra. */
  dock?: boolean
  /** El turno del duelo (desde 1) y si es tuyo. */
  turn: number
  myTurn: boolean
  /** La fase de quien tiene el turno; `null` antes de empezar. */
  phase: MatPhase | null
  /** La flecha de «Volver a Jugar», como en la práctica. */
  onExit: () => void
  /** Los íconos de la práctica (`MatBarActions`): deshacer tu última orden, «Nueva mano» (otro duelo, con otra semilla) y aplicar las handtraps del rival (el duelo empieza de nuevo). */
  onUndo: () => void
  canUndo: boolean
  onNewHand: () => void
  onHandtraps: () => void
  /** Lo que se apoya sobre la línea del registro (el núcleo resolviendo, la cadena con «No responder»): la misma fila, sin sumar alto. */
  lane?: LaneNotice | null
  /** La línea del registro (sólo en el celular; `DuelLogTicker`). */
  log?: ReactNode
}

/** Un ajuste de «Más opciones» con su nombre, su línea chica y el control debajo (también los del duelo automático por enlace, en «Más opciones» de `DuelBar`). */
export function Setting({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="grid gap-0.5">
        <span className="text-body font-semibold text-foreground">{title}</span>
        <span className="text-micro text-soft">{hint}</span>
      </span>
      {children}
    </div>
  )
}

/**
 * Las vidas de los dos (`LifeTile`: las cuenta, destella y sacude como en el duelo): en el celular, abajo, en la botonera de la mesa (donde va la tuya en el duelo por enlace); con laterales, en el
 * izquierdo. En escritorio sin laterales van separadas, en las esquinas del campo (la pantalla: `duel.corner` y `duel.life`).
 */
export function AutoLives({ rivalName, life, hands }: { rivalName: string; life: { mine: number; theirs: number }; hands?: { mine: number; theirs: number } }) {
  return (
    <>
      <LifeTile name={rivalName} life={life.theirs} {...(hands ? { hand: hands.theirs } : {})} />
      <LifeTile name={t('duel.bar.you')} label={t('duel.bar.you')} life={life.mine} mine {...(hands ? { hand: hands.mine } : {})} />
    </>
  )
}

/**
 * «Más opciones» del duelo: las respuestas a la cadena, la casilla, las handtraps del rival y «A ciegas», reiniciar el mismo duelo y seguir en modo manual. Desde la botonera (`inDock`) no repite lo
 * que ahí tiene su botón (las respuestas y el modo manual). Sin velo: la mesa se sigue viendo.
 */
function MoreOptions({ isOpen, onClose, inDock = false, chain, onChain, place, onPlace, onRestart, onManual, handtraps, blind, onBlind }: AutoOptions & { isOpen: boolean; onClose: () => void; inDock?: boolean }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="keypad" veil={false} title={t('duel.bar.more')}>
      <div className="grid gap-5">
        {inDock ? null : (
          <Setting title={t('auto.bar.chain')} hint={chainModeHint(chain)}>
            <Segmented label={t('auto.bar.chain')} value={chain} onChange={onChain} fullWidth options={chainModeOptions()} />
          </Setting>
        )}
        <Setting title={t('auto.bar.place')} hint={t('auto.bar.placeHint')}>
          <Segmented label={t('auto.bar.place')} value={place} onChange={onPlace} fullWidth options={[{ value: 'ask', label: t('auto.bar.ask') }, { value: 'auto', label: t('auto.bar.auto') }]} />
        </Setting>
        <Setting title={t('handtraps.title')} hint={handtraps.summary}>
          <Button
            variant="secondary"
            className="justify-self-start"
            aria-haspopup="dialog"
            onClick={() => {
              onClose()
              handtraps.onChange()
            }}
          >
            {t('auto.bar.handtrapsChange')}
          </Button>
        </Setting>
        {handtraps.on ? (
          <div className="flex items-center justify-between gap-3">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-semibold text-foreground">{t('auto.bar.blind')}</span>
              <span className="text-micro text-soft">{t('auto.bar.blindHint')}</span>
            </span>
            <Switch checked={blind} onChange={onBlind} label={t('auto.bar.blind')} />
          </div>
        ) : (
          <Callout tone="neutral">{t('auto.rival.passive')}</Callout>
        )}
        {onRestart ? (
          <Setting title={t('auto.bar.restart')} hint={t('auto.bar.restartHint')}>
            <Button
              variant="secondary"
              icon="refresh"
              className="justify-self-start"
              onClick={() => {
                onClose()
                onRestart()
              }}
            >
              {t('auto.bar.restart')}
            </Button>
          </Setting>
        ) : null}
        {onManual && !inDock ? (
          <Setting title={t('auto.bar.manual')} hint={t('auto.bar.manualHint')}>
            <Button
              variant="secondary"
              icon="hand"
              className="justify-self-start"
              onClick={() => {
                onClose()
                onManual()
              }}
            >
              {t('auto.bar.manual')}
            </Button>
          </Setting>
        ) : null}
      </div>
    </Modal>
  )
}

/**
 * Un botón de la botonera: el círculo de 40 px con su ícono y el nombre debajo; se toca todo el botón (56 × 56), como las fases de `PhaseRow`. `on`: el modo que está prendido (violeta con aro
 * ámbar); uno que se prende y apaga (`aria-pressed`), con el ícono ámbar.
 */
function DockButton({ icon, label, on = false, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; on?: boolean }) {
  return (
    <button type="button" className={cx('group grid min-w-14 cursor-pointer justify-items-center gap-1 rounded-control border-0 bg-transparent p-0 outline-none focus-visible:shadow-focus', className)} {...props}>
      <span aria-hidden="true" className={cx('grid size-10 place-items-center rounded-full border-2 transition-colors', on ? 'border-info bg-accent text-accent-foreground' : 'border-border text-foreground group-hover:bg-tint/12 group-aria-pressed:text-info')}>
        <Icon name={icon} size={20} />
      </span>
      <span aria-hidden="true" className={cx('whitespace-nowrap text-micro font-semibold leading-none', on ? 'text-info' : 'text-foreground')}>
        {label}
      </span>
    </button>
  )
}

/**
 * La botonera redonda de «Jugar solo automático» en escritorio (abajo a la derecha de la mesa, lámina 07), con lo que se toca del duelo y no es una jugada; cada botón con su nombre debajo:
 * «Automático» (el modo de ahora, prendido: tocarlo abre «Seguir en modo manual»; el camino de vuelta no existe), «Cadena» (las respuestas: Siempre · Cuando importa · Nunca), «Pasos» (muestra u
 * oculta el panel de la derecha) y «Opciones» (el resto de «Más opciones», que sale de la barra de arriba). Lo que ya está en la barra (deshacer, la vista, los sonidos) no se repite.
 * Mide 56 px de alto y sube 12 sobre el borde de la mano (`-mt-3`, como las vidas): la fila de abajo no crece y el campo no se mueve.
 */
export function AutoDock({ steps, ...options }: AutoOptions & { steps: { open: boolean; onToggle: () => void } }) {
  const [open, setOpen] = useState<'chain' | 'more' | null>(null)
  const close = () => setOpen(null)
  const { chain, onChain, onManual } = options

  return (
    <div role="group" aria-label={t('auto.dock.label')} data-mat-dock="" className="-mt-3 flex items-start gap-1">
      {onManual ? <DockButton icon="play" label={t('auto.dock.auto')} on aria-pressed="true" aria-haspopup="dialog" aria-label={t('auto.dock.autoName')} onClick={onManual} /> : null}
      <DockButton icon="link" label={t('auto.dock.chain')} aria-haspopup="dialog" aria-label={t('auto.dock.chainName', { mode: t(CHAIN_MODES[chain][0]) })} onClick={() => setOpen('chain')} />
      <DockButton icon="list" label={t('auto.dock.steps')} aria-pressed={steps.open} aria-label={t('practice.mat.stepsAndCombos')} onClick={steps.onToggle} />
      <DockButton icon="gear" label={t('auto.dock.options')} aria-haspopup="dialog" aria-label={t('duel.bar.more')} onClick={() => setOpen('more')} />
      <Modal isOpen={open === 'chain'} onClose={close} size="keypad" veil={false} title={t('auto.dock.chainTitle')}>
        <Setting title={t('auto.bar.chain')} hint={chainModeHint(chain)}>
          <Segmented label={t('auto.bar.chain')} value={chain} onChange={onChain} fullWidth options={chainModeOptions()} />
        </Setting>
      </Modal>
      <MoreOptions isOpen={open === 'more'} onClose={close} inDock {...options} />
    </div>
  )
}

/**
 * La barra de arriba de «Jugar solo automático» (la ranura `duel.header` de `PracticeMat`), hermana chica de `DuelBar`, que está atada al duelo por enlace. Es la barra de la práctica: la flecha de
 * «Volver a Jugar» a la izquierda y los mismos íconos, en el mismo orden (`MatBarActions`: la vista, los sonidos, la ventana grande, las handtraps del rival, «Nueva mano» y deshacer), y lo propio del
 * automático: el engranaje con «Más opciones» (en escritorio, con `dock`, va en la botonera de la mesa: `AutoDock`), el turno con la fase y, con laterales, las vidas de los dos (sin ellos van en
 * las esquinas del campo o abajo, en el celular: las pone la pantalla). En el celular la línea del registro va debajo y los avisos (`LaneBanner`) se apoyan encima de ella; en escritorio, centrados
 * debajo de la barra; con laterales, en el izquierdo. Nada de esto suma alto cuando aparece o se va: el campo no se mueve. Todo el estado entra por props.
 */
export function AutoBar({ rivalName, life, hands, onRails, dock = false, turn, myTurn, phase, onExit, onUndo, canUndo, onNewHand, onHandtraps, lane = null, log, ...options }: AutoBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const rails = useDuelRails()

  useLayoutEffect(() => onRails?.(rails), [rails, onRails])
  const laneOpen = lane !== null
  const phaseName = PHASES.find((entry) => entry.id === phase)?.name
  const whose = myTurn ? t('duel.bar.yourTurn') : t('duel.bar.theirTurn', { name: rivalName })
  const turnChip = turn > 0 ? <span data-testid="auto-turn" className="shrink-0 whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted">{t('practice.mat.turn', { turn })}</span> : null
  const turnLine = (
    <span className="min-w-0 truncate text-lead font-bold">
      <span className={myTurn ? 'text-accent' : 'text-info-soft'}>{whose}</span>
      {phaseName ? <span data-testid="auto-phase" className="text-info">{` · ${phaseName}`}</span> : null}
    </span>
  )

  const lives = <AutoLives rivalName={rivalName} life={life} {...(hands ? { hands } : {})} />
  // Los íconos de la práctica y, al final, el engranaje (lo propio del automático, donde la práctica tiene «Guardar combo» y los pasos). En escritorio con la botonera, el engranaje va en ella.
  const gear = !(dock && docked)
  const actions = (first?: string) => (
    <>
      <MatBarActions auto className={first} onUndo={onUndo} canUndo={canUndo} onNewHand={onNewHand} onHandtraps={onHandtraps} />
      {gear ? (
        <IconButton tone="flat" size="sm" aria-label={t('duel.bar.more')} title={t('duel.bar.more')} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
          <Icon name="gear" />
        </IconButton>
      ) : null}
    </>
  )
  const dialogs = gear ? <MoreOptions isOpen={moreOpen} onClose={() => setMoreOpen(false)} {...options} /> : null

  // Con laterales (escritorio ancho), las piezas van a la grilla de la mesa como las de `DuelBar`: arriba a la izquierda la flecha y las vidas, y los avisos debajo; arriba a la derecha los íconos
  // (de 40 px, como los de `DuelBar`: el lateral más angosto tiene lugar para cinco por fila), el turno y la fase.
  if (rails) {
    return (
      <>
        <div className="col-start-1 row-start-1 flex min-w-0 items-start gap-2">
          <MatExitButton onExit={onExit} />
          <div className="flex min-w-0 flex-col items-start gap-2">{lives}</div>
        </div>
        <div className="col-start-3 row-start-1 flex min-w-0 flex-col items-end gap-3">
          <div role="toolbar" aria-label={t('practice.mat.name')} className="-mr-2 flex flex-wrap items-center justify-end [&>button]:size-10!">
            {actions()}
          </div>
          {turnChip}
          <span className="grid justify-items-end text-right text-lead font-bold leading-tight">
            <span className={myTurn ? 'text-accent' : 'text-info-soft'}>{whose}</span>
            {phaseName ? <span data-testid="auto-phase" className="text-info">{phaseName}</span> : null}
          </span>
        </div>
        {/* El aviso, en lo que el campo agrandado deja libre del lateral (`--field-overhang`, de la mesa) y por encima del tablero (`z-20`): nunca cortado ni debajo. Con menos de 11 rem libres se apoya sobre el borde del campo.
            La caja no ataja toques, sólo el aviso: ocupa todo el lateral y, encima del campo, tapaba el Extra Deck (`RAIL_LANE_STYLE`). */}
        <div className="pointer-events-none relative z-20 col-start-1 row-start-2 flex min-h-0 flex-col items-stretch gap-2 pt-4 *:pointer-events-auto" style={RAIL_LANE_STYLE}>{lane ? <LaneBanner lane={lane} rivalName={rivalName} rail /> : null}</div>
        {dialogs}
      </>
    )
  }

  if (docked) {
    return (
      // Escritorio: una sola fila. A la izquierda la flecha; a la derecha los íconos y, debajo, el turno. Las vidas van en las esquinas del campo (las pone la pantalla); la fila guarda el alto
      // de cuando las llevaba (`min-h-18`): el campo queda donde estaba.
      <div className="relative flex items-center gap-1.5 px-0.5 pt-1.5">
        <MatExitButton onExit={onExit} />
        <div className="ml-auto flex min-h-18 min-w-0 flex-col items-end justify-center gap-0.5">
          <div role="toolbar" aria-label={t('practice.mat.name')} className="-mr-1 flex items-center gap-1">
            {actions()}
          </div>
          <div className="flex min-w-0 max-w-full items-center gap-1.5">
            {turnChip}
            {turnLine}
          </div>
        </div>
        {/* El aviso, centrado debajo de la barra. */}
        {lane ? (
          <div className="absolute left-1/2 top-full z-20 mt-1 h-11 w-[min(24rem,100%)] -translate-x-1/2">
            <LaneBanner lane={lane} rivalName={rivalName} />
          </div>
        ) : null}
        {dialogs}
      </div>
    )
  }

  return (
    // Celular: arriba la fila de la práctica (la hamburguesa, la flecha y los íconos, en el mismo lugar), debajo el turno y la línea del registro (flota: no ocupa lugar). Las tres filas miden lo mismo que
    // cuando arriba iban las vidas (la de los íconos, 44 px; la del turno, 38): el campo no se corrió al traer los íconos.
    <div className="relative flex flex-col gap-1.5 px-0.5 pt-1.5">
      <div role="toolbar" aria-label={t('practice.mat.name')} className={cx('-mr-1 h-11', MAT_BAR_ROW)}>
        <ShellMenuButton className="-ml-2" />
        <MatExitButton onExit={onExit} />
        {/* Los íconos, a la derecha, como en la práctica (el engranaje, al final, donde ella tiene «Guardar combo» y los pasos). */}
        {actions('ml-auto')}
      </div>
      <div className="flex min-h-9.5 min-w-0 items-center gap-1.5">
        {turnChip}
        {turnLine}
      </div>
      {/* La línea del registro, con el aviso encima (la misma fila); sin registro, su lugar igual queda (el primer aviso no corre nada). */}
      <div className="relative max-sm:pointer-events-none max-sm:z-20 max-sm:-mb-11">
        <div inert={laneOpen} className={cx(laneOpen && 'invisible')}>
          {log ?? <div aria-hidden="true" className="min-h-11" />}
        </div>
        {lane ? <LaneBanner lane={lane} rivalName={rivalName} /> : null}
      </div>
      {dialogs}
    </div>
  )
}
