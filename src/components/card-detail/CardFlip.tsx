import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'

import { t } from '../../i18n'
import { CARD_BACK, CARD_BACK_HD_URL } from '../probability/practice-styles'
import { CardGlare, levelOut } from './card-tilt'

/** Cuánto hay que arrastrar la carta, en partes de su ancho (o de su alto), para darla vuelta entera (medio giro por cada 0,8). */
const SPAN = 0.8
/** Un tirón corto y rápido (más de 36 px a más de 0,6 px/ms) la da vuelta aunque no llegue a la mitad. */
const FLICK_PX = 36
const FLICK_SPEED = 0.6
/** Lo que hay que arrastrar antes de que cuente como el gesto (y no como un toque). */
const START_PX = 10
/**
 * La perspectiva del giro (px), propia de la carta (`perspective()` dentro del mismo `transform`): grande, para que al inclinarse la parte que se acerca a la cámara no se agrande de más (con 900 px la carta a 45° crecía
 * un 80 % y se cortaba contra el borde de su marco; con 3000, de canto, el borde cercano crece un 10 %).
 */
const FLIP_PERSPECTIVE = 3000
const flipTransform = (xDegrees: number, yDegrees: number) => `perspective(${FLIP_PERSPECTIVE}px) rotateX(${xDegrees}deg) rotateY(${yDegrees}deg)`
/** Cuántas veces se avisa del gesto con una pista (después ya se sabe). */
const HINT_TIMES = 3
const HINT_KEY = 'ygo-lab:rotate-hint'

/** Los medios giros (de 180°) que lleva la carta sobre cada eje: `x` de arriba abajo, `y` de costado. Si suman un número impar se ve el dorso. */
export interface FlipTurns {
  x: number
  y: number
}

const FRONT: FlipTurns = { x: 0, y: 0 }

interface Drag {
  id: number
  x: number
  y: number
  at: number
  width: number
  height: number
  active: boolean
  /** Cuánto giró en lo que va del gesto (grados): `x` al arrastrar hacia abajo (la parte de arriba viene hacia vos), `y` hacia la derecha. */
  angle: { x: number; y: number }
}

/** El medio giro más cercano a `angle` (grados) o, si fue un tirón rápido, uno en la dirección en que iba. */
function settle(angle: number, delta: number, elapsed: number, dominant: boolean): number {
  const near = Math.round(angle / 180)

  if (near !== 0 || !dominant) {
    return near
  }

  return Math.abs(delta) >= FLICK_PX && Math.abs(delta) / elapsed >= FLICK_SPEED ? Math.sign(delta) : 0
}

/**
 * Girar la carta grande con un gesto, sin botón (Gastón, 2026-10-19: «para dar vuelta la carta debo hacer un gesto» y «quiero poder girar la carta en todas las direcciones»): **arrastrarla** (con el dedo o con el mouse) hacia
 * donde sea la gira en 3D siguiendo el movimiento —de costado sobre su eje vertical, de arriba abajo sobre el horizontal, o las dos cosas en una diagonal— y al soltar termina en el medio giro más cercano de cada eje (o hacia donde
 * iba, si fue un tirón rápido); la **tecla F** la da vuelta de costado desde el teclado. Devuelve los giros dados (`FlipTurns`) y `flipperRef` para el elemento que gira (`CardFlip`) y los eventos del elemento que se arrastra
 * (se suman a los suyos; ése tiene que llevar `touch-none`: el dedo no desplaza la pantalla sobre la carta); `consumeClick` dice si el clic que sigue a un arrastre hay que ignorarlo (no es un toque).
 */
export function useCardFlip() {
  const [turns, setTurns] = useState<FlipTurns>(FRONT)
  // El dorso en alta se baja recién cuando la carta se empieza a dar vuelta (pesa ~220 KB): hasta entonces alcanza el de YGOPRODeck, que ya está en la mesa.
  const [backNeeded, setBackNeeded] = useState(false)
  const flipperRef = useRef<HTMLDivElement | null>(null)
  const turnsRef = useRef(FRONT)
  const dragRef = useRef<Drag | null>(null)
  const draggedRef = useRef(false)

  useEffect(() => {
    turnsRef.current = turns
  }, [turns])

  const finish = useCallback((event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
    const drag = dragRef.current

    dragRef.current = null

    if (!drag?.active || drag.id !== event.pointerId) {
      return
    }

    // El clic que viene detrás del arrastre no es un toque: no abre ni agranda nada.
    draggedRef.current = true
    window.setTimeout(() => {
      draggedRef.current = false
    }, 80)

    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    const elapsed = Math.max(1, event.timeStamp - drag.at)
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    const next: FlipTurns = cancelled
      ? turnsRef.current
      : { x: turnsRef.current.x + settle(drag.angle.x, -dy, elapsed, !horizontal), y: turnsRef.current.y + settle(drag.angle.y, dx, elapsed, horizontal) }
    const flipper = flipperRef.current

    if (flipper) {
      flipper.style.transition = ''
      flipper.style.transform = flipTransform(next.x * 180, next.y * 180)
    }

    turnsRef.current = next
    setTurns(next)
  }, [])

  return {
    turns,
    flipped: (Math.abs(turns.x) + Math.abs(turns.y)) % 2 === 1,
    flipperRef,
    /** Ya se empezó a dar vuelta: hay que bajar el dorso en alta. */
    loadBack: backNeeded || turns.x !== 0 || turns.y !== 0,
    /** Un medio giro de costado (la tecla F). */
    flip: useCallback(() => {
      setBackNeeded(true)
      setTurns((current) => ({ ...current, y: current.y + 1 }))
    }, []),
    /** Vuelve al frente (al pasar a otra carta). */
    reset: useCallback(() => setTurns(FRONT), []),
    consumeClick: () => {
      const dragged = draggedRef.current

      draggedRef.current = false

      return dragged
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      const box = event.currentTarget.getBoundingClientRect()

      dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, width: Math.max(1, box.width), height: Math.max(1, box.height), active: false, angle: { x: 0, y: 0 } }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current

      if (!drag || drag.id !== event.pointerId) return

      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y

      if (!drag.active) {
        if (Math.hypot(dx, dy) < START_PX) return

        drag.active = true
        setBackNeeded(true)

        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Un puntero que ya no está: el arrastre termina solo.
        }

        if (flipperRef.current) flipperRef.current.style.transition = 'none'
      }

      // Mientras gira con el dedo, la inclinación hacia el puntero se apaga (y su brillo) y la carta sigue al puntero aunque se salga de ella: cada movimiento del mouse la volvería a encender, por eso se apaga en cada uno.
      levelOut(event.currentTarget)
      drag.angle = { x: -(dy / (drag.height * SPAN)) * 180, y: (dx / (drag.width * SPAN)) * 180 }

      if (flipperRef.current) flipperRef.current.style.transform = flipTransform(turnsRef.current.x * 180 + drag.angle.x, turnsRef.current.y * 180 + drag.angle.y)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
  }
}

