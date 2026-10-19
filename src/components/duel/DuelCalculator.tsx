import { Suspense } from 'react'

import type { Duel, DuelSnapshot } from '../../app/duel-session'
import { t } from '../../i18n'
import { LazyLifeCalculatorScreen } from '../deck-mode/lazy-steps'
import { Modal } from '../ui/Modal'

interface DuelCalculatorProps {
  isOpen: boolean
  snapshot: DuelSnapshot
  myName: string
  duel: Pick<Duel, 'changeLife' | 'halveLife' | 'toggleClock'>
  onClose: () => void
}

/**
 * La calculadora de vidas (la misma de la herramienta de Jugar) abierta encima del duelo, sin salir de él: se abre al tocar las vidas de cualquiera de los dos y usa el estado del duelo,
 * que se replica con el rival: lo que tecleás cambia tus vidas en las dos pantallas, lo que el rival cambia se ve acá en el momento, y el reloj es el de la ronda del duelo.
 * Cada uno maneja sólo sus vidas (las del rival se ven, no se eligen).
 */
export function DuelCalculator({ isOpen, snapshot, myName, duel, onClose }: DuelCalculatorProps) {
  const rivalName = snapshot.peerName ?? t('duel.bar.rival')
  const mine = myName || t('duel.bar.you')

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="screen" bare flush hideCloseButton ariaLabel={t('shell.life.title')}>
      <Suspense fallback={null}>
        <LazyLifeCalculatorScreen
          onClose={onClose}
          duel={{
            state: snapshot.life,
            me: snapshot.me,
            names: snapshot.me === 0 ? [mine, rivalName] : [rivalName, mine],
            limitMin: snapshot.settings.limitMin,
            onChange: duel.changeLife,
            onHalve: duel.halveLife,
            onToggleClock: duel.toggleClock,
          }}
        />
      </Suspense>
    </Modal>
  )
}
