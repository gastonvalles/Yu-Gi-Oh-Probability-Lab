import type { ReactNode } from 'react'

import { formatInteger } from '../../app/utils'
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
  return (
    <CardOverlay ariaLabel={`Clasificar ${name}`} panelLabel="Clasificación de la carta" name={name} card={card} tall onClose={onClose}>
      <CardPanelHeader title={name} lines={lines} />
      <CardPanelBody label="Origen y roles" className="text-body">
        <div className="grid gap-4">
          {notice}
          <ClassificationFields origin={origin} roles={roles} onSetOrigin={onSetOrigin} onToggleRole={onToggleRole} onOpenHelp={onOpenHelp} />
        </div>
      </CardPanelBody>
      <CardPanelFooter>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <Button variant="secondary" size="md" icon="chevron-left" fullWidth disabled={!onPrevious} onClick={onPrevious}>
            Anterior
          </Button>
          <span className="min-w-14 text-center text-micro tabular-nums text-soft">
            {formatInteger(position)} / {formatInteger(total)}
          </span>
          <Button variant="primary" size="md" iconEnd="chevron-right" fullWidth disabled={!onNext} onClick={onNext}>
            Siguiente
          </Button>
        </div>
      </CardPanelFooter>
    </CardOverlay>
  )
}
