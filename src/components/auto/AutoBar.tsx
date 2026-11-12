import { useContext, useLayoutEffect, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

import type { AutoPrefs } from '../../app/auto-prefs'
import type { RivalKind } from '../../app/handtraps'
import { useDuelRails } from '../../app/duel-rails'
import { setMatMenus, useMatMenus } from '../../app/mat-menus'
import { setMatView, useMatView } from '../../app/mat-view'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { Presence } from '../../app/use-presence'
import { t, type MessageKey } from '../../i18n'
import { BAR_SEAT, LaneBanner, RAIL_LANE_STYLE, type LaneNotice } from '../duel/DuelBar'
import { LifeScore } from '../duel/LifeScore'
import { COMPACT_FIELD_MEDIA_QUERY } from '../probability/compact-field'
import { MAT_BAR_ROW, MatBarActions, MatExitButton, MatReplayContext, MatRulesContext } from '../probability/MatBarActions'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { ShellMenuButton } from '../shell/ShellMenu'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { AutoPanel } from './AutoPanel'
import { Segmented, type SegmentedOption } from '../ui/Segmented'
import { Switch } from '../ui/Switch'

/** Cuándo te pregunta si respondés a una cadena: siempre que tengas algo que activar (`ask`, «Siempre») o nunca (`never`: contesta «No responder» solo). */
export type AutoChainMode = AutoPrefs['chain']

const CHAIN_MODES = {
  ask: ['auto.bar.always', 'auto.bar.chainAskHint'],
  never: ['auto.bar.never', 'auto.bar.chainNeverHint'],
} as const satisfies Record<AutoChainMode, readonly [MessageKey, MessageKey]>

/** Los dos modos de respuesta («Siempre · Nunca»), cada uno con lo que hace para el lector de pantalla: en «Más opciones» y en la banda de responder. */
export const chainModeOptions = (): SegmentedOption<AutoChainMode>[] => (['ask', 'never'] as const).map((value) => ({ value, label: t(CHAIN_MODES[value][0]), detailLabel: t(CHAIN_MODES[value][1]) }))
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
  /** «Rendirse» de Opciones (Solo): pide confirmar y termina el duelo como derrota (sin esto, no se ofrece). */
  onConcede?: () => void
  /** «Seguir en modo manual»: abre el diálogo para seguir la partida en la mesa manual (sin esto, no se ofrece). */
  onManual?: () => void
  /** «Guardar replay»: abre el diálogo para guardar el duelo como está (sin esto, no se ofrece). */
  onSaveReplay?: () => void
  /** «Qué hizo el bot y por qué»: abre la hoja con los motivos del rival (sin esto, no se ofrece). */
  onBotLog?: () => void
  /** «Rival»: contra quién jugás (`kind`), en una línea (`summary`), y «Cambiar rival» (la pantalla abre su hoja; al aplicar, el duelo empieza de nuevo). */
  rival: { kind: RivalKind; summary: string; onChange: () => void }
  /** La mano del rival de dorso: «A ciegas» con handtraps y, con el bot, lo contrario de «Mostrar la mano del bot». Con el pasivo no va. */
  blind: boolean
  onBlind: (on: boolean) => void
}

interface AutoBarProps extends AutoOptions {
  rivalName: string
  /** Los puntos de vida de los dos, planos (`LifeScore`): en el marcador debajo de los íconos hasta 1100 px y en el lateral izquierdo con laterales. En escritorio sin laterales van en las esquinas del campo: las pone la pantalla. */
  life: { mine: number; theirs: number }
  /** Si la mesa va con laterales (las vidas, en el izquierdo): sin ellos, la pantalla pone las vidas en la mesa. */
  onRails?: (rails: boolean) => void
  /** El turno del duelo (desde 1) y si es tuyo. */
  turn: number
  myTurn: boolean
  /** La flecha de «Volver a Jugar», como en la práctica. */
  onExit: () => void
  /** Los íconos de la práctica (`MatBarActions`): deshacer tu última orden y «Nueva mano» (otro duelo, con otra semilla); «Rival» del ⋯ abre la hoja de la pantalla. */
  onUndo: () => void
  canUndo: boolean
  onNewHand: () => void
  /** Lo que se apoya sobre la línea del registro (el núcleo resolviendo, la cadena con «No responder»): la misma fila, sin sumar alto. */
  lane?: LaneNotice | null
  /** La línea del registro (sólo en el celular; `DuelLogTicker`). */
  log?: ReactNode
  /** El celular: la chapa del rival (sus vidas), en la fila de los íconos, a la izquierda de deshacer. */
  seat?: ReactNode
}

