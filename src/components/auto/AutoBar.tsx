import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react'

import type { AutoPrefs } from '../../app/auto-prefs'
import { useDuelRails } from '../../app/duel-rails'
import { PHASES, type MatPhase } from '../../app/practice-mat'
import { useElementFits } from '../../app/use-element-width'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t, type MessageKey } from '../../i18n'
import { LaneBanner, LifeTile, RAIL_LANE_STYLE, type LaneNotice } from '../duel/DuelBar'
import { MAT_BAR_ROW, MatBarActions, MatExitButton } from '../probability/MatBarActions'
import { ShellMenuButton } from '../shell/ShellMenu'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
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

/**
 * Cuánto tiene que medir la fila de escritorio para llevar las vidas: la flecha (44 px), las dos vidas (36 rem cada una) y los ocho íconos (44 px), con su aire. Con el panel de pasos a
 * la derecha (y el detalle o el menú abiertos) la columna de la mesa es más angosta: las vidas bajan a la botonera, como en el celular (`onLivesInBar`).
 */
const LIVES_IN_BAR_PX = 740
/** Sin medir (o en las pruebas, sin diseño), entran. */
const livesFit = (width: number) => width === 0 || width >= LIVES_IN_BAR_PX

interface AutoBarProps {
  rivalName: string
  /** Los puntos de vida de los dos (los cuentan y destellan como en el duelo: `LifeTile`). En el celular no van acá: van abajo (`AutoLives` en `duel.life`). */
  life: { mine: number; theirs: number }
  /** Si las vidas van en la barra (con laterales, o en una fila de escritorio que las tiene): sin lugar, la pantalla las pone abajo (`duel.life`), como en el celular. */
  onLivesInBar?: (inBar: boolean) => void
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
  /** «Más opciones»: el estado entra y sale por acá (la pantalla lo guarda en las preferencias). */
  chain: AutoChainMode
  onChain: (mode: AutoChainMode) => void
  place: AutoPlaceMode
  onPlace: (mode: AutoPlaceMode) => void
  /** «Reiniciar el mismo duelo» de «Más opciones»: desde el principio, con las mismas cartas (sin esto, no se ofrece). */
  onRestart?: () => void
  /** «Seguir en modo manual» de «Más opciones»: abre el diálogo para seguir la partida en la mesa manual (sin esto, no se ofrece). */
  onManual?: () => void
  /** «Handtraps del rival»: si las usa, lo que tiene y «Cambiar handtraps» (la pantalla abre la hoja del simulador; al aplicar, el duelo empieza de nuevo). Apagadas, el rival es el pasivo. */
  handtraps: { on: boolean; summary: string; onChange: () => void }
  /** «A ciegas» (sólo con handtraps): la mano del rival de dorso. */
  blind: boolean
  onBlind: (on: boolean) => void
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
 * Las vidas de los dos (`LifeTile`: las cuenta, destella y sacude como en el duelo): en escritorio, en la barra; en el celular, abajo, en la botonera de la mesa (donde va la tuya en el duelo por
 * enlace). En escritorio, si en la barra no entran, también abajo y del tamaño del celular (`compact`): la botonera no crece.
 */
export function AutoLives({ rivalName, life, compact = false }: { rivalName: string; life: { mine: number; theirs: number }; compact?: boolean }) {
  return (
    <>
      <LifeTile name={rivalName} life={life.theirs} compact={compact} />
      <LifeTile name={t('duel.bar.you')} label={t('duel.bar.you')} life={life.mine} mine compact={compact} />
    </>
  )
}

/**
 * La barra de arriba de «Jugar solo automático» (la ranura `duel.header` de `PracticeMat`), hermana chica de `DuelBar`, que está atada al duelo por enlace. Es la barra de la práctica: la flecha de
 * «Volver a Jugar» a la izquierda y los mismos íconos, en el mismo orden (`MatBarActions`: la vista, los sonidos, la ventana grande, las handtraps del rival, «Nueva mano» y deshacer), y lo propio del
 * automático: el engranaje con «Más opciones» (respuestas a la cadena, la casilla, las handtraps del rival y «A ciegas», reiniciar el mismo duelo y jugar en modo manual), el turno con la fase y,
 * en escritorio, las vidas de los dos (en el celular van abajo: con los íconos no entran en la fila; tampoco en una fila de escritorio angosta, con el panel de pasos: `onLivesInBar`). En el
 * celular la línea del registro va debajo y los avisos (`LaneBanner`) se apoyan encima de ella; en escritorio, centrados debajo de la barra; con laterales, en el izquierdo. Nada de esto suma alto
 * cuando aparece o se va: el campo no se mueve. Todo el estado entra por props.
 */
export function AutoBar({ rivalName, life, onLivesInBar, turn, myTurn, phase, onExit, onUndo, canUndo, onNewHand, onHandtraps, lane = null, log, chain, onChain, place, onPlace, onRestart, onManual, handtraps, blind, onBlind }: AutoBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const rails = useDuelRails()
  // La fila de escritorio se mide (no la ventana): el ancho que deja la mesa depende del menú, del detalle y del panel de pasos.
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  const roomy = useElementFits(useMemo(() => ({ current: row }), [row]), livesFit)
  const livesInBar = rails || (docked && roomy)

  useLayoutEffect(() => onLivesInBar?.(livesInBar), [livesInBar, onLivesInBar])
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

  const lives = <AutoLives rivalName={rivalName} life={life} />
  // Los íconos de la práctica y, al final, el engranaje (lo propio del automático, donde la práctica tiene «Guardar combo» y los pasos).
  const actions = (first?: string) => (
    <>
      <MatBarActions auto className={first} onUndo={onUndo} canUndo={canUndo} onNewHand={onNewHand} onHandtraps={onHandtraps} />
      <IconButton tone="flat" size="sm" aria-label={t('duel.bar.more')} title={t('duel.bar.more')} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
        <Icon name="gear" />
      </IconButton>
    </>
  )
  const dialogs = (
    <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} size="keypad" veil={false} title={t('duel.bar.more')}>
      <div className="grid gap-5">
        <Setting title={t('auto.bar.chain')} hint={chainModeHint(chain)}>
          <Segmented label={t('auto.bar.chain')} value={chain} onChange={onChain} fullWidth options={chainModeOptions()} />
        </Setting>
        <Setting title={t('auto.bar.place')} hint={t('auto.bar.placeHint')}>
          <Segmented label={t('auto.bar.place')} value={place} onChange={onPlace} fullWidth options={[{ value: 'ask', label: t('auto.bar.ask') }, { value: 'auto', label: t('auto.bar.auto') }]} />
        </Setting>
        <Setting title={t('handtraps.title')} hint={handtraps.summary}>
          <Button
            variant="secondary"
            className="justify-self-start"
            aria-haspopup="dialog"
            onClick={() => {
              setMoreOpen(false)
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
                setMoreOpen(false)
                onRestart()
              }}
            >
              {t('auto.bar.restart')}
            </Button>
          </Setting>
        ) : null}
        {onManual ? (
          <Setting title={t('auto.bar.manual')} hint={t('auto.bar.manualHint')}>
            <Button
              variant="secondary"
              icon="hand"
              className="justify-self-start"
              onClick={() => {
                setMoreOpen(false)
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
      // Escritorio: una sola fila, del alto de las vidas. A la izquierda la flecha y las vidas; a la derecha los íconos y, debajo, el turno (en una notebook, en la fila de las vidas no entran juntos).
      // Si las vidas no entran (bajan a la botonera), la fila guarda su alto (`min-h-18`, el de una vida): el campo queda donde estaba.
      <div ref={setRow} className="relative flex items-center gap-1.5 px-0.5 pt-1.5">
        <MatExitButton onExit={onExit} />
        {livesInBar ? lives : null}
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
