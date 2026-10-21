import { setMatView, useMatView } from '../../app/mat-view'
import { t } from '../../i18n'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

/**
 * El botón de la barra de la mesa que cambia entre la vista superior (plana, para jugar con precisión) y la 3D (inclinada). Muestra el ícono de la vista en que estás
 * (el cubo, en ámbar, cuando es la 3D; sin borde) y dice a cuál pasa.
 */
export function MatViewToggle({ className }: { className?: string }) {
  const view = useMatView()
  const to3d = view === 'top'

  return (
    <IconButton
      tone="tile"
      size="sm"
      aria-label={t(to3d ? 'practice.view.to3d' : 'practice.view.toTop')}
      title={t(to3d ? 'practice.view.to3d' : 'practice.view.toTop')}
      data-active={view === '3d'}
      className={className}
      onClick={() => setMatView(to3d ? '3d' : 'top')}
    >
      <Icon name={view === '3d' ? 'cube' : 'view-top'} />
    </IconButton>
  )
}