/** Una fila de Opciones (M-10): de 44 px, el nombre a la izquierda y su control a la derecha. Lo que explica va en el `title` (sin párrafos de ayuda debajo: «explican lo justo y necesario»). */
export function OptionRow({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div title={hint} className="flex min-h-11 min-w-0 items-center justify-between gap-3 border-b border-border-subtle last:border-b-0">
      <span className="min-w-0 text-body font-semibold text-foreground">{title}</span>
      {children}
    </div>
  )
}

/** Una fila de Opciones que se enciende y se apaga: el interruptor a la derecha. */
function SwitchRow({ title, hint, checked, onChange }: { title: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <OptionRow title={title} hint={hint}>
      <Switch checked={checked} onChange={onChange} label={title} />
    </OptionRow>
  )
}

/** Una fila de Opciones que hace algo (o abre algo): toda la fila es el botón, con su «›» a la derecha y, si hace falta, el dato de hoy en gris. */
export function ActionRow({ title, hint, value, danger = false, onClick, ...rest }: { title: string; hint?: string; value?: string; danger?: boolean; onClick: () => void } & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-haspopup' | 'disabled'>) {
  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <Button variant="tertiary" {...(danger ? { color: 'danger' as const } : {})} iconEnd="chevron-right" fullWidth title={hint} aria-label={title} className="justify-between px-0! text-left" onClick={onClick} {...rest}>
        <span className={cx('truncate', value ? 'shrink-0' : 'min-w-0 flex-1')}>{title}</span>
        {value ? <span className="min-w-0 flex-1 truncate text-right text-micro font-normal text-muted">{value}</span> : null}
      </Button>
    </div>
  )
}

/** «Rendirse» de Opciones: qué pasa (`text`, en la confirmación) y cómo se pide; `disabled`, sin duelo en juego o sin rival a quien ganarle. */
export interface ConcedeOption {
  onConcede: () => void
  text: string
  disabled?: boolean
}

/** Las dos respuestas de una fila de Opciones, el segmentado chico en la misma fila (la cadena y la casilla). */
const rowSegmented = { size: 'sm', dense: true, className: '-my-1 shrink-0' } as const

/**
 * El panel de Opciones (M-10): la hoja recta de abajo del resto de los menús del duelo (`AutoPanel`: asa, ✕, Escape o tocar afuera) y, en escritorio, su ventana recta. Arriba «Vista 3D» y
 * «Menús flotantes» (se prenden y apagan en medio del duelo: la pregunta abierta cambia en el acto), después lo propio de cada duelo (`children`: cada uno, una fila) y, al final, «Rendirse ›».
 */
function OptionsPanel({ onClose, onConcede, disabled, children }: { onClose: () => void; onConcede?: () => void; disabled: boolean; children: ReactNode }) {
  const view = useMatView()
  const menus = useMatMenus()

  return (
    <AutoPanel kind="options" label={t('duel.options.title')} tall onDismiss={onClose}>
      <div>
        <SwitchRow title={t('practice.view.3d')} hint={t('duel.options.viewHint')} checked={view === '3d'} onChange={(on) => setMatView(on ? '3d' : 'top')} />
        <SwitchRow title={t('duel.options.floating')} hint={t('duel.options.floatingHint')} checked={menus === 'floating'} onChange={(on) => setMatMenus(on ? 'floating' : 'docked')} />
        {children}
        {onConcede ? <ActionRow danger title={t('duel.options.concede')} aria-haspopup="dialog" disabled={disabled} onClick={onConcede} /> : null}
      </div>
    </AutoPanel>
  )
}

/**
 * El ⚙ de abajo a la derecha (44 px, en el celular y en escritorio) y sus Opciones (`OptionsPanel`). Sin velo: la mesa se sigue viendo. Es lo único que lleva la vista 3D y las ventanas en un
 * duelo automático: su ⋯ ya no. El estado es de toda la app (`mat-view`, `mat-menus`).
 */
