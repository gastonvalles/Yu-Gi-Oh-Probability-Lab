import { setMatView, useMatView } from '../../app/mat-view'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

/**
 * El botón de la barra de la mesa que cambia entre la vista superior (plana, para jugar con precisión) y la 3D (inclinada). Muestra el ícono de la vista en que estás
 * (el cubo, con un marco violeta, cuando es la 3D) y dice a cuál pasa.
 */
export function MatViewToggle({ className }: { className?: string }) {
  const view = useMatView()
  const to3d = view === 'top'

  return (
    <IconButton
      tone="flat"
      size="sm"
      aria-label={t(to3d ? 'practice.view.to3d' : 'practice.view.toTop')}
      title={t(to3d ? 'practice.view.to3d' : 'practice.view.toTop')}
      className={cx(view === '3d' && 'rounded-control ring-1 ring-primary-soft', className)}
      onClick={() => setMatView(to3d ? '3d' : 'top')}
    >
      <Icon name={view === '3d' ? 'cube' : 'view-top'} />
    </IconButton>
  )
}
