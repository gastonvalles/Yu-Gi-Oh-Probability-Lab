import { useRoundCountdownLabel } from '../../app/life-store'
import { t } from '../../i18n'
import { DraggableFab } from '../ui/DraggableFab'

interface LifeCalculatorFabProps {
  /** Lleva a la calculadora (una vista de la app). */
  onOpen: () => void
  /** Estás en la calculadora o en la mesa de un duelo (jugando o mirando): ahí el reloj está a la vista (el propio o el del duelo) y el botón flotante lo duplicaría y le competiría, así que no aparece. */
  hidden?: boolean
}

/**
 * Mientras corre el reloj de la ronda, un botón flotante que muestra cuánto queda y lleva a la calculadora (una vista de la app, `#life`): sólo aparece con el reloj corriendo y fuera
 * de ella (se sale a leer una carta o a mirar la mesa y se vuelve con un toque). Sin reloj corriendo no hay botón: la calculadora se abre desde el menú. En la mesa de un duelo tampoco: ahí está el reloj del duelo.
 */
export function LifeCalculatorFab({ onOpen, hidden = false }: LifeCalculatorFabProps) {
  const countdown = useRoundCountdownLabel()

  return countdown && !hidden ? (
    <DraggableFab label={t('shell.life.fab.running', { countdown })} storageKey="ygo-lab:life-fab" onClick={onOpen}>
      <span className="text-[0.8125rem] font-bold leading-none tabular-nums">{countdown}</span>
    </DraggableFab>
  ) : null
}
