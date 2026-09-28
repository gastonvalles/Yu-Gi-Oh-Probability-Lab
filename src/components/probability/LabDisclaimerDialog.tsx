import { useState } from 'react'
import { createPortal } from 'react-dom'

import { useBodyScrollLock } from '../../app/use-overlay'
import { Button } from '../ui/Button'

const ACKNOWLEDGED_KEY = 'ygo-probability-lab:lab-disclaimer-ack:v1'

/** Aviso de cómo leer los %: se muestra al entrar al Lab hasta que se toca "Entendido". */
export function useLabDisclaimer() {
  const [isOpen, setIsOpen] = useState(() => !readAcknowledged())

  return {
    isOpen,
    open: () => setIsOpen(true),
    acknowledge: () => {
      writeAcknowledged()
      setIsOpen(false)
    },
  }
}

export function LabDisclaimerDialog({ isOpen, onAcknowledge }: { isOpen: boolean; onAcknowledge: () => void }) {
  useBodyScrollLock(isOpen)

  if (!isOpen) {
    return null
  }

  const dialog = (
    <div className="fixed inset-0 z-170 grid place-items-center bg-[rgb(var(--background-rgb)/0.8)] px-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lab-disclaimer-title"
        aria-describedby="lab-disclaimer-body"
        className="app-dialog-enter surface-panel grid w-full max-w-lg gap-4 p-5"
      >
        <div className="grid gap-2">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Antes de empezar</p>
          <h3 id="lab-disclaimer-title" className="m-0 text-[1.1rem] leading-tight text-(--text-main)">
            Cómo leer estos porcentajes
          </h3>
          <div id="lab-disclaimer-body" className="grid gap-2 text-[0.88rem] leading-[1.45] text-(--text-muted)">
            <p className="m-0">
              Los porcentajes que vas a ver <strong className="text-(--text-main)">no son una fuente irrefutable</strong> de
              información. Son estadísticas basadas en <strong className="text-(--text-main)">tu</strong> entendimiento del
              deck y en la categorización que le diste a cada carta de la build.
            </p>
            <p className="m-0">Los resultados pueden variar de jugador en jugador.</p>
          </div>
        </div>

        <Button variant="primary" size="md" className="justify-self-end" autoFocus onClick={onAcknowledge}>
          Entendido
        </Button>
      </div>
    </div>
  )

  if (typeof document === 'undefined') {
    return dialog
  }

  return createPortal(dialog, document.body)
}

function readAcknowledged(): boolean {
  try {
    return window.localStorage.getItem(ACKNOWLEDGED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeAcknowledged(): void {
  try {
    window.localStorage.setItem(ACKNOWLEDGED_KEY, 'true')
  } catch {
    // Sin storage el aviso vuelve a mostrarse la próxima vez: no es un problema.
  }
}
