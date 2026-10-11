import { useEffect, useRef, useState } from 'react'

import { reactMascot, setMascotEnabled, useCurrentMascot, useMascotEnabled, useMascotState, type MascotState } from '../../app/mascot'
import { useDraggablePosition } from '../../app/use-draggable-position'
import { useHold } from '../../app/use-hold'
import { useMediaQuery } from '../../app/use-media-query'
import { useToastMessage } from '../../app/use-toast-message'
import { ConfirmDialog } from '../probability/ConfirmDialog'
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
/** Un cuadro quieto: para "reducir movimiento". */
const STILL = 'idle.png'
const TITLE: Record<MascotState, (name: string) => string> = {
  idle: (name) => name,
  look: (name) => `${name} mira alrededor`,
  waiting: (name) => `${name} espera que termine de cargar`,
  running: (name) => `${name} está calculando`,
  review: (name) => `${name} revisa la clasificación`,
  jumping: (name) => `${name} festeja`,
  failed: (name) => `A ${name} no le gustó`,
  waving: (name) => `${name} saluda`,
}
const GREETED_KEY = 'ygo-lab:mascot-greeted'
const POSITION_KEY = 'ygo-lab:mascot-position'
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'
/** Alto del cuadro en pantalla (el ancho es un poco menor): es lo que se usa para que no se salga de la pantalla ni choque con los botones. */
const SIZE_DESKTOP = 104
const SIZE_MOBILE = 96
/** Cuánto hay que dejarla apretada, sin moverla, para que pregunte si querés darle un descanso. */
const HOLD_TO_REST_MS = 5000
/** En reposo, cada tanto mira alrededor un ratito. */
const LOOK_EVERY_MS = 25_000
const LOOK_FOR_MS = 4_200

/** La mascota sólo existe mientras está afuera: descansando no ocupa lugar ni empuja a los botones flotantes. */
export function Mascot() {
  return useMascotEnabled() ? <ActiveMascot /> : null
}

/** Se puede agarrar y llevar a cualquier lado (como el botón de práctica), choca con los botones flotantes y los empuja, y reacciona a lo que pasa. */
function ActiveMascot() {
  const mascot = useCurrentMascot()
  const state = useMascotState()
  const reduceMotion = useMediaQuery(REDUCED_MOTION_MEDIA_QUERY)
  const isMobile = useMediaQuery('(max-width: 1100px)')
  const { showToast } = useToastMessage()
  const { position, dragging, handlers, consumeDragClick } = useDraggablePosition({
    storageKey: POSITION_KEY,
    size: isMobile ? SIZE_MOBILE : SIZE_DESKTOP,
    corner: 'left',
    group: 'fab',
  })
  const [looking, setLooking] = useState(false)
  const [restAsked, setRestAsked] = useState(false)
  // Al soltarla rebota un poco: la animación se enciende cuando termina un arrastre y se apaga sola al terminar.
  const [dropping, setDropping] = useState(false)
  const wasDraggingRef = useRef(false)
  const heldRef = useRef(false)
  const hold = useHold(() => {
    heldRef.current = true
    setRestAsked(true)
  }, HOLD_TO_REST_MS)

  useEffect(() => {
    if (wasDraggingRef.current && !dragging) {
      setDropping(true)
    }

    if (dragging) {
      // Si se la lleva a otro lado, ya no es un "mantener apretada".
      hold.stop()
    }

    wasDraggingRef.current = dragging
  }, [dragging, hold])

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

  const rest = () => {
    setRestAsked(false)
    setMascotEnabled(false)
    showToast(`${mascot.name} se fue a descansar. Para que vuelva, tocá el botón de mascotas junto a las redes.`, 'info')
  }

  // Agarrada va saltando; si no, lo que marque el estado (y en reposo, a veces, mirando alrededor).
  const shown: MascotState = dragging ? 'jumping' : state === 'idle' && looking ? 'look' : state

  return (
    <div className="fixed left-0 top-0 z-110" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
      <div className="group relative">
        <button
          type="button"
          aria-label={`Saludar a ${mascot.name}`}
          title={dragging ? 'Soltala donde quieras' : `${TITLE[shown](mascot.name)} (arrastrala para moverla)`}
          className="block h-24 w-[5.5rem] cursor-grab touch-none select-none bg-transparent p-0 [-webkit-tap-highlight-color:transparent] focus-visible:outline-none focus-visible:shadow-focus data-[dragging=true]:cursor-grabbing min-[1101px]:h-[6.5rem] min-[1101px]:w-24"
          data-dragging={dragging ? 'true' : 'false'}
          {...handlers}
          onPointerDown={(event) => {
            handlers.onPointerDown(event)

            if (event.button === 0) {
              heldRef.current = false
              hold.start()
            }
          }}
          onPointerUp={(event) => {
            hold.stop()
            handlers.onPointerUp(event)
          }}
          onPointerCancel={(event) => {
            hold.stop()
            handlers.onPointerCancel(event)
          }}
          // El menú del sistema que sale al dejar apretado taparía el aviso de descanso.
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => {
            // Después de dejarla apretada no vale como toque: ya se abrió la pregunta.
            if (heldRef.current) {
              heldRef.current = false
              event.preventDefault()
              return
            }

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
        {/* En escritorio la X aparece al pasar el mouse; en el celular no hay X: se la deja descansar manteniéndola apretada. */}
        <button
          type="button"
          aria-label={`Ocultar a ${mascot.name}`}
          title={`Ocultar a ${mascot.name}`}
          className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-lavender text-foreground opacity-0 shadow-card transition-opacity duration-150 hover:bg-lavender-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus group-hover:opacity-100 max-[1100px]:hidden"
          onClick={rest}
        >
          <Icon name="x" size={12} strokeWidth={2.2} />
        </button>
      </div>

      <ConfirmDialog
        isOpen={restAsked}
        title={`¿Darle un descanso a ${mascot.name}?`}
        description={`${mascot.name} se va a descansar y deja la pantalla libre. Podés traerla de vuelta cuando quieras desde el botón de mascotas, junto a las redes.`}
        confirmLabel="Darle un descanso"
        cancelLabel="Seguir jugando"
        onCancel={() => setRestAsked(false)}
        onConfirm={rest}
      />
    </div>
  )
}
