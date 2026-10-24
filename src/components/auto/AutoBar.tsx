import { useState, type ReactNode } from 'react'

import { useDuelRails } from '../../app/duel-rails'
import { PHASES, type MatPhase } from '../../app/practice-mat'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { HEADER_ICON, LaneBanner, LifeTile, RAIL_LANE_STYLE, type LaneNotice } from '../duel/DuelBar'
import { MatViewToggle } from '../probability/MatViewToggle'
import { ShellMenuButton } from '../shell/ShellMenu'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton, IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { Switch } from '../ui/Switch'

/** Si el núcleo pregunta cuando podés responder a una cadena (`ask`) o contesta «No responder» solo (`never`). */
export type AutoChainMode = 'ask' | 'never'
/** Si la casilla de cada carta la elegís vos (`ask`) o va a la primera libre (`auto`). */
export type AutoPlaceMode = 'ask' | 'auto'

interface AutoBarProps {
  rivalName: string
  /** Los puntos de vida de los dos (los cuentan y destellan como en el duelo: `LifeTile`). */
  life: { mine: number; theirs: number }
  /** El turno del duelo (desde 1) y si es tuyo. */
  turn: number
  myTurn: boolean
  /** La fase de quien tiene el turno; `null` antes de empezar. */
  phase: MatPhase | null
  /** La X: vuelve al lobby. */
  onExit: () => void
  /** Lo que se apoya sobre la línea del registro (el núcleo resolviendo, la cadena con «No responder»): la misma fila, sin sumar alto. */
  lane?: LaneNotice | null
  /** La línea del registro (sólo en el celular; `DuelLogTicker`). */
  log?: ReactNode
  /** «Más opciones»: el estado entra y sale por acá (la pantalla lo guarda en las preferencias). */
  sounds: boolean
  onSounds: (on: boolean) => void
  chain: AutoChainMode
  onChain: (mode: AutoChainMode) => void
  place: AutoPlaceMode
  onPlace: (mode: AutoPlaceMode) => void
  /** «Reiniciar el duelo» de «Más opciones»: el mismo duelo desde el principio (sin esto, no se ofrece). */
  onRestart?: () => void
  /** «Jugar en modo manual» de «Más opciones»: apaga el duelo automático y queda la mesa manual con el mismo deck (sin esto, no se ofrece). */
  onManual?: () => void
}