export function OptionsGear({ children, concede }: { children: ReactNode | ((close: () => void) => ReactNode); concede?: ConcedeOption }) {
  const [open, setOpen] = useState(false)
  const [conceding, setConceding] = useState(false)
  const close = () => setOpen(false)

  return (
    <>
      <IconButton tone="tile" size="sm" data-mat-gear="" aria-haspopup="dialog" aria-label={t('auto.dock.options')} title={t('auto.dock.options')} onClick={() => setOpen(true)}>
        <Icon name="gear" />
      </IconButton>
      <Presence>
        {open ? (
          <OptionsPanel
            onClose={close}
            disabled={concede?.disabled === true}
            {...(concede
              ? {
                  onConcede: () => {
                    close()
                    setConceding(true)
                  },
                }
              : {})}
          >
            {typeof children === 'function' ? children(close) : children}
          </OptionsPanel>
        ) : null}
      </Presence>
      {concede ? (
        <ConfirmDialog
          veil={false}
          anchor="mat"
          isOpen={conceding}
          title={t('duel.bar.concedeTitle')}
          description={concede.text}
          confirmLabel={t('duel.options.concede')}
          cancelLabel={t('duel.bar.keepPlaying')}
          confirmColor="danger"
          onCancel={() => setConceding(false)}
          onConfirm={() => {
            setConceding(false)
            concede.onConcede()
          }}
        />
      ) : null}
    </>
  )
}

/** «Respuestas»: siempre o nunca te pregunta si respondés a una cadena (en la misma fila). */
export function ChainRow({ chain, onChain }: { chain: AutoChainMode; onChain: (mode: AutoChainMode) => void }) {
  return (
    <OptionRow title={t('auto.bar.chain')} hint={chainModeHint(chain)}>
      <Segmented label={t('auto.bar.chain')} value={chain} onChange={onChain} options={chainModeOptions()} {...rowSegmented} />
    </OptionRow>
  )
}

/** «Casilla»: la elegís vos o va a la primera libre (en la misma fila). */
export function PlaceRow({ place, onPlace }: { place: AutoPlaceMode; onPlace: (mode: AutoPlaceMode) => void }) {
  return (
    <OptionRow title={t('auto.bar.place')} hint={t('auto.bar.placeHint')}>
      <Segmented label={t('auto.bar.place')} value={place} onChange={onPlace} options={[{ value: 'ask', label: t('auto.bar.ask') }, { value: 'auto', label: t('auto.bar.auto') }]} {...rowSegmented} />
    </OptionRow>
  )
}

/** Lo de Opciones que es de «Jugar solo automático»: las respuestas a la cadena, la casilla, el rival y su mano de dorso, reiniciar el mismo duelo, el replay, el bot y seguir en modo manual; cada uno, una fila. */
function SoloSettings({ chain, onChain, place, onPlace, onRestart, onManual, onSaveReplay, onBotLog, rival, blind, onBlind, close }: AutoOptions & { close: () => void }) {
  // Cada acción cierra el panel antes de abrir lo suyo (una hoja o un diálogo).
  const go = (action: () => void) => () => {
    close()
    action()
  }

  return (
    <>
      <ChainRow chain={chain} onChain={onChain} />
      <PlaceRow place={place} onPlace={onPlace} />
      <ActionRow title={t('auto.rival.change')} value={rival.summary} aria-haspopup="dialog" onClick={go(rival.onChange)} />
      {rival.kind === 'bot' ? (
        <SwitchRow title={t('auto.rival.botHand')} hint={t('auto.rival.botHandHint')} checked={!blind} onChange={(shown) => onBlind(!shown)} />
      ) : rival.kind === 'handtraps' ? (
        <SwitchRow title={t('auto.bar.blind')} hint={t('auto.bar.blindHint')} checked={blind} onChange={onBlind} />
      ) : null}
      {onRestart ? <ActionRow title={t('auto.bar.restart')} hint={t('auto.bar.restartHint')} onClick={go(onRestart)} /> : null}
      {onSaveReplay ? <ActionRow title={t('meta.duels.save.button')} hint={t('auto.bar.saveReplayHint')} aria-haspopup="dialog" onClick={go(onSaveReplay)} /> : null}
      {onBotLog ? <ActionRow title={t('auto.bot.log.open')} hint={t('auto.bot.log.optionHint')} aria-haspopup="dialog" onClick={go(onBotLog)} /> : null}
      {onManual ? <ActionRow title={t('auto.bar.manual')} hint={t('auto.bar.manualHint')} onClick={go(onManual)} /> : null}
    </>
  )
}

/**
 * Las herramientas de la mesa en «Jugar solo automático» (abajo a la derecha, dos cuadrados de 44 px; Gastón, 2026-11-12: «los botones son horribles»): ≡ «Pasos» (muestra u oculta el panel de la derecha;
 * sólo en escritorio, `steps`: en el celular ≡ es el de la mesa) y ⚙ «Opciones» (`OptionsGear`). La cadena, el modo manual y lo demás ya no tienen ficha: viven en Opciones.
 */
