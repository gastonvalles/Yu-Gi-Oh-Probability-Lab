import { Suspense } from 'react'

import { useRoundCountdownLabel } from '../../app/life-store'
import { t } from '../../i18n'
import { LazyLifeCalculatorScreen } from '../deck-mode/lazy-steps'
import { DraggableFab } from '../ui/DraggableFab'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'

/** Apilado sobre el botón de práctica (56 px) para que no se tapen cuando están los dos. */
const LIFT = 68

interface LifeCalculatorFabProps {
  /** La calculadora está abierta: el estado lo lleva la pantalla, porque también se abre desde el menú. */
  open: boolean
  onOpen: () => void
  onClose: () => void
}

/**
 * Botón flotante de la calculadora de LP: abre la calculadora encima de cualquier
 * pantalla, así en pleno duelo se cierra para leer una carta y se vuelve con un toque. Mientras
 * corre el reloj de la ronda, el botón muestra cuánto queda.
 */
export function LifeCalculatorFab({ open, onOpen, onClose }: LifeCalculatorFabProps) {
  const countdown = useRoundCountdownLabel()

  return (
    <>
      <DraggableFab
        label={countdown ? t('shell.life.fab.running', { countdown }) : t('shell.life.fab.open')}
        storageKey="ygo-lab:life-fab"
        lift={LIFT}
        onClick={onOpen}
      >
        {countdown ? (
          // Mientras corre la ronda, el botón es el reloj: sólo el tiempo, sin el corazón.
          <span className="text-[0.8125rem] font-bold leading-none tabular-nums">{countdown}</span>
        ) : (
          <Icon name="heart" size={24} strokeWidth={1.8} />
        )}
      </DraggableFab>

      <Modal isOpen={open} onClose={onClose} size="screen" bare flush hideCloseButton ariaLabel={t('shell.life.title')}>
        <Suspense fallback={null}>
          <LazyLifeCalculatorScreen onClose={onClose} />
        </Suspense>
      </Modal>
    </>
  )
}
