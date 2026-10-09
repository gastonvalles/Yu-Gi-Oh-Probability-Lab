import { useEffect, useRef, useState } from 'react'

import { currentMascot, reactMascot, setMascotEnabled, useMascotEnabled, useMascotState, type MascotState } from '../../app/mascot'
import { useDraggablePosition } from '../../app/use-draggable-position'
import { useMediaQuery } from '../../app/use-media-query'
import { useToastMessage } from '../../app/use-toast-message'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

// Cada estado es un WebP animado con transparencia dentro de la carpeta de la mascota; se baja sólo el actual.
const ANIMATION: Record<MascotState, string> = {
  idle: 'idle.webp',
  look: 'look.webp',
  waiting: 'waiting.webp',
  running: 'running.webp',
  review: 'review.webp',
  jumping: 'jumping.webp',
  failed: 'failed.webp',
  waving: 'waving.webp',
}
/** Un cuadro quieto: para "reducir movimiento" y para el botón que la vuelve a mostrar. */
const STILL = 'idle.png'
const TITLE: Record<MascotState, string> = {
  idle: 'Cupsy',
  look: 'Cupsy mira alrededor',
  waiting: 'Cupsy espera que termine de cargar',
  running: 'Cupsy está calculando',
  review: 'Cupsy revisa la clasificación',
  jumping: 'Cupsy festeja',
  failed: 'A Cupsy no le gustó',
  waving: 'Cupsy saluda',
}
const GREETED_KEY = 'ygo-lab:mascot-greeted'
const POSITION_KEY = 'ygo-lab:mascot-position'
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'
/** Alto del cuadro en pantalla (el ancho es un poco menor): es lo que se usa para que no se salga de la pantalla. */
const SIZE_DESKTOP = 104
const SIZE_MOBILE = 78
/** En reposo, cada tanto mira alrededor un ratito. */
const LOOK_EVERY_MS = 25_000
const LOOK_FOR_MS = 4_200

/** Cupsy: se puede agarrar y llevar a cualquier lado (como el botón de práctica), reacciona a lo que pasa y se puede ocultar. */
export function Mascot() {
  const mascot = currentMascot()
  const enabled = useMascotEnabled()
  const state = useMascotState()
  const reduceMotion = useMediaQuery(REDUCED_MOTION_MEDIA_QUERY)
  const isMobile = useMediaQuery('(max-width: 1100px)')
  const { showToast } = useToastMessage()
  const { position, dragging, handlers, consumeDragClick } = useDraggablePosition({
    storageKey: POSITION_KEY,
    size: isMobile ? SIZE_MOBILE : SIZE_DESKTOP,
    corner: 'left',
  })
  const [looking, setLooking] = useState(false)
  // Al soltarla rebota un poco: la animación se enciende cuando termina un arrastre y se apaga sola al terminar.
  const [dropping, setDropping] = useState(false)
  const wasDraggingRef = useRef(false)

  useEffect(() => {
    if (wasDraggingRef.current && !dragging) {
      setDropping(true)
    }

    wasDraggingRef.current = dragging
  }, [dragging])

  // Saluda la primera vez que alguien abre la app.
  useEffect(() => {
    try {
      if (localStorage.getItem(GREETED_KEY)) {
        return
      }

      localStorage.setItem(GREETED_KEY, '1')
    } catch {
      return
    }

    reactMascot('waving', 3000)
  }, [])

  useEffect(() => {
    if (state !== 'idle') {
      setLooking(false)
      return
    }

    let lookTimer: ReturnType<typeof setTimeout> | null = null
    const interval = setInterval(() => {
      setLooking(true)
      lookTimer = setTimeout(() => setLooking(false), LOOK_FOR_MS)
    }, LOOK_EVERY_MS)

    return () => {
      clearInterval(interval)

      if (lookTimer) {
        clearTimeout(lookTimer)
      }
    }
  }, [state])

  if (!enabled) {
    return null
  }

  // Agarrada va saltando; si no, lo que marque el estado (y en reposo, a veces, mirando alrededor).
  const shown: MascotState = dragging ? 'jumping' : state === 'idle' && looking ? 'look' : state

  return (
    <div className="fixed left-0 top-0 z-110" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
      <div className="group relative">
        <button
          type="button"
          aria-label="Saludar a Cupsy"
          title={dragging ? 'Soltala donde quieras' : `${TITLE[shown]} (arrastrala para moverla)`}
          className="block h-[4.875rem] w-[4.5rem] cursor-grab touch-none select-none bg-transparent p-0 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:shadow-focus data-[dragging=true]:cursor-grabbing min-[1101px]:h-[6.5rem] min-[1101px]:w-24"
          data-dragging={dragging ? 'true' : 'false'}
          {...handlers}
          onClick={(event) => {
            if (consumeDragClick()) {
              event.preventDefault()
              return
            }

            reactMascot('waving', 2200)
          }}
        >
          {/* Al agarrarla se agranda y se ladea; al soltarla, rebota. */}
          <div
            className={cx(
              'h-full w-full transition-transform duration-150 ease-out motion-reduce:transition-none',
              dragging && 'scale-110 -rotate-6',
              dropping && 'animate-mascot-drop motion-reduce:animate-none',
            )}
            onAnimationEnd={() => setDropping(false)}
          >
            <img
              src={`${mascot.folder}/${reduceMotion ? STILL : ANIMATION[shown]}`}
              alt=""
              draggable={false}
              className={cx(
                'h-full w-full select-none object-contain transition-[filter] duration-150',
                dragging ? 'drop-shadow-[0_18px_22px_rgb(0_0_0/0.6)]' : 'drop-shadow-[0_8px_16px_rgb(0_0_0/0.55)]',
              )}
            />
          </div>
        </button>
        {/* La X aparece al pasar el mouse; en táctil está siempre. */}
        <button
          type="button"
          aria-label={`Ocultar a ${mascot.name}`}
          title={`Ocultar a ${mascot.name}`}
          className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-lavender text-foreground opacity-0 shadow-card transition-opacity duration-150 hover:bg-lavender-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus group-hover:opacity-100 pointer-coarse:opacity-100"
          onClick={() => {
            setMascotEnabled(false)
            showToast(`${mascot.name} se fue. Para que vuelva, tocá su cara al lado de las redes.`, 'info')
          }}
        >
          <Icon name="x" size={12} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}

/** Cuando la mascota está oculta, su cara junto a las redes la vuelve a mostrar. */
export function MascotRestoreButton({ className }: { className?: string }) {
  const enabled = useMascotEnabled()
  const mascot = currentMascot()

  if (enabled) {
    return null
  }

  return (
    <button
      type="button"
      aria-label={`Mostrar a ${mascot.name}`}
      title={`Mostrar a ${mascot.name}`}
      className={cx(
        'grid size-9 place-items-center rounded-control transition-colors duration-150 hover:bg-tint/10 focus-visible:outline-none focus-visible:shadow-focus',
        className,
      )}
      onClick={() => setMascotEnabled(true)}
    >
      <img src={`${mascot.folder}/${STILL}`} alt="" draggable={false} className="size-7 object-contain opacity-80" />
    </button>
  )
}
