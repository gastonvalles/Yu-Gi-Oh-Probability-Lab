import { useState } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { Options } from '../probability/CardSheet'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { choiceChip } from '../ui/surfaces'

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
  options: readonly AskOption[]
  /** `'one'`: un toque contesta (una opción, la posición, un número). `{ count }`: se eligen `count` (Tipos, Atributos) y «Declarar» contesta. */
  mode: 'one' | { count: number }
  /** Las elegidas, en el orden en que se eligieron. */
  onPick: (ids: string[]) => void
  /** Sólo si la pregunta se puede cancelar: lleva la X y Escape la cierra. Sin esto (las del núcleo no se cancelan), hay que contestar. */
  onCancel?: () => void
}

/** Con un texto así de largo, una opción por fila. */
const LONG_LABEL = 22

/**
 * Las opciones de una pregunta del núcleo que el campo no puede expresar, en una hoja chica (`Modal keypad`: en el celular sale de abajo, al pulgar; en escritorio, un diálogo de 26 rem). Con `'one'`, los
 * botones de la hoja de una carta (`CardSheet`: de a dos por fila, `menuitem`) y un toque contesta. Con `{ count }`, pastillas que se prenden en ámbar (`aria-pressed`) y bajan de renglón, así se ven los 25
 * Tipos a la vez (`FilterChips` exige una cuenta por chip y en el celular es una sola fila que se desliza): con `count` 1 elegir otra cambia la elegida; con más, al llegar al tope las demás se apagan.
 * Va dentro de un `Presence` (así sale al contestarse).
 */
export function AskOptions({ title, kicker, options, mode, onPick, onCancel }: AskOptionsProps) {
  const leaving = useLeaving()
  const [chosen, setChosen] = useState<string[]>([])
  const count = mode === 'one' ? 0 : mode.count
  const full = count > 0 && chosen.length >= count

  // Sin cancelar, Escape no cierra esto ni lo que haya abajo: hay que contestar.
  useEscapeKey(() => {}, !onCancel && !leaving)

  const toggle = (id: string) => setChosen((current) => (current.includes(id) ? current.filter((key) => key !== id) : count === 1 ? [id] : current.length < count ? [...current, id] : current))

  return (
    <Modal
      isOpen={!leaving}
      onClose={onCancel ?? (() => {})}
      dismissible={Boolean(onCancel)}
      size="keypad"
      kicker={kicker}
      title={title}
      ariaLabel={title}
      footer={
        mode === 'one' ? undefined : (
          <>
            <p role="status" className="m-0 mr-auto text-body tabular-nums text-muted">
              {t('auto.picker.status', { chosen: chosen.length, max: count })}
            </p>
            <Button variant="primary" size="sm" disabled={!full} onClick={() => onPick(chosen)}>
              {t('auto.options.declare')}
            </Button>
          </>
        )
      }
    >
      {mode === 'one' ? (
        <div role="menu" aria-label={title}>
          <Options items={options.map((option) => ({ label: option.label, lead: option.lead, disabled: option.disabled, onSelect: () => onPick([option.id]) }))} stacked={options.some((option) => option.label.length > LONG_LABEL)} />
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
    </Modal>
  )
}