/** El resplandor y el aro de la carta grande: van en las dos caras (no en el marco, que se queda quieto y se vería como un panel fantasma mientras la carta gira). */
const FACE_SHADOW = 'shadow-[0_24px_50px_rgb(0_0_0/0.6),0_0_0_1px_rgb(255_255_255/0.12),0_0_40px_rgb(var(--primary-rgb)/0.3)]'

/**
 * La carta grande, dada vuelta: el frente y, del otro lado, el dorso con los logos de una carta real (el chico, y en alta apenas se empieza a dar vuelta). Gira en 3D sobre los dos ejes con su propia perspectiva (`FLIP_PERSPECTIVE`:
 * el marco que la contiene no la recorta, cada cara se recorta a sí misma), `turns` medios giros en cada uno; el gesto que la mueve es `useCardFlip`. No tiene tamaño propio: llena a quien la contiene.
 */
export function CardFlip({ turns, flipperRef, loadBack = false, shadow = true, children }: { turns: FlipTurns; flipperRef: RefObject<HTMLDivElement | null>; /** Bajar el dorso en alta (`useCardFlip().loadBack`). */ loadBack?: boolean; /** Con el resplandor de la carta grande (por defecto). */ shadow?: boolean; children: ReactNode }) {
  const flipped = (Math.abs(turns.x) + Math.abs(turns.y)) % 2 === 1
  const face = shadow ? FACE_SHADOW : ''

  return (
    <div
      ref={flipperRef}
      className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.25,1)] [transform-style:preserve-3d] motion-reduce:transition-none"
      style={{ transform: flipTransform(turns.x * 180, turns.y * 180) }}
      data-flipped={flipped ? 'true' : 'false'}
    >
      <div className={`absolute inset-0 overflow-hidden [backface-visibility:hidden] ${face}`} aria-hidden={flipped || undefined}>
        {children}
        {/* El brillo que sigue al puntero va pegado al frente (gira con él y se esconde con el dorso): afuera quedaba flotando, plano, donde estaba la carta. */}
        <CardGlare />
      </div>
      <div className={`absolute inset-0 overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] ${face}`} aria-hidden={flipped ? undefined : true}>
        <span className={`${CARD_BACK} z-0`} />
        {/* El dorso en alta se funde encima del de siempre cuando termina de bajar. */}
        {loadBack ? (
          <img
            src={CARD_BACK_HD_URL}
            alt=""
            draggable={false}
            decoding="async"
            className="absolute inset-0 z-1 block size-full object-cover opacity-0 transition-opacity duration-300 motion-reduce:transition-none"
            onLoad={(event) => {
              event.currentTarget.style.opacity = '1'
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function hintCount(): number {
  try {
    return Number(window.localStorage.getItem(HINT_KEY)) || 0
  } catch {
    return 0
  }
}

/** La pista del gesto («Arrastrá para girarla»): aparece un momento las primeras veces que se abre una carta grande y se va sola. */
export function FlipHint() {
  const [show] = useState(() => hintCount() < HINT_TIMES)

  useEffect(() => {
    if (!show) return

    try {
      window.localStorage.setItem(HINT_KEY, String(hintCount() + 1))
    } catch {
      // Sin almacenamiento, la pista sale cada vez: no es grave.
    }
  }, [show])

  if (!show) {
    return null
  }

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 bottom-3 z-2 mx-auto w-max whitespace-nowrap max-w-[90%] animate-flip-hint rounded-full bg-background/80 px-3 py-1 text-micro font-semibold text-foreground backdrop-blur-sm motion-reduce:animate-none"
    >
      ✥ {t('search.flip.hint')}
    </span>
  )
}
