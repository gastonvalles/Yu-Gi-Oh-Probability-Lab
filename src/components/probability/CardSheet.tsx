import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { CardEffectTraits } from '../card-detail/CardEffectTraits'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'
import { overline } from '../ui/typography'
import { GHOST_CLICK_MS, type MenuItem } from './MatDialogs'
import { CARD_BACK } from './practice-styles'

interface CardSheetProps {
  name: string
  /** Dónde está la carta (la zona, la pila) o de quién es: va arriba del nombre. */
  kicker?: string
  art: string | null
  /** Sin imagen (el deck, una carta del rival que no mostró): se dibuja el dorso. */
  back?: boolean
  apiCard?: ApiCardReference | null
  /** Con los rasgos confirmados de la carta entera debajo del nombre (por defecto sí; la lista de efectos de «Activar efecto» los dice de cada efecto y no los repite). */
  traits?: boolean
  /** Las opciones van de a una por fila, no de a dos (la lista de efectos de «Activar efecto»). */
  stacked?: boolean
  /** Las jugadas de la carta, en el orden del menú de siempre: las que no son de apoyo (`utility`) son las jugadas del juego; las de apoyo, lo de abajo. */
  items: readonly MenuItem[]
  /** El segundo paso de una jugada («¿En ataque o en defensa?»): sus opciones salen en lugar de las jugadas. */
  asking?: string
  /** Ver la carta entera (el detalle). */
  onInspect?: () => void
  /** Sin carta: sólo el encabezado con el título (las fases). */
  plain?: boolean
  /** La hoja no tapa la mesa: el fondo deja pasar los toques (se elige tocando una carta del campo, p. ej. a quién atacar) y no se lleva el foco. */
  passThrough?: boolean
  onClose: () => void
}

/**
 * Una sola grilla de dos columnas de botones iguales (mismo estilo, mismo alto) y siempre el mismo aire entre todos (`gap-2`, también entre las jugadas y las de apoyo); si sobra uno, ocupa la fila entera. Con `stacked`
 * (la lista de efectos de «Activar efecto»: frases largas, cada una con su línea chica debajo) van de a una por fila. Una opción con `hint` lleva el texto arriba y la línea chica debajo.
 */
function Options({ items, stacked }: { items: readonly MenuItem[]; stacked: boolean }) {
  return (
    <div className={cx('grid gap-2', stacked ? 'grid-cols-1' : 'grid-cols-2')}>
      {items.map((item, index) => (
        <Button
          // El lugar hace única la clave (dos materiales pueden llamarse igual); el texto, que el segundo paso sean botones nuevos.
          key={`${index}|${item.label}`}
          role="menuitem"
          aria-current={item.current ? 'true' : undefined}
          variant={item.current ? 'primary' : 'secondary'}
          className={cx('min-w-0 px-2!', !stacked && items.length % 2 === 1 && index === items.length - 1 && 'col-span-2', stacked && 'justify-start text-left')}
          aria-disabled={item.disabled || undefined}
          disabled={item.disabled}
          data-initial-focus={index === 0 ? '' : undefined}
          onClick={item.onSelect}
        >
          {item.hint || item.lead ? (
            <span className="grid min-w-0 gap-0.5">
              {item.lead ? <span className="block text-micro font-semibold opacity-70">{item.lead}</span> : null}
              <span className={cx(item.lead && 'font-normal')}>{item.label}</span>
              {item.hint ? <span className="block text-micro font-normal opacity-70">{item.hint}</span> : null}
            </span>
          ) : (
            item.label
          )}
        </Button>
      ))}
    </div>
  )
}

/**
 * El menú de una carta en el celular (en escritorio es `CardMenu`, pegado a la carta): una hoja que sale de abajo con la carta (su texto está en la lupa), su nombre y dónde está, y **todas las jugadas a un toque,
 * sin menús que abrir**, en botones todos iguales, de a dos por fila y siempre con el mismo aire entre ellos: primero las del juego (Invocación Normal, Colocar, Activar…) y a continuación las de apoyo (revelar, target, descartar, desterrar, al deck).
 * Va sobre todo lo demás (un visor de pila, por ejemplo) con un fondo que la cierra al tocar afuera, y también con la X o Escape; elegir una jugada la cierra y la mesa pide lo que falta (la zona).
 * Las jugadas son las mismas de `listCardActions`: sólo cambia cómo se ofrecen.
 */
