import { useEffect, useId, useRef, useState } from 'react'

import { MASCOTS, currentMascotId, reactMascot, restMascot, selectMascot, useCurrentMascot, useMascotEnabled, type MascotId } from '../../app/mascot'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { CloseButton } from '../ui/IconButton'
import { overline } from '../ui/typography'

/** Un cuadro quieto de cada mascota, para la lista. */
const STILL = 'idle.png'

/**
 * El Kuriboh alado (vectorizado de la imagen de referencia en public/mascot/kuriboh.svg) es la caja de
 * las mascotas: al tocarlo se despliegan las que hay y elegir una la saca (o la trae de vuelta si estaba descansando).
 */
export function MascotPicker({ placement, className }: { placement: 'above' | 'below'; className?: string }) {
  const [open, setOpen] = useState(false)
  const enabled = useMascotEnabled()
  const current = useCurrentMascot()
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const summon = (id: MascotId) => {
    const alreadyOut = enabled && currentMascotId() === id

    selectMascot(id)

    if (!alreadyOut) {
      reactMascot('waving', 2600)
    }

    setOpen(false)
  }

  return (
    <div ref={rootRef} className={cx('relative', className)}>
      <button
        type="button"
        aria-label={t('shell.mascot.title')}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        title={t('shell.mascot.title')}
        className="grid h-9 w-12 place-items-center rounded-control transition-colors duration-150 hover:bg-tint/10 focus-visible:outline-none focus-visible:shadow-focus"
        onClick={() => setOpen((value) => !value)}
      >
        <img src="/mascot/kuriboh.svg" alt="" draggable={false} className="w-10 select-none" />
      </button>

      {open ? (
        <div
          id={listId}
          role="group"
          aria-label={t('shell.mascot.available')}
          className={cx(
            'absolute z-130 grid w-60 gap-1 rounded-card text-left border border-border-subtle bg-surface-raised p-2 shadow-overlay animate-dialog-enter motion-reduce:animate-none',
            placement === 'above' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'right-0 top-full mt-2',
          )}
        >
          <span className={cx('px-2 pt-1', overline)}>{t('shell.mascot.title')}</span>
          {(Object.entries(MASCOTS) as [MascotId, (typeof MASCOTS)[MascotId]][]).map(([id, mascot]) => {
            const isCurrent = id === current.id

            return (
              <div key={id} className="flex items-center rounded-control pr-1 transition-colors duration-150 hover:bg-tint/8">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-control px-2 py-1.5 text-left focus-visible:outline-none focus-visible:shadow-focus"
                  onClick={() => summon(id)}
                >
                  <img src={`${mascot.folder}/${STILL}`} alt="" draggable={false} className="size-12 shrink-0 object-contain" />
                  <span className="grid min-w-0 gap-0.5">
                    <strong className="truncate text-body font-semibold text-foreground">{mascot.name}</strong>
                    <span className="text-micro text-muted">{isCurrent ? (enabled ? t('shell.mascot.out') : t('shell.mascot.resting')) : t('shell.mascot.summon')}</span>
                  </span>
                </button>
                {/* La que está afuera se puede mandar a descansar desde acá (en el celular no hay otra X). */}
                {isCurrent && enabled ? (
                  <CloseButton
                    size="sm"
                    aria-label={t('shell.mascot.rest', { name: mascot.name })}
                    title={t('shell.mascot.rest', { name: mascot.name })}
                    onClick={() => {
                      restMascot()
                      setOpen(false)
                    }}
                  />
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
