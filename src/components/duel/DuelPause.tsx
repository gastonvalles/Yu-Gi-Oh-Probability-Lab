import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'

interface DuelPauseProps {
  /** Cómo se llama el rival (el que salió). */
  rival: string
  /** Es esta conexión la que se cayó, no el rival el que salió. */
  offline: boolean
  onLeave: () => void
  /** Volver a conectarse ya: si el aviso de que el rival está no llegó, sigue sin salir del duelo. */
  onReconnect: () => void
}

/**
 * El duelo está en pausa mientras falta uno de los dos: tapa la mesa (nada se toca) y espera a que vuelva quien salió, que sigue con su mesa como la dejó.
 * Se puede salir (el duelo queda guardado para volver) o reconectarse, que es lo que destraba una pausa por un aviso que no llegó.
 */
export function DuelPause({ rival, offline, onLeave, onReconnect }: DuelPauseProps) {
  return (
    <div role="alertdialog" aria-modal="true" aria-label={t('duel.pause.title')} className="relative grid h-full place-items-center bg-background/85 p-6">
      <CloseButton size="md" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="absolute right-3 top-3" onClick={onLeave} />
      <div className="grid max-w-xs justify-items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-tint/10 text-foreground">
          <Icon name="pause" size={24} />
        </span>
        <p className="m-0 text-title font-bold text-foreground">{t('duel.pause.title')}</p>
        <p className="m-0 text-body text-muted" role="status">
          {offline ? t('duel.pause.offline') : t('duel.pause.rival', { name: rival })}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="primary" icon="refresh" onClick={onReconnect}>
            {t('duel.pause.reconnect')}
          </Button>
        </div>
      </div>
    </div>
  )
}
