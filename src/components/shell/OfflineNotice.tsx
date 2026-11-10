import { useOnline } from '../../app/use-online'
import { t } from '../../i18n'
import { Callout } from '../ui/Callout'

/** El aviso «Sin conexión» en sí: qué sigue andando y qué vuelve con señal (la muestra del catálogo lo dibuja así, sin esperar a quedarse sin red). */
export function OfflineCallout({ className }: { className?: string }) {
  return (
    <Callout tone="warning" icon="link-off" title={t('shell.offline.title')} className={className}>
      {t('shell.offline.text')}
    </Callout>
  )
}

/**
 * El aviso de la app sin red, arriba de la pantalla y debajo de la barra, alineado con el contenido (`StepPage`). Aparece al quedarse sin red y se va
 * solo al volver: no se descarta ni se anima. La región `status` queda siempre montada (vacía con red) para que el lector anuncie el cambio.
 */
export function OfflineNotice({ className }: { className?: string }) {
  const online = useOnline()

  return (
    <div role="status" aria-live="polite" className={className}>
      {online ? null : (
        <div className="mx-auto w-full max-w-content px-gutter pt-3 min-[1101px]:px-6 min-[1101px]:pt-4">
          <OfflineCallout />
        </div>
      )}
    </div>
  )
}
