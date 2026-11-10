import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'

/** Online sin red: en vez de «Todavía no hay salas abiertas» (que no es cierto), qué pasó y la puerta a lo que anda sin señal (Solo en manual). */
export function DuelOffline() {
  return (
    <EmptyState
      icon="link-off"
      title={t('duel.offline.title')}
      actions={
        <Button variant="secondary" icon="user" onClick={() => (window.location.hash = '#solo')}>
          {t('duel.offline.toSolo')}
        </Button>
      }
    >
      {t('duel.offline.lobby')}
    </EmptyState>
  )
}
