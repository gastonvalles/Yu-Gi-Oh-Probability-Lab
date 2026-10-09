import { useEffect, useState } from 'react'

import { reactMascot, setMascotEnabled, useMascotEnabled, useMascotState, type MascotState } from '../../app/mascot'
import { useMediaQuery } from '../../app/use-media-query'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

// Las animaciones viven en public/mascot (WebP animado con transparencia); se baja sólo la del estado actual.
const ANIMATION: Record<MascotState, string> = {
  idle: '/mascot/idle.webp',
  look: '/mascot/look.webp',
  waiting: '/mascot/waiting.webp',
  running: '/mascot/running.webp',
  review: '/mascot/review.webp',
  jumping: '/mascot/jumping.webp',
  failed: '/mascot/failed.webp',
  waving: '/mascot/waving.webp',
}
/** Un cuadro quieto: para "reducir movimiento" y para el botón que la vuelve a mostrar. */
export const MASCOT_STILL = '/mascot/idle.png'
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
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'
/** En reposo, cada tanto mira alrededor un ratito. */
const LOOK_EVERY_MS = 25_000
const LOOK_FOR_MS = 4_200

/** Cupsy abajo a la izquierda: reacciona a lo que pasa en la app y se puede ocultar. */
export function Mascot() {
  const enabled = useMascotEnabled()
  const state = useMascotState()
  const reduceMotion = useMediaQuery(REDUCED_MOTION_MEDIA_QUERY)
  const [looking, setLooking] = useState(false)

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

  const shown: MascotState = state === 'idle' && looking ? 'look' : state

  return (
    <div className="pointer-events-none fixed bottom-[calc(var(--deck-mobile-step-nav-height,4.3rem)+env(safe-area-inset-bottom,0px)+0.5rem)] left-2 z-110 min-[1101px]:bottom-3 min-[1101px]:left-3">
      <div className="group relative pointer-events-auto">
        <button
          type="button"
          aria-label="Saludar a Cupsy"
          title={TITLE[shown]}
          className="block h-[4.875rem] w-[4.5rem] cursor-pointer bg-transparent p-0 transition-transform duration-150 [-webkit-tap-highlight-color:transparent] hover:scale-105 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none min-[1101px]:h-[6.5rem] min-[1101px]:w-24"
          onClick={() => reactMascot('waving', 2200)}
        >
          <img
            src={reduceMotion ? MASCOT_STILL : ANIMATION[shown]}
            alt=""
            draggable={false}
            className="h-full w-full select-none object-contain drop-shadow-[0_8px_16px_rgb(0_0_0/0.55)]"
          />
        </button>
        {/* La X aparece al pasar el mouse; en táctil está siempre. */}
        <button
          type="button"
          aria-label="Ocultar a Cupsy"
          title="Ocultar a Cupsy"
          className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-lavender text-foreground opacity-0 shadow-card transition-opacity duration-150 hover:bg-lavender-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus group-hover:opacity-100 pointer-coarse:opacity-100"
          onClick={() => setMascotEnabled(false)}
        >
          <Icon name="x" size={12} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  )
}

/** Cuando Cupsy está oculta, su cara junto a las redes la vuelve a mostrar. */
export function MascotRestoreButton({ className }: { className?: string }) {
  const enabled = useMascotEnabled()

  if (enabled) {
    return null
  }

  return (
    <button
      type="button"
      aria-label="Mostrar a Cupsy"
      title="Mostrar a Cupsy"
      className={cx(
        'grid size-9 place-items-center rounded-control transition-colors duration-150 hover:bg-tint/10 focus-visible:outline-none focus-visible:shadow-focus',
        className,
      )}
      onClick={() => setMascotEnabled(true)}
    >
      <img src={MASCOT_STILL} alt="" draggable={false} className="size-7 object-contain opacity-80" />
    </button>
  )
}