export function CardSheet({ name, kicker, art, back = false, apiCard = null, traits = true, stacked = false, items, asking, onInspect, plain = false, passThrough = false, onClose }: CardSheetProps) {
  const ref = useRef<HTMLElement | null>(null)
  const openedAtRef = useRef(performance.now())
  // La hoja se abre al levantar el dedo de la carta (el `pointerup`) y sale justo debajo del dedo: el click que el celular manda después caería en una de sus jugadas y la haría sin querer
  // («la primera vez que toco una carta me ofrece una acción rápida»). Un instante no atiende toques; el click fantasma pasa de largo (al fondo, que tampoco lo atiende todavía).
  const [armed, setArmed] = useState(false)
  const plays = items.filter((item) => !item.utility)
  const support = items.filter((item) => item.utility)

  useEscapeKey(onClose)
  useFocusTrap(ref, !passThrough)

  useEffect(() => {
    const timer = window.setTimeout(() => setArmed(true), GHOST_CLICK_MS)

    return () => window.clearTimeout(timer)
  }, [])

  // El click que el celular manda al soltar el dedo sobre la carta llega después de abrir la hoja y cae en el fondo recién montado: un instante no lo cierra.
  const closeFromBackdrop = () => {
    if (performance.now() - openedAtRef.current >= GHOST_CLICK_MS) {
      onClose()
    }
  }

  if (typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <>
      <div aria-hidden="true" className={cx('fixed inset-0 z-210', passThrough && 'pointer-events-none')} onClick={closeFromBackdrop} />
      <section
        ref={ref}
        aria-label={name}
        tabIndex={-1}
        className={cx('fixed inset-x-0 bottom-0 z-210 animate-sheet-in rounded-t-panel border border-b-0 border-border bg-card-background px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 shadow-overlay outline-none motion-reduce:animate-none', !armed && 'pointer-events-none')}
      >
        <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-primary-soft/50" />
        <CloseButton size="sm" aria-label={t('common.close')} className="absolute right-1 top-1" onClick={onClose} />

        <div className={cx('grid items-center gap-3', plain ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[2.75rem_minmax(0,1fr)]')}>
          {plain ? null : <figure className="relative m-0 aspect-[421/614] w-full overflow-hidden rounded-card bg-input">
            {back ? <span className={CARD_BACK} /> : <CardArt remoteUrl={art} name={name} className="block h-full w-full object-cover" />}
            {onInspect ? (
              <button
                type="button"
                aria-label={t('practice.dialog.viewCard')}
                title={t('practice.dialog.viewCard')}
                className="absolute inset-0 grid place-items-end justify-items-end p-0.5 text-white focus-visible:outline-none focus-visible:shadow-focus"
                onClick={onInspect}
              >
                <span className="grid size-5 place-items-center rounded-full border border-border-subtle bg-background/85"><Icon name="search" size={12} /></span>
              </button>
            ) : null}
          </figure>}
          <div className="min-w-0 pr-8">
            {kicker ? <p className={cx('m-0', overline)}>{kicker}</p> : null}
            <h3 className="m-0 line-clamp-2 text-lead font-bold leading-tight text-foreground">{name}</h3>
            {apiCard?.cardType ? <p className="m-0 mt-0.5 text-body font-semibold text-accent">{apiCard.cardType}</p> : null}
            {traits ? <CardEffectTraits ygoprodeckId={apiCard?.ygoprodeckId} className="mt-1" /> : null}
          </div>
        </div>

        {/* Las jugadas, `role="menu"`, y cada una un `menuitem`, como en el menú pegado a la carta: las del juego primero y las de apoyo después, todas en la misma grilla. */}
        <div role="menu" aria-label={name} className={cx('mt-3', stacked && 'max-h-[min(55dvh,28rem)] overflow-y-auto')}>
          <Options items={asking !== undefined ? items : [...plays, ...support]} stacked={stacked} />
        </div>
      </section>
    </>,
    document.body,
  )
}
