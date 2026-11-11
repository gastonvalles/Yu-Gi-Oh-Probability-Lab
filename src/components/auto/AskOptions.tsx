import { useId, useState } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import type { AskWhyView } from '../../app/auto/ask-why'
import { t } from '../../i18n'
import { AskWhy } from '../duel/AskWhy'
import { Options } from '../probability/CardSheet'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { choiceChip } from '../ui/surfaces'
import { AutoPanel } from './AutoPanel'
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
}

/** Con un texto así de largo, una opción por fila. */
const LONG_LABEL = 22

/**
 * Las opciones de una pregunta del núcleo que el campo no puede expresar (posición, número, Tipo/Atributo, qué efecto), en el cartel del automático (`AutoPanel`). Con `'one'`, los botones de la hoja
 * de una carta (`Options`: de a dos por fila, `menuitem`) y un toque contesta. Con `{ count }`, pastillas que se prenden en lima (`aria-pressed`) y bajan de renglón (los 25 Tipos a la vez): con
 * `count` 1 elegir otra cambia la elegida; con más, al llegar al tope las demás se apagan, y el contador va sólo con un total mayor que 1. Va dentro de un `Presence` (así sale al contestarse).
 */
export function AskOptions({ title, kicker, why, options, mode, onPick, onCancel, stacked }: AskOptionsProps) {
  const leaving = useLeaving()
  const whyId = useId()
  const [chosen, setChosen] = useState<string[]>([])
  const count = mode === 'one' ? 0 : mode.count
  const full = count > 0 && chosen.length >= count

  // Con cancelar, Escape cancela; sin él, no cierra esto ni lo que haya abajo: hay que contestar.
  useEscapeKey(onCancel ?? (() => {}), !leaving)

  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((key) => key !== id) : count === 1 ? [id] : current.length < count ? [...current, id] : current))

  return (
    <AutoPanel
      kind="options"
      label={title}
      {...(why ? { describedBy: whyId } : {})}
      focus={mode === 'one' ? '[role="menuitem"]' : '[aria-pressed]'}
      top={why ? <AskWhy id={whyId} why={why} /> : kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
      actions={
        mode === 'one' ? (
          onCancel ? (
            <Button variant="tertiary" size="sm" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
          ) : undefined
        ) : (
          <>
            <PickCount chosen={chosen.length} max={count} />
            <Button variant="primary" size="sm" className="ml-auto" disabled={!full} onClick={() => onPick(chosen)}>
              {t('auto.options.declare')}
            </Button>
          </>
        )
      }
    >
      {mode === 'one' ? (
        <div role="menu" aria-label={title}>
          <Options items={options.map((option) => ({ label: option.label, lead: option.lead, disabled: option.disabled, onSelect: () => onPick([option.id]) }))} stacked={stacked ?? options.some((option) => option.label.length > LONG_LABEL)} />
        </div>
      ) : (
        <div role="group" aria-label={title} className="flex flex-wrap gap-2">
          {options.map((option) => {
            const on = chosen.includes(option.id)

            return (
              <button key={option.id} type="button" aria-pressed={on} disabled={option.disabled || (full && !on && count > 1)} className={cx(choiceChip, 'min-h-10 px-4 text-body disabled:pointer-events-none disabled:opacity-40 pointer-coarse:min-h-11')} onClick={() => toggle(option.id)}>
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </AutoPanel>
  )
}
