import type { HTMLAttributes, ReactNode } from 'react'

import { prefersLightText } from '../../app/tierlist-maker'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

/** El ancho de una carta en una tier list (el alto sale de la proporción de la carta): cuatro por fila en un celular de 390 px, más grandes donde hay lugar. */
export const TILE_WIDTH = 'w-16 min-[560px]:w-[5rem] min-[1101px]:w-[5.5rem]'
/** Lo que mide una fila vacía: una carta de alto y el aire de los costados (así una fila sin cartas se ve igual de alta que una con cartas). */
const ROW_MIN_HEIGHT = 'min-h-[6.1rem] min-[560px]:min-h-[7.55rem] min-[1101px]:min-h-[8.3rem]'

/** El color de lo que va escrito sobre el color de una fila (su letra, su botón en la barra de la carta elegida, la tilde del círculo de su color): oscuro sobre los pasteles, claro sobre el gris oscuro. */
export const labelInk = (color: string): string => (prefersLightText(color) ? 'text-foreground' : 'text-accent-foreground')

interface TierStripProps {
  /** El nombre de la fila (S, A, «Muy buenas»…). */
  label: string
  /** El color del recuadro de la izquierda; sin él (`neutral`), el de las superficies: es la bandeja de las cartas sin clasificar. */
  color?: string
  neutral?: boolean
  ariaLabel: string
  title?: string
  /** Con esto, el recuadro es un botón (en el creador abre el editor de la fila). */
  onLabel?: () => void
  labelAriaLabel?: string
  /** La fila resaltada: se le va a soltar una carta. */
  highlighted?: boolean
  /** Los eventos de arrastre de las cartas (en el creador). */
  dropProps?: Pick<HTMLAttributes<HTMLUListElement>, 'onDragOver' | 'onDragLeave' | 'onDrop' | 'onClick'>
  /** Lo que va al final de la fila, a la derecha de las cartas, en una columna angosta (en el creador: el engranaje y el agarre para arrastrarla). Sin esto, la fila es la de siempre. */
  trailing?: ReactNode
  children: ReactNode
}

/**
 * Una fila de tier list, como la de siempre (Gastón, 2026-10-19: «las tierlist deben ser así»): a la izquierda un recuadro de color con la letra grande y, a su lado, el fondo oscuro con las cartas pegadas una
 * a otra, en renglones. Todas miden lo mismo de alto aunque estén vacías y van una abajo de otra, casi sin aire entre sí. Lo comparten las tier lists del meta (sólo se leen) y el creador (se arman). La letra
 * es oscura sobre los pasteles y clara sobre un color oscuro (el gris oscuro del creador), para que se lea.
 */
export function TierStrip({ label, color, neutral = false, ariaLabel, title, onLabel, labelAriaLabel, highlighted = false, dropProps, trailing, children }: TierStripProps) {
  const length = Array.from(label).length
  const size = neutral ? 'text-micro uppercase tracking-[0.08em]' : length <= 2 ? 'text-stat' : length <= 6 ? 'text-lead' : 'text-body'
  const labelClass = cx('grid size-full place-items-center break-words px-1 text-center font-bold leading-tight', neutral ? 'bg-surface-raised text-foreground' : labelInk(color ?? ''), size)
  const labelStyle = neutral ? undefined : { backgroundColor: color }
  // La bandeja de las cartas sin clasificar: el nombre no entra en el recuadro angosto del celular, ahí va un ícono (el nombre sigue para el lector de pantalla).
  const content = neutral ? (
    <>
      <Icon name="cards" size={22} className="min-[1101px]:hidden" />
      <span className="sr-only min-[1101px]:not-sr-only">{label}</span>
    </>
  ) : (
    label
  )

  return (
    <section
      aria-label={ariaLabel}
      className={cx('grid gap-0.5', trailing ? 'grid-cols-[3.5rem_minmax(0,1fr)_2.75rem] min-[1101px]:grid-cols-[6rem_minmax(0,1fr)_2.75rem]' : 'grid-cols-[3.5rem_minmax(0,1fr)] min-[1101px]:grid-cols-[6rem_minmax(0,1fr)]')}
    >
      {onLabel ? (
        <button type="button" aria-label={labelAriaLabel} title={title} className={cx(labelClass, 'cursor-pointer rounded-none border-0 focus-visible:outline-none focus-visible:shadow-focus')} style={labelStyle} onClick={onLabel}>
          {content}
        </button>
      ) : (
        <div title={title} className={labelClass} style={labelStyle}>
          {content}
        </div>
      )}
      <ul className={cx('m-0 flex list-none flex-wrap content-start gap-0.5 bg-card-background p-0.5 transition-shadow duration-150 motion-reduce:transition-none', ROW_MIN_HEIGHT, highlighted && 'shadow-focus')} {...dropProps}>
        {children}
      </ul>
      {/* Sobre el fondo de la página, sin caja propia: dos botones de 44 px uno sobre otro entran en la fila más baja (97,6 px a 390). */}
      {trailing ? <div className="flex flex-col items-center justify-center">{trailing}</div> : null}
    </section>
  )
}