export function AutoDock({ steps, onConcede, ...options }: AutoOptions & { steps?: { open: boolean; onToggle: () => void } }) {
  const concede = onConcede ? { onConcede, text: t('duel.options.concedeSolo') } : undefined

  return (
    <div role="group" aria-label={t('auto.dock.label')} data-mat-tools="" className="flex items-center gap-2">
      {steps ? (
        <IconButton tone="tile" size="sm" aria-pressed={steps.open} aria-label={t('practice.mat.stepsAndCombos')} title={t('practice.mat.stepsAndCombos')} onClick={steps.onToggle}>
          <Icon name="list" />
        </IconButton>
      ) : null}
      <OptionsGear {...(concede ? { concede } : {})}>{(close) => <SoloSettings {...options} close={close} />}</OptionsGear>
    </div>
  )
}

/**
 * La barra de arriba de «Jugar solo automático» (la ranura `duel.header` de `PracticeMat`), hermana chica de `DuelBar`, que está atada al duelo por enlace. Es la barra de la práctica: la flecha de
 * «Volver a Jugar» a la izquierda y, a la derecha, deshacer y el ⋯ (`MatBarActions`), y lo propio del automático: «Rival» en el ⋯ (las Opciones del duelo van en el ⚙ de abajo, `AutoDock`), el turno, dicho una sola vez y sólo hasta 1100 px («Tu turno · 3», en el color de quién es; desde 1101 px lo dice la chapa de quien juega y la fase, sólo el botón del campo) y las vidas, planas (`LifeScore`): hasta 1100 px en el marcador debajo
 * de los íconos («VOS 8000 · Tu turno · 1 · RIVAL 8000»), con laterales en el izquierdo y, en escritorio sin ellos, en las esquinas del campo (las pone la pantalla). Hasta 1100 px la línea del registro va
 * debajo y los avisos (`LaneBanner`) se apoyan encima de ella; en escritorio, centrados debajo de la barra; con laterales, en el izquierdo. Nada de esto suma alto cuando aparece o se va: el campo no se
 * mueve. Todo el estado entra por props.
 */
