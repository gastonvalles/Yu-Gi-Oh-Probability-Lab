import type { ReactNode } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { ApiCardReference, CardOrigin, CardRole } from '../../types'
import { CardOverlay, CardPanelBody, CardPanelFooter, CardPanelHeader } from '../card-detail/CardOverlay'
import { Button } from '../ui/Button'
import { ClassificationFields } from './ClassificationFields'

interface ClassificationOverlayProps {
  name: string
  card: ApiCardReference | null
  /** Líneas de contexto bajo el nombre (tipo y estadísticas, copias…). */
  lines: ReadonlyArray<ReactNode>
  origin: CardOrigin | null
  roles: readonly CardRole[]
  onSetOrigin: (origin: CardOrigin) => void
  onToggleRole: (role: CardRole) => void
  /** Aviso sobre los campos (p. ej. una clasificación sugerida por confirmar). */
  notice?: ReactNode
  /** Lugar de la carta en la lista que se recorre con Anterior / Siguiente. */
  position: number
  total: number
  /** Sin la función, el botón queda deshabilitado. */
  onPrevious?: () => void
  onNext?: () => void
  onOpenHelp?: () => void
  onClose: () => void
}

/** Modal para clasificar una carta: el mismo marco que el detalle (carta arriba, panel abajo, X blanca), con los campos y la navegación. */
export function ClassificationOverlay({
  name,
  card,
  lines,
  origin,
  roles,
  onSetOrigin,
  onToggleRole,
  notice,
  position,
  total,
  onPrevious,
  onNext,
  onOpenHelp,
  onClose,
}: ClassificationOverlayProps) {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  return (
    <CardOverlay ariaLabel={t('roles.overlay.aria', { name })} panelLabel={t('roles.overlay.panel')} name={name} card={card} tall onClose={onClose}>
      <CardPanelHeader title={name} lines={lines} />
      <CardPanelBody label={t('roles.overlay.body')} className="text-body">
        <div className="grid gap-4">
          {notice}
          <ClassificationFields origin={origin} roles={roles} onSetOrigin={onSetOrigin} onToggleRole={onToggleRole} onOpenHelp={onOpenHelp} />
        </div>
      </CardPanelBody>
      <CardPanelFooter>
        {/* En el celular el pie comparte la fila con el $ y no entran las flechas: los botones van sin ellas, más angostos y del ancho de su texto (si igual no entra, se corta con «…»). */}
        <div className="grid grid-cols-[minmax(0,auto)_auto_minmax(0,auto)] items-center gap-2 min-[1101px]:grid-cols-[1fr_auto_1fr]">
          <Button variant="secondary" size={isDesktop ? 'md' : 'sm'} icon={isDesktop ? 'chevron-left' : undefined} fullWidth disabled={!onPrevious} onClick={onPrevious}>
            <span className="min-w-0 truncate">{t('roles.overlay.previous')}</span>
          </Button>
          <span className="min-w-10 text-center text-micro tabular-nums text-soft">
            {formatInteger(position)} / {formatInteger(total)}
          </span>
          <Button variant="secondary" size={isDesktop ? 'md' : 'sm'} iconEnd={isDesktop ? 'chevron-right' : undefined} fullWidth disabled={!onNext} onClick={onNext}>
            <span className="min-w-0 truncate">{t('roles.overlay.next')}</span>
          </Button>
        </div>
      </CardPanelFooter>
    </CardOverlay>
  )
}