/** Un ajuste de «Más opciones» con su nombre, su línea chica y el control debajo. */
function Setting({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
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
 * La barra de arriba de «Jugar solo automático» (la ranura `duel.header` de `PracticeMat`), hermana chica de `DuelBar`, que está atada al duelo por enlace: las vidas de los dos (`LifeTile`, que las
 * cuenta, destella y sacude como en el duelo), el turno con la fase, la vista de la mesa, el engranaje con «Más opciones» (sonidos, respuestas a la cadena, la casilla y que el rival no juega) y la X
 * de salir. En el celular, la línea del registro va debajo y los avisos (`LaneBanner`) se apoyan encima de ella; en escritorio, centrados debajo de la barra; con laterales, en el izquierdo. Nada de esto
 * suma alto cuando aparece o se va: el campo no se mueve. Todo el estado entra por props.
 */
export function AutoBar({ rivalName, life, turn, myTurn, phase, onExit, lane = null, log, sounds, onSounds, chain, onChain, place, onPlace, onRestart, onManual }: AutoBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const docked = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const rails = useDuelRails()
  const laneOpen = lane !== null
  const phaseName = PHASES.find((entry) => entry.id === phase)?.name
  const whose = myTurn ? t('duel.bar.yourTurn') : t('duel.bar.theirTurn', { name: rivalName })
  const turnChip = turn > 0 ? <span data-testid="auto-turn" className="shrink-0 whitespace-nowrap rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold tabular-nums text-muted">{t('practice.mat.turn', { turn })}</span> : null

  const lives = (
    <>
      <LifeTile name={rivalName} life={life.theirs} />
      <LifeTile name={t('duel.bar.you')} label={t('duel.bar.you')} life={life.mine} mine />
    </>
  )
  const actions = (
    <>
      <MatViewToggle className={HEADER_ICON} />
      <IconButton tone="flat" size="sm" aria-label={t('duel.bar.more')} title={t('duel.bar.more')} aria-haspopup="dialog" aria-expanded={moreOpen} className={HEADER_ICON} onClick={() => setMoreOpen(true)}>
        <Icon name="gear" />
      </IconButton>
      <CloseButton tone="flat" size="sm" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className={HEADER_ICON} onClick={onExit} />
    </>
  )
  const dialogs = (
    <Modal isOpen={moreOpen} onClose={() => setMoreOpen(false)} size="keypad" title={t('duel.bar.more')}>
      <div className="grid gap-5">
        <div className="flex items-center justify-between gap-3">
          <span className="grid min-w-0 gap-0.5">
            <span className="text-body font-semibold text-foreground">{t('duel.bar.sounds')}</span>
            <span className="text-micro text-soft">{t('auto.bar.soundsHint')}</span>
          </span>
          <Switch checked={sounds} onChange={onSounds} label={t('duel.bar.sounds')} />
        </div>
        <Setting title={t('auto.bar.chain')} hint={t('auto.bar.chainHint')}>
          <Segmented label={t('auto.bar.chain')} value={chain} onChange={onChain} fullWidth options={[{ value: 'ask', label: t('auto.bar.ask') }, { value: 'never', label: t('auto.bar.never') }]} />
        </Setting>
        <Setting title={t('auto.bar.place')} hint={t('auto.bar.placeHint')}>
          <Segmented label={t('auto.bar.place')} value={place} onChange={onPlace} fullWidth options={[{ value: 'ask', label: t('auto.bar.ask') }, { value: 'auto', label: t('auto.bar.auto') }]} />
        </Setting>
        <Callout tone="neutral">{t('auto.rival.passive')}</Callout>
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

  // Con laterales (escritorio ancho), las piezas van a la grilla de la mesa como las de `DuelBar`: las vidas arriba a la izquierda y los avisos debajo; los íconos, el turno y la fase arriba a la derecha.
  if (rails) {
    return (
      <>
        <div className="col-start-1 row-start-1 flex min-w-0 flex-col items-start gap-2">{lives}</div>
        <div className="col-start-3 row-start-1 flex min-w-0 flex-col items-end gap-3">
          <span className="-mr-2 flex flex-wrap items-center justify-end">{actions}</span>
          {turnChip}
          <span className="grid justify-items-end text-right text-lead font-bold leading-tight">
            <span className={myTurn ? 'text-accent' : 'text-info-soft'}>{whose}</span>
            {phaseName ? <span data-testid="auto-phase" className="text-info">{phaseName}</span> : null}
          </span>
        </div>
        {/* El aviso, en lo que el campo agrandado deja libre del lateral (`--field-overhang`, de la mesa) y por encima del tablero (`z-20`): nunca cortado ni debajo. Con menos de 11 rem libres se apoya sobre el borde del campo. */}
        <div className="relative z-20 col-start-1 row-start-2 flex min-h-0 flex-col items-stretch gap-2 pt-4" style={RAIL_LANE_STYLE}>{lane ? <LaneBanner lane={lane} rivalName={rivalName} rail /> : null}</div>
        {dialogs}
      </>
    )
  }

  return (
    // Celular: las vidas y los íconos en una fila que no se parte, el turno en otra y la línea del registro debajo (flota: no ocupa lugar). Escritorio: una sola fila, con el turno pegado a los íconos.
    <div className="relative flex flex-wrap items-center gap-1.5 px-0.5 pt-1.5 min-[1101px]:flex-nowrap">
      <div className="flex basis-full items-center gap-1.5 max-[339px]:gap-1 min-[1101px]:contents [&>[data-lp]]:shrink min-[1101px]:[&>[data-lp]]:shrink-0">
        {/* La hamburguesa del armazón: una sola barra arriba, la de la mesa. */}
        <ShellMenuButton className="-ml-2 size-10! max-[339px]:size-8!" />
        {lives}
        <span className="-mr-2 ml-auto flex shrink-0 items-center min-[1101px]:order-3 min-[1101px]:ml-0.5 min-[1101px]:mr-0">{actions}</span>
      </div>

      <div className="order-2 flex min-w-0 basis-full items-center gap-1.5 min-[1101px]:ml-auto min-[1101px]:basis-auto">
        {turnChip}
        <span className="min-w-0 truncate text-lead font-bold">
          <span className={myTurn ? 'text-accent' : 'text-info-soft'}>{whose}</span>
          {phaseName ? <span data-testid="auto-phase" className="text-info">{` · ${phaseName}`}</span> : null}
        </span>
      </div>

      {/* Celular: la línea del registro, con el aviso encima (la misma fila); sin registro, su lugar igual queda (el primer aviso no corre nada). */}
      <div className="relative order-3 basis-full max-sm:pointer-events-none max-sm:z-20 max-sm:-mb-11 min-[1101px]:hidden">
        <div inert={laneOpen} className={cx(laneOpen && 'invisible')}>
          {log ?? <div aria-hidden="true" className="min-h-11" />}
        </div>
        {lane && !docked ? <LaneBanner lane={lane} rivalName={rivalName} /> : null}
      </div>
      {/* Escritorio: el mismo aviso, centrado debajo de la barra. */}
      {lane && docked ? (
        <div className="absolute left-1/2 top-full z-20 mt-1 h-11 w-[min(24rem,100%)] -translate-x-1/2">
          <LaneBanner lane={lane} rivalName={rivalName} />
        </div>
      ) : null}

      {dialogs}
    </div>
  )
}
