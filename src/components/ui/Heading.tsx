import type { ElementType, HTMLAttributes } from 'react'

import { cx } from './cx'
import { cardTitle, overline, pageTitle, sectionTitle } from './typography'

/**
 * page: el título de la pantalla (un h1 por pantalla) · section: título de una tarjeta, un diálogo o un panel (h2) ·
 * card: título de un ítem adentro de una tarjeta (h3) · kicker: sobretítulo corto en mayúsculas (no es un encabezado).
 */
export type HeadingLevel = 'page' | 'section' | 'card' | 'kicker'

const TAG: Record<HeadingLevel, ElementType> = { page: 'h1', section: 'h2', card: 'h3', kicker: 'p' }
const STYLE: Record<HeadingLevel, string> = { page: pageTitle, section: sectionTitle, card: cardTitle, kicker: cx('m-0', overline) }

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level: HeadingLevel
  /** Otra etiqueta (un h3 donde la jerarquía de la pantalla lo pide); el estilo sigue siendo el del nivel. */
  as?: ElementType
}

/** Todos los títulos de la app salen de acá: cambiar el tamaño o el peso de un nivel se hace una sola vez, en `typography.ts`. */
export function Heading({ level, as: Component = TAG[level], className, ...props }: HeadingProps) {
  return <Component className={cx(STYLE[level], className)} {...props} />
}
