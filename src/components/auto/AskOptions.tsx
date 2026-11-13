import { useId, useState } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import type { AskWhyView } from '../../app/auto/ask-why'
import { POSITION } from '../../app/auto/protocol'
import type { CardFrame } from '../../app/card-frame'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { AskWhy } from '../duel/AskWhy'
import { Options } from '../probability/CardSheet'
import { CARD_BACK } from '../probability/practice-styles'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { choiceChip } from '../ui/surfaces'
import { AutoPanel, PANEL_PRIMARY } from './AutoPanel'
import { PickCount } from './CardPicker'

/** Una opción del núcleo: un texto, una posición, un número, un Tipo o un Atributo. */
export interface AskOption {
  id: string
  label: string
  /** Una línea chica arriba (el número del efecto). */
  lead?: string
  /** Se ve, pero no se elige (se enfoca y se lee). */
  disabled?: boolean
}

interface AskOptionsProps {
  /** Lo que pide el núcleo (el `HINT_SELECTMSG`), o «Elegí la posición», «Declará 1 Tipo». */
  title: string
  /** Arriba del título: la carta que pregunta. */
  kicker?: string
  /** De qué carta es y si es su costo o su efecto (`AskWhy`): va en lugar de `kicker`. */
  why?: AskWhyView | null
  options: readonly AskOption[]
  /** `'one'`: un toque contesta (una opción, la posición, un número). `{ count }`: se eligen `count` (Tipos, Atributos) y «Declarar» contesta. */
  mode: 'one' | { count: number }
  /** Las elegidas, en el orden en que se eligieron. */
  onPick: (ids: string[]) => void
  /** Sólo si se puede cancelar (el segundo paso de «Activar efecto», que todavía no contestó nada): «Cancelar» abajo y Escape. Sin esto (las del núcleo no se cancelan), hay que contestar. */
  onCancel?: () => void
  /** Con `'one'`: una opción por fila, a la izquierda (la lista de efectos, como en la mesa manual). Sin esto, de a una por fila sólo si algún texto es largo. */
  stacked?: boolean
  /** Qué se pregunta (`ask-ui`: `position`, `number`…): la posición va con dos dibujos (M-05). */
  of?: string
  /** La carta de la que se habla (la posición: la que se coloca): cada opción la muestra parada, acostada o con el dorso. Sin arte, el color de su tipo (`frame`). */
  card?: { name: string; art: string | null; frame?: CardFrame }
  /** Sólo el catálogo lo fuerza (la ventana en su marco); en la mesa, según el ancho. */
  variant?: 'floating'
}

/**
 * Una posición (`select_position`: el valor de `POSITION`) **es la carta** (Gastón, 2026-11-12: «la idea es que aparezca la carta en ataque o en defensa»): parada (ataque) o acostada (defensa),
 * boca arriba con su arte (sin arte, el color de su tipo) o con el dorso. Cada una en una caja cuadrada del alto de una carta parada, así la acostada mide lo mismo y los rótulos quedan a la misma
 * altura. El ancho de la carta (`--pos-w`) es el de la ventana (`--desk-card`), sin pasar dos cajas por renglón.
 */
function PositionCard({ value, card }: { value: number; card?: AskOptionsProps['card'] }) {
  const down = (value & POSITION.FACEDOWN) !== 0
  const defense = (value & (POSITION.FACEUP_DEFENSE | POSITION.FACEDOWN_DEFENSE)) !== 0

  return (
    <span aria-hidden="true" data-position-drawing={defense ? 'defense' : 'attack'} data-face={down ? 'down' : 'up'} className="grid size-[calc(var(--pos-w)*614/421)] place-items-center">
      <span className={cx('relative block aspect-[421/614] w-(--pos-w) overflow-hidden bg-input', defense && 'rotate-90')}>
        {down ? <span className={CARD_BACK} /> : <CardArt remoteUrl={card?.art ?? null} name={card?.name ?? ''} {...(card?.frame ? { frame: card.frame } : {})} className="block h-full w-full object-cover" />}
      </span>
    </span>
  )
}

/** Con un texto así de largo, una opción por fila. */
const LONG_LABEL = 22