export function AutoBar({ rivalName, life, onRails, turn, myTurn, onExit, onUndo, canUndo, onNewHand, lane = null, log, seat, ...options }: AutoBarProps) {
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const phone = useMediaQuery(COMPACT_FIELD_MEDIA_QUERY)
  const rails = useDuelRails()
  // La píldora de las salidas (o el aviso de deshacer) va antes de la chapa del rival: la fila la lee acá y se la saca a los íconos.
  const rules = useContext(MatRulesContext)
  // Repasando un combo en el celular: el paso va en el segundo renglón del aviso (la mesa lo da; los botones y la línea de tiempo quedan abajo).
  const replay = useContext(MatReplayContext)

  useLayoutEffect(() => onRails?.(rails), [rails, onRails])
  const laneOpen = lane !== null
  // El turno, una sola vez (Gastón, 2026-10-27): sin el chip «Turno N» ni la píldora de la fase.
  const turnLine = (className: string) => (
    <span data-testid="auto-turn" className={cx('min-w-0 truncate text-lead font-bold max-[359px]:text-body', myTurn ? 'text-accent' : 'text-info-soft', className)}>
      {turn > 0 ? (myTurn ? t('auto.bar.turnMine', { turn }) : t('duel.bar.theirTurnN', { name: rivalName, turn })) : null}
    </span>
  )

  // Los íconos de la práctica (deshacer y el ⋯, sin la vista 3D: está en Opciones, el ⚙ de abajo a la derecha, que arma la pantalla).
  const actions = (first?: string) => (
    <MatBarActions className={first} onUndo={onUndo} canUndo={canUndo} onNewHand={onNewHand} rival={{ meta: t(`auto.rival.kind.${options.rival.kind}`), onSelect: options.rival.onChange }} view={false} />
  )

  // Con laterales (escritorio ancho), las piezas van a la grilla de la mesa como las de `DuelBar`: arriba a la izquierda la flecha y las vidas, y los avisos debajo; arriba a la derecha los íconos
  // (de 40 px, como los de `DuelBar`: el lateral más angosto tiene lugar para cinco por fila).
  if (rails) {
    return (
      <>
        {/* Las vidas, planas, cada una de su lado del lateral izquierdo: el rival arriba, junto a la flecha, y vos abajo (Gastón, 2026-10-26: «la vida de ambos jugadores junta»). */}
        <div className="col-start-1 row-start-1 flex min-w-0 items-start gap-2">
          <MatExitButton onExit={onExit} />
          <LifeScore name={rivalName} label={t('duel.bar.rivalTag')} life={life.theirs} align="start" size="lg" />
        </div>
        <div className="col-start-1 row-start-3 flex min-w-0 items-end">
          <LifeScore name={t('duel.bar.you')} label={t('duel.bar.you')} life={life.mine} mine size="lg" />
        </div>
        <div className="col-start-3 row-start-1 flex min-w-0 flex-col items-end gap-3">
          <div role="toolbar" aria-label={t('practice.mat.name')} className={cx('-mr-2', MAT_BAR_ROW)}>
            {actions()}
          </div>
        </div>
        {/* El aviso, en lo que el campo agrandado deja libre del lateral (`--field-overhang`, de la mesa) y por encima del tablero (`z-20`): nunca cortado ni debajo. Con menos de 11 rem libres se apoya sobre el borde del campo.
            La caja no ataja toques, sólo el aviso: ocupa todo el lateral y, encima del campo, tapaba el Extra Deck (`RAIL_LANE_STYLE`). */}
        <div className="pointer-events-none relative z-20 col-start-1 row-start-2 flex min-h-0 flex-col items-stretch gap-2 pt-4 *:pointer-events-auto" style={RAIL_LANE_STYLE}>{lane ? <LaneBanner lane={lane} rivalName={rivalName} rail /> : null}</div>
      </>
    )
  }

  if (docked) {
    return (
      // Escritorio: una sola fila. A la izquierda la flecha y a la derecha los íconos; el turno no se dice (la chapa de quien juega lo dice). Las vidas van en las esquinas del campo (las pone la pantalla);
      // la fila guarda el alto de cuando las llevaba (`min-h-18`): el campo queda donde estaba.
      <div className="relative flex items-center gap-1.5 px-0.5 pt-1.5">
        <MatExitButton onExit={onExit} />
        <div className="ml-auto flex min-h-18 min-w-0 flex-col items-end justify-center">
          <div role="toolbar" aria-label={t('practice.mat.name')} className={cx('-mr-1', MAT_BAR_ROW)}>
            {actions()}
          </div>
        </div>
        {/* El aviso, centrado debajo de la barra. */}
        {lane ? (
          <div className="absolute left-1/2 top-full z-20 mt-1 h-11 w-[min(24rem,100%)] -translate-x-1/2">
            <LaneBanner lane={lane} rivalName={rivalName} />
          </div>
        ) : null}
      </div>
    )
  }

  return (
    // Hasta 1100 px: arriba la fila de la práctica (la hamburguesa, la flecha y los íconos, en el mismo lugar), debajo el marcador y la línea del registro (en el celular flota: no ocupa lugar).
    <div className="relative flex flex-col gap-1.5 px-0.5 pt-1.5">
      <div role="toolbar" aria-label={t('practice.mat.name')} className={cx('-mr-1 h-11', MAT_BAR_ROW)}>
        <ShellMenuButton className="-ml-2" />
        <MatExitButton onExit={onExit} />
        {/* Los íconos, a la derecha, como en la práctica (el engranaje, al final, donde ella tiene «Guardar combo» y los pasos). En el celular, antes de ellos, la chapa del rival. */}
        {phone && seat ? (
          <>
            {rules}
            <span data-bar-seat="" className={cx(BAR_SEAT, !rules && 'ml-auto')}>{seat}</span>
            <MatRulesContext value={null}>{actions()}</MatRulesContext>
          </>
        ) : (
          actions('ml-auto')
        )}
      </div>
      {/* En el celular la barra es sólo esta fila: las vidas del rival van en ella, las tuyas en tu chapa (abajo) y los avisos flotan sobre tu mano (los pone la pantalla). */}
      {phone ? null : (
        <>
          {/* El marcador, plano (Gastón, 2026-10-27, opción A; de 640 a 1100 px): «VOS 8000 · Tu turno · 1 · RIVAL 8000». La fase, en el botón del campo. */}
          <div data-testid="auto-score" className="flex min-h-10 min-w-0 items-center gap-2 px-1">
            <LifeScore name={t('duel.bar.you')} label={t('duel.bar.you')} life={life.mine} mine />
            {turnLine('flex-1 text-center')}
            <LifeScore name={rivalName} label={t('duel.bar.rivalTag')} life={life.theirs} />
          </div>
          {/* La línea del registro, con el aviso encima (la misma fila); sin registro, su lugar igual queda (el primer aviso no corre nada). */}
          <div className="relative max-sm:pointer-events-none max-sm:z-20 max-sm:-mb-11">
            <div inert={laneOpen} className={cx(laneOpen && 'invisible')}>
              {log ?? <div aria-hidden="true" className="min-h-11" />}
            </div>
            {lane ? <LaneBanner lane={lane} rivalName={rivalName} detail={replay?.step} /> : null}
          </div>
        </>
      )}
    </div>
  )
}
