import { Suspense } from 'react'

import { useRoundCountdownLabel } from '../../app/life-store'
import { t } from '../../i18n'
import { LazyLifeCalculatorScreen } from '../deck-mode/lazy-steps'
import { DraggableFab } from '../ui/DraggableFab'
import { Modal } from '../ui/Modal'

interface LifeCalculatorFabProps {
  /** La calculadora está abierta: el estado lo lleva la pantalla, porque también se abre desde el menú. */
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** Estás en la mesa de un duelo (jugando o mirando): ahí el reloj es el del propio duelo y el botón flotante lo duplicaría y le competiría, así que no aparece. */
  hidden?: boolean
}

/**
 * La calculadora de LP (a toda pantalla encima de la app) y, mientras corre el reloj de la ronda, un botón flotante que muestra cuánto
 * queda y vuelve a ella: sólo aparece con el reloj corriendo y la calculadora cerrada (en pleno duelo se sale a leer una carta o a mirar la
 * mesa y se vuelve con un toque). Sin reloj corriendo no hay botón: la calculadora se abre desde el menú. En la mesa de un duelo tampoco: ahí está el reloj del duelo.
 */
export function LifeCalculatorFab({ open, onOpen, onClose, hidden = false }: LifeCalculatorFabProps) {
  const countdown = useRoundCountdownLabel()

  return (
    <>
      {countdown && !open && !hidden ? (
        <DraggableFab label={t('shell.life.fab.running', { countdown })} storageKey="ygo-lab:life-fab" onClick={onOpen}>
          <span className="text-[0.8125rem] font-bold leading-none tabular-nums">{countdown}</span>
        </DraggableFab>
      ) : null}

      <Modal isOpen={open} onClose={onClose} size="screen" bare flush hideCloseButton ariaLabel={t('shell.life.title')}>
        <Suspense fallback={null}>
          <LazyLifeCalculatorScreen onClose={onClose} />
        </Suspense>
      </Modal>
    </>
  )
}
