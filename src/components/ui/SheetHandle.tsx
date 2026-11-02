import type { HTMLAttributes, Ref } from 'react'

import { useSwipeFold } from '../../app/use-swipe-fold'
import { t } from '../../i18n'
import { cx } from './cx'
import { Icon } from './Icon'
import { IconButton } from './IconButton'

interface PromptHandleProps extends HTMLAttributes<HTMLDivElement> {
  /** Lo que dice el asa: la pregunta, corta, o el título de la hoja. */
  label: string
  /** La flecha (44 px, «Mostrar la pregunta», `data-prompt-show`): la reabre. */
  onShow: () => void
  ref?: Ref<HTMLDivElement>
}

/**
 * El asa de una línea de un cartel minimizado de la mesa (desde 1101 px la pregunta del medio, `MatPrompt`; en todos los anchos las hojas del duelo, `Modal lowerable`; en el celular la pregunta
 * es la hoja de abajo, `BottomSheet`). Va en el lugar fijo de la pregunta, apoyada sobre la fila
 * de las Zonas Extra: no tapa nada de tu campo ni la mano. Se abre con la flecha o arrastrándola hacia arriba (`useSwipeFold`). Muestra: «Hoja de la mesa» del catálogo.
 */
export function PromptHandle({ label, onShow, ref, className, ...props }: PromptHandleProps) {
  const swipe = useSwipeFold({ dir: 'up', onFold: onShow })

  return (
    <div ref={ref} {...props} {...swipe} className={cx('flex max-w-full touch-none select-none items-center gap-1 rounded-full border border-info bg-card-background py-0 pl-4 pr-0 text-body text-foreground shadow-overlay', className)}>
      <p className="m-0 min-w-0 truncate font-semibold">{label}</p>
      <IconButton size="lg" data-prompt-show="" aria-label={t('duel.prompt.show')} title={t('duel.prompt.show')} onClick={onShow}>
        <Icon name="chevron-up" />
      </IconButton>
    </div>
  )
}