/**
 * Las opciones de una pregunta del núcleo que el campo no puede expresar (posición, número, Tipo/Atributo, qué efecto), en el cartel del automático (`AutoPanel`). Con `'one'`, los botones de la hoja
 * de una carta (`Options`: de a dos por fila, `menuitem`) y un toque contesta. Con `{ count }`, pastillas que se prenden en lima (`aria-pressed`) y bajan de renglón (los 25 Tipos a la vez): con
 * `count` 1 elegir otra cambia la elegida; con más, al llegar al tope las demás se apagan, y el contador va sólo con un total mayor que 1. Va dentro de un `Presence` (así sale al contestarse).
 */
export function AskOptions({ title, kicker, why, options, mode, onPick, onCancel, stacked, of, card, variant }: AskOptionsProps) {
  const leaving = useLeaving()
  const whyId = useId()
  const [chosen, setChosen] = useState<string[]>([])
  const count = mode === 'one' ? 0 : mode.count
  const full = count > 0 && chosen.length >= count

  // Con cancelar, Escape cancela; sin él, no cierra esto ni lo que haya abajo: hay que contestar.
  useEscapeKey(onCancel ?? (() => {}), !leaving)

  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((key) => key !== id) : count === 1 ? [id] : current.length < count ? [...current, id] : current))

  // M-05: cada posición es la carta (parada, acostada o con el dorso), lado a lado y al medio; tocar una contesta, sin confirmar. Con tres o cuatro, de a dos por renglón si no entran.
  const position = mode === 'one' && of === 'position'
  const button = (option: AskOption) => (
    <Button
      key={option.id}
      role="menuitem"
      variant="tertiary"
      aria-label={card ? `${option.label} · ${card.name}` : option.label}
      aria-disabled={option.disabled || undefined}
      className={cx('h-auto flex-col gap-1 px-1! py-1! hover:outline-2 hover:outline-info/60 focus-visible:outline-2 focus-visible:outline-info', option.disabled && 'cursor-default opacity-40')}
      onClick={option.disabled ? undefined : () => onPick([option.id])}
    >
      <PositionCard value={Number(option.id)} card={card} />
      {/* Del ancho de su caja (en dos renglones si es largo): todas las opciones miden lo mismo y quedan parejas. */}
      <span className="w-[calc(var(--pos-w)*614/421)] whitespace-normal! text-center">{option.label}</span>
    </Button>
  )
  const positions = (
    <div
      role="menu"
      aria-label={title}
      data-positions=""
      className="flex w-full min-w-0 flex-wrap items-start justify-center gap-3 [--pos-w:min(var(--desk-card,4.5rem),calc((100cqw_-_4.5rem)/2*421/614))]"
    >
      {options.map(button)}
    </div>
  )

  return (
    <AutoPanel
      kind="options"
      variant={variant}
      label={title}
      {...(why ? { describedBy: whyId } : {})}
      focus={mode === 'one' ? '[role="menuitem"]' : '[aria-pressed]'}
      top={why ? <AskWhy id={whyId} why={why} /> : kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
      actions={
        mode === 'one' ? (
          onCancel ? (
            <Button variant="tertiary" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          ) : undefined
        ) : (
          <Button variant="primary" className={cx(PANEL_PRIMARY, 'ml-auto')} disabled={!full} onClick={() => onPick(chosen)}>
            {t('auto.options.declare')}
          </Button>
        )
      }
      {...(mode === 'one' ? {} : { aside: <PickCount chosen={chosen.length} max={count} /> })}
    >
      {position ? (
        positions
      ) : mode === 'one' ? (
        <div role="menu" aria-label={title}>
          <Options items={options.map((option) => ({ label: option.label, lead: option.lead, disabled: option.disabled, onSelect: () => onPick([option.id]) }))} stacked={stacked ?? options.some((option) => option.label.length > LONG_LABEL)} />
        </div>
      ) : (
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {options.map((option) => {
            const on = chosen.includes(option.id)

            return (
              <button key={option.id} type="button" aria-pressed={on} disabled={option.disabled || (full && !on && count > 1)} className={cx(choiceChip, 'min-h-11 whitespace-nowrap px-4 text-body disabled:pointer-events-none disabled:opacity-40')} onClick={() => toggle(option.id)}>
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </AutoPanel>
  )
}
