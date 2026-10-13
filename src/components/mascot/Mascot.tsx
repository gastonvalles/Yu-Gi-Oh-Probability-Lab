import { useEffect, useRef, useState } from 'react'

import { MASCOTS, MASCOT_ANIMATION, MASCOT_STILL, mascotPositionKey, reactMascot, restMascot, useActiveMascots, useMascotState, type MascotId, type MascotState } from '../../app/mascot'
import { forgetMascotBody, reportMascotBody } from '../../app/mascot-interplay'
import { useDraggablePosition } from '../../app/use-draggable-position'
import { useHold } from '../../app/use-hold'
import { useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

/** Lo que dice la mascota de cada estado (en reposo, sólo su nombre). */
const TITLE_KEY = {
  look: 'shell.mascot.state.look',
  waiting: 'shell.mascot.state.waiting',
  running: 'shell.mascot.state.running',
  review: 'shell.mascot.state.review',
  jumping: 'shell.mascot.state.jumping',
  failed: 'shell.mascot.state.failed',
  waving: 'shell.mascot.state.waving',
} as const

function stateTitle(state: MascotState, name: string): string {
  return state === 'idle' ? name : t(TITLE_KEY[state], { name })
}
const GREETED_KEY = 'ygo-lab:mascot-greeted'
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'
/** Alto del cuadro en pantalla (el ancho es un poco menor): es lo que se usa para que no se salga de la pantalla ni choque con los botones. */
const SIZE_DESKTOP = 104
const SIZE_MOBILE = 96
/** Cuánto hay que dejarla apretada, sin moverla, para que pregunte si querés darle un descanso. */
const HOLD_TO_REST_MS = 5000
/** En reposo, cada tanto mira alrededor un ratito. */
const LOOK_EVERY_MS = 25_000
const LOOK_FOR_MS = 4_200

/** Las mascotas sólo existen mientras están afuera: descansando no ocupan lugar ni empujan a los botones flotantes. */
export function Mascot() {
  const ids = useActiveMascots()

  return (
    <>
      {ids.map((id, slot) => (
        <ActiveMascot key={id} id={id} slot={slot} />
      ))}
    </>
  )
}

/**
 * Cada una se puede agarrar y dejar en cualquier lugar de la pantalla, choca con los botones flotantes y con las otras mascotas
 * y las empuja, reacciona a lo que pasa y, cuando se juntan con otra, se saluda (ver `mascot-interplay`). `slot` es su lugar en la fila:
 * si nunca la movieron, arranca al lado de las que salieron antes, no encima.
 */
function ActiveMascot({ id, slot }: { id: MascotId; slot: number }) {
  const mascot = { id, ...MASCOTS[id] }
  const state = useMascotState(id)
  const reduceMotion = useMediaQuery(REDUCED_MOTION_MEDIA_QUERY)
  const isMobile = useMediaQuery('(max-width: 1100px)')
  const size = isMobile ? SIZE_MOBILE : SIZE_DESKTOP
  const { position, dragging, handlers, consumeDragClick } = useDraggablePosition({
    storageKey: mascotPositionKey(id),
    size,
    corner: 'left',
    slide: slot * (size + 8),
    group: 'fab',
    // Se las puede dejar en cualquier lugar de la pantalla (también sobre el menú y el pie), sin que se peguen al borde.
    anywhere: true,
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

  // Cada una avisa dónde está (y si la están arrastrando): con eso se saludan al juntarse y se enojan si las empujan.
  useEffect(() => {
    reportMascotBody(id, { x: position.x, y: position.y, size, dragging })
  }, [id, position.x, position.y, size, dragging])

  useEffect(() => () => forgetMascotBody(id), [id])

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
    }, LOOK_EVERY_MS + slot * 7000)

    return () => {
      clearInterval(interval)

      if (lookTimer) {
        clearTimeout(lookTimer)
      }
    }
  }, [state, slot])

  const rest = () => {
    setRestAsked(false)
    restMascot(id)
  }

  // Agarrada va saltando; si no, lo que marque el estado (y en reposo, a veces, mirando alrededor).
  const shown: MascotState = dragging ? 'jumping' : state === 'idle' && looking ? 'look' : state

  return (
    // Se corre con la misma curva que el menú lateral (si el menú se abre o se contrae, la mascota lo acompaña); agarrada, sigue al puntero sin demora.
    <div
      className={cx('fixed left-0 top-0 z-110', !dragging && 'transition-transform duration-(--sidebar-duration) ease-(--sidebar-ease) motion-reduce:transition-none')}
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <div className="group relative">
        <button
          type="button"
          aria-label={t('shell.mascot.greet', { name: mascot.name })}
          title={dragging ? t('shell.mascot.dropHint') : t('shell.mascot.dragHint', { title: stateTitle(shown, mascot.name) })}
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

            reactMascot('waving', 2200, id)
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
              src={`${mascot.folder}/${reduceMotion ? MASCOT_STILL : MASCOT_ANIMATION[shown]}`}
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
          aria-label={t('shell.mascot.hide', { name: mascot.name })}
          title={t('shell.mascot.hide', { name: mascot.name })}
          className="absolute -right-1 -top-1 grid size-6 place-items-center rounded-full bg-lavender text-foreground opacity-0 shadow-card transition-opacity duration-150 hover:bg-lavender-hover focus-visible:opacity-100 focus-visible:outline-none focus-visible:shadow-focus group-hover:opacity-100 max-[1100px]:hidden"
          onClick={rest}
        >
          <Icon name="x" size={12} strokeWidth={2.2} />
        </button>
      </div>

      <ConfirmDialog
        isOpen={restAsked}
        title={t('shell.mascot.restDialog.title', { name: mascot.name })}
        description={t('shell.mascot.restDialog.description', { name: mascot.name })}
        confirmLabel={t('shell.mascot.restDialog.confirm')}
        cancelLabel={t('shell.mascot.restDialog.cancel')}
        onCancel={() => setRestAsked(false)}
        onConfirm={rest}
      />
    </div>
  )
}
