import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'

import { t } from '../../i18n'
import { CARD_BACK, CARD_BACK_HD_URL } from '../probability/practice-styles'
import { levelOut } from './card-tilt'

/** Cuánto hay que arrastrar la carta, en partes de su alto, para darla vuelta entera (medio giro por cada 0,8 de alto). */
const SPAN = 0.8
/** Un tirón corto y rápido (más de 36 px a más de 0,6 px/ms) la da vuelta aunque no llegue a la mitad. */
const FLICK_PX = 36
const FLICK_SPEED = 0.6
/** Lo que hay que arrastrar antes de que cuente como el gesto (y no como un toque), y cuánto más vertical que horizontal tiene que ser (la horizontal es de deslizar a la carta de al lado). */
const START_PX = 10
const VERTICAL_RATIO = 1.3
/**
 * La perspectiva del giro (px), propia de la carta (`perspective()` dentro del mismo `transform`): grande, para que al inclinarse la parte que se acerca a la cámara no se agrande de más (con 900 px la carta a 45° crecía
 * un 80 % y se cortaba contra el borde de su marco).
 */
const FLIP_PERSPECTIVE = 2200
const flipTransform = (degrees: number) => `perspective(${FLIP_PERSPECTIVE}px) rotateX(${degrees}deg)`
/** Cuántas veces se avisa del gesto con una pista (después ya se sabe). */
const HINT_TIMES = 3
const HINT_KEY = 'ygo-lab:flip-hint'

interface Drag {
  id: number
  x: number
  y: number
  at: number
  height: number
  active: boolean
  /** Cuánto giró en lo que va del gesto (grados; hacia arriba, positivo). */
  angle: number
}

/**
 * Dar vuelta la carta grande con un gesto, sin botón (Gastón, 2026-10-19: «para dar vuelta la carta debo hacer un gesto o movimiento»): **arrastrarla hacia arriba o abajo** (con el dedo o con el mouse) la
 * gira en 3D siguiendo el movimiento, y al soltar termina de darse vuelta hacia el lado más cercano (o hacia donde iba, si fue un tirón rápido); la **tecla F** hace lo mismo desde el teclado. El
 * arrastre de costado no es de esto: en el detalle desliza a la carta anterior o a la siguiente. Devuelve los giros dados (cada uno son 180°: impar es el dorso), `flipperRef` para el elemento
 * que gira (`CardFlip`) y los eventos del elemento que se arrastra (se suman a los suyos); `consumeClick` dice si el clic que sigue a un arrastre hay que ignorarlo (no es un toque).
 */
export function useCardFlip() {
  const [turns, setTurns] = useState(0)
  // El dorso en alta se baja recién cuando la carta se empieza a dar vuelta (pesa ~220 KB): hasta entonces alcanza el de YGOPRODeck, que ya está en la mesa.
  const [backNeeded, setBackNeeded] = useState(false)
  const flipperRef = useRef<HTMLDivElement | null>(null)
  const turnsRef = useRef(0)
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

    const dy = event.clientY - drag.y
    const elapsed = Math.max(1, event.timeStamp - drag.at)
    const flick = Math.abs(dy) >= FLICK_PX && Math.abs(dy) / elapsed >= FLICK_SPEED
    const delta = cancelled ? 0 : Math.round(drag.angle / 180) || (flick ? (dy < 0 ? 1 : -1) : 0)
    const next = turnsRef.current + delta
    const flipper = flipperRef.current

    if (flipper) {
      flipper.style.transition = ''
      flipper.style.transform = flipTransform(next * 180)
    }

    turnsRef.current = next
    setTurns(next)
  }, [])

  return {
    turns,
    flipped: Math.abs(turns) % 2 === 1,
    flipperRef,
    /** Ya se empezó a dar vuelta: hay que bajar el dorso en alta. */
    loadBack: backNeeded || turns !== 0,
    /** Un giro más (la tecla F). */
    flip: useCallback(() => {
      setBackNeeded(true)
      setTurns((current) => current + 1)
    }, []),
    /** Vuelve al frente (al pasar a otra carta). */
    reset: useCallback(() => setTurns(0), []),
    consumeClick: () => {
      const dragged = draggedRef.current

      draggedRef.current = false

      return dragged
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return

      dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp, height: Math.max(1, event.currentTarget.getBoundingClientRect().height), active: false, angle: 0 }
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current

      if (!drag || drag.id !== event.pointerId) return

      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y

      if (!drag.active) {
        if (Math.abs(dy) < START_PX || Math.abs(dy) < Math.abs(dx) * VERTICAL_RATIO) return

        drag.active = true
        setBackNeeded(true)
        // Mientras gira con el dedo, la inclinación hacia el puntero se apaga y la carta sigue al puntero aunque se salga de ella.
        levelOut(event.currentTarget)

        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Un puntero que ya no está: el arrastre termina solo.
        }

        if (flipperRef.current) flipperRef.current.style.transition = 'none'
      }

      drag.angle = (-dy / (drag.height * SPAN)) * 180

      if (flipperRef.current) flipperRef.current.style.transform = flipTransform(turnsRef.current * 180 + drag.angle)
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => finish(event, false),
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => finish(event, true),
  }
}

/**
 * La carta grande, dada vuelta: el frente y, del otro lado, el dorso (el de YGOPRODeck, y en alta apenas se empieza a dar vuelta). Gira en 3D sobre su eje horizontal con su propia perspectiva (`FLIP_PERSPECTIVE`:
 * el marco que la contiene no la recorta, cada cara se recorta a sí misma), `turns` medios giros; el gesto que la mueve es `useCardFlip`. No tiene tamaño propio: llena a quien la contiene.
 */
export function CardFlip({ turns, flipperRef, loadBack = false, children }: { turns: number; flipperRef: RefObject<HTMLDivElement | null>; /** Bajar el dorso en alta (`useCardFlip().loadBack`). */ loadBack?: boolean; children: ReactNode }) {
  const flipped = Math.abs(turns) % 2 === 1

  return (
    <div
      ref={flipperRef}
      className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.2,0.9,0.25,1)] [transform-style:preserve-3d] motion-reduce:transition-none"
      style={{ transform: flipTransform(turns * 180) }}
      data-flipped={flipped ? 'true' : 'false'}
    >
      <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden]" aria-hidden={flipped || undefined}>
        {children}
      </div>
      <div className="absolute inset-0 overflow-hidden [backface-visibility:hidden] [transform:rotateX(180deg)]" aria-hidden={flipped ? undefined : true}>
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

/** La pista del gesto («Deslizá para dar vuelta»): aparece un momento las primeras veces que se abre una carta grande y se va sola. */
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
      ↕ {t('search.flip.hint')}
    </span>
  )
}
