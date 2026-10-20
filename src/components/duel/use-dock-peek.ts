import { useCallback, useEffect, useState } from 'react'

import type { CardPeek } from './DuelCardDock'

/** Lo que no desbloquea el detalle al tocarlo: el detalle mismo (se puede leer y desplazar), la carta en grande que se abre desde él (`CardZoom`: está afuera del detalle, en el cuerpo de la página) y cualquier carta (que lo fija por su cuenta). */
const KEEPS_LOCK = '[data-card-dock], [data-card-zoom], [data-card-id], [data-rival-card-id]'

/** Si dos carteles son de la misma carta (para no volver a dibujar el detalle por pasar el mouse sobre la misma). */
function samePeek(left: CardPeek | null, right: CardPeek | null): boolean {
  if (left === null || right === null) return left === right
  if ('faceDown' in left || 'faceDown' in right) return 'faceDown' in left && 'faceDown' in right
  if ('drawId' in left || 'drawId' in right) return 'drawId' in left && 'drawId' in right && left.drawId === right.drawId

  // La misma carta: el mismo nombre y el mismo número (dos copias son la misma; la copia que todavía no cargó sus datos, no).
  return left.name === right.name && (left.card?.ygoprodeckId ?? null) === (right.card?.ygoprodeckId ?? null)
}

/**
 * El detalle fijo de la izquierda (en un duelo y en la práctica, desde 1440 px) muestra la carta **a la que se le pasa el mouse** (Gastón, 2026-10-20: «la carta que se muestra en el panel izquierdo sea la carta a la que le hago hover,
 * no a la que le hago click»). Con un **click** en una carta el detalle queda **fijo** en ella —aunque se pase el mouse por otras— hasta que se hace click afuera del panel (en cualquier lado que no sea una carta ni el panel) o en otra
 * carta. Sin una fija se ve la última a la que se le pasó el mouse, también al sacarlo (así se puede leer el texto o moverse al panel sin que cambie). `hover` recibe lo que se señala; `lock`, lo que se tocó.
 */
export function useDockPeek() {
  const [hovered, setHovered] = useState<CardPeek | null>(null)
  const [locked, setLocked] = useState<CardPeek | null>(null)
  const isLocked = locked !== null

  const hover = useCallback((peek: CardPeek) => setHovered((current) => (samePeek(current, peek) ? current : peek)), [])
  const lock = useCallback((peek: CardPeek) => {
    setLocked((current) => (samePeek(current, peek) ? current : peek))
    setHovered((current) => (samePeek(current, peek) ? current : peek))
  }, [])

  // Un toque afuera (que no sea el detalle ni una carta) lo suelta. Se mira en la captura: aunque lo que se toque frene el evento, el detalle se suelta igual.
  useEffect(() => {
    if (!isLocked) return

    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(KEEPS_LOCK)) return

      setLocked(null)
    }

    document.addEventListener('pointerdown', onPointerDown, true)

    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [isLocked])

  return { shown: locked ?? hovered, locked: isLocked, hover, lock }
}
