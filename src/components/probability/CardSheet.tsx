import { useState } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'
import type { MenuItem } from './MatDialogs'

interface CardSheetProps {
  name: string
  art: string | null
  apiCard: ApiCardReference | null
  /** Las jugadas de la carta, en el orden del menú de siempre: las dos primeras son los botones y el resto, lo que sale de «Más». */
  items: readonly MenuItem[]
  /** El segundo paso de una jugada («¿En ataque o en defensa?»): sus opciones salen en lugar de las jugadas. */
  asking?: string
  /** Ver la carta entera (el detalle). */
  onInspect?: () => void
  onClose: () => void
}

/**
 * La hoja de una carta de la mano (celular): sale de abajo sobre la mano, con la carta, su nombre, su tipo y su texto, y las jugadas a un toque (la primera, llena;
 * la segunda; y «Más» con el resto). Reemplaza al menú pegado a la carta, que tapaba lo que se quería leer. Se apoya sobre la mano (`absolute`, sin mover nada) y
 * no tapa la botonera de abajo; elegir una jugada la cierra y la mesa pide lo que falta (la zona). Las jugadas son las mismas de `listCardActions`: sólo cambia cómo se ofrecen.
 */
export function CardSheet({ name, art, apiCard, items, asking, onInspect, onClose }: CardSheetProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [main, second, ...rest] = items

  useEscapeKey(onClose)

  return (
    <section aria-label={name} className="absolute inset-x-0 bottom-0 z-40 animate-sheet-in rounded-t-panel border border-b-0 border-border bg-card-background px-3 pb-3 pt-2 shadow-overlay motion-reduce:animate-none">
      <span aria-hidden="true" className="mx-auto mb-2 block h-1 w-10 rounded-full bg-primary-soft/50" />
      <CloseButton size="sm" aria-label={t('common.close')} className="absolute right-1 top-1" onClick={onClose} />

      <div className="grid grid-cols-[5.25rem_minmax(0,1fr)] gap-3">
        <figure className="relative m-0 aspect-[421/614] w-full overflow-hidden rounded-card bg-input">
          <CardArt remoteUrl={art} name={name} className="block h-full w-full object-cover" />
          {onInspect ? (
            <button
              type="button"
              aria-label={t('practice.dialog.viewCard')}
              title={t('practice.dialog.viewCard')}
              className="absolute bottom-1 right-1 grid size-9 place-items-center rounded-full border border-border-subtle bg-background/85 text-white focus-visible:outline-none focus-visible:shadow-focus"
              onClick={onInspect}
            >
              <Icon name="search" size={16} />
            </button>
          ) : null}
        </figure>
        <div className="min-w-0 pr-8">
          <h3 className="m-0 line-clamp-2 text-lead font-bold leading-tight text-foreground">{name}</h3>
          {apiCard?.cardType ? <p className="m-0 mt-0.5 text-body font-semibold text-accent">{apiCard.cardType}</p> : null}
          {apiCard?.description ? <p className="m-0 mt-1 line-clamp-5 text-micro text-muted">{apiCard.description}</p> : null}
        </div>
      </div>

      {/* Las jugadas: `role="menu"` y cada una un `menuitem`, como en el menú pegado a la carta. Lo que sale de «Más» está siempre en el árbol pero invisible hasta abrirlo (no se enfoca ni se lee). */}
      <div role="menu" aria-label={name} className="relative mt-3">
        {asking !== undefined ? (
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, items.length)}, minmax(0, 1fr))` }}>
            {items.map((item, index) => (
              <Button key={item.label} role="menuitem" variant={index === 0 ? 'primary' : 'secondary'} className="px-2" onClick={item.onSelect}>
                {item.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {main ? (
              <Button role="menuitem" variant="primary" className="px-2" onClick={main.onSelect}>
                {main.label}
              </Button>
            ) : null}
            {second ? (
              <Button role="menuitem" variant="secondary" className="px-2" onClick={second.onSelect}>
                {second.label}
              </Button>
            ) : null}
            {rest.length > 0 ? (
              <Button role="menuitem" aria-haspopup="menu" aria-expanded={moreOpen} variant="secondary" iconEnd="chevron-down" className="px-2" onClick={() => setMoreOpen((open) => !open)}>
                {t('practice.sheet.more')}
              </Button>
            ) : null}
          </div>
        )}

        {rest.length > 0 && asking === undefined ? (
          <div role="none" className={cx('absolute bottom-full right-0 z-10 mb-2 grid w-56 gap-0.5 rounded-card border border-border bg-card-background p-1 shadow-overlay', moreOpen ? 'animate-pop motion-reduce:animate-none' : 'pointer-events-none invisible')}>
            {rest.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="flex min-h-11 w-full cursor-pointer items-center rounded-control border-0 bg-transparent px-3 text-left text-body font-semibold text-foreground hover:bg-tint/10 focus-visible:outline-none focus-visible:shadow-focus"
                onClick={item.onSelect}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
