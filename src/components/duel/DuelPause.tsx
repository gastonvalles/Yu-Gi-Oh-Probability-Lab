import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'

interface DuelPauseProps {
  /** Cómo se llama el rival (el que salió). */
  rival: string
  /** Es esta conexión la que se cayó, no el rival el que salió. */
  offline: boolean
  onLeave: () => void
}

/**
 * El duelo está en pausa mientras falta uno de los dos: tapa la mesa (nada se toca) y espera a que vuelva quien salió, que sigue con su mesa como la dejó.
 * Lo único que se puede hacer es salir (el duelo queda guardado para volver).
 */
export function DuelPause({ rival, offline, onLeave }: DuelPauseProps) {
  return (
    <div role="alertdialog" aria-modal="true" aria-label={t('duel.pause.title')} className="grid h-full place-items-center bg-background/85 p-6 backdrop-blur-sm">
      <div className="grid max-w-xs justify-items-center gap-3 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-tint/10 text-foreground">
          <Icon name="pause" size={24} />
        </span>
        <p className="m-0 text-title font-bold text-foreground">{t('duel.pause.title')}</p>
        <p className="m-0 text-body text-muted" role="status">
          {offline ? t('duel.pause.offline') : t('duel.pause.rival', { name: rival })}
        </p>
        <Button variant="secondary" onClick={onLeave}>
          {t('duel.bar.leave')}
        </Button>
      </div>
    </div>
  )
}
