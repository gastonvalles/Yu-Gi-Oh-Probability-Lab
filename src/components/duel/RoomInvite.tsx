import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'

interface InviteButtonsProps {
  /** El rival ya entró: copiar el enlace deja de ser el botón principal. */
  peerPresent: boolean
  canShare: boolean
  onShare: () => void
  /** Copiar el enlace para jugar o, con `true`, el enlace para mirar. */
  onCopy: (watch?: boolean) => void
  /** En la columna de la izquierda de la sala (ancha): uno debajo del otro, cada botón a todo el ancho. */
  stacked?: boolean
}

/**
 * Los botones para invitar, para quien abrió la sala (compartir, copiar el enlace y copiar el enlace para mirar). Van siempre en el encabezado: mientras espera al rival «Copiar enlace» es la acción principal y,
 * cuando entra, deja de serlo pero sigue a mano (el enlace para mirar es de quien quiera ver el duelo). En el celular los dos de los costados son sólo el ícono.
 */
export function InviteButtons({ peerPresent, canShare, onShare, onCopy, stacked = false }: InviteButtonsProps) {
  const wide = stacked ? '@[46rem]:w-full' : undefined

  return (
    <div className={cx('flex flex-wrap items-center gap-2', stacked && '@[46rem]:grid')}>
      {canShare ? (
        <Button variant="secondary" size="sm" icon="upload" className={wide} onClick={onShare}>
          <span className="max-sm:sr-only">{t('duel.room.share')}</span>
        </Button>
      ) : null}
      <Button variant={peerPresent ? 'secondary' : 'primary'} size="sm" icon="link" className={wide} onClick={() => onCopy()}>
        {t('duel.room.copy')}
      </Button>
      <Button variant="tertiary" size="sm" icon="eye" className={wide} title={t('duel.room.watchHint')} onClick={() => onCopy(true)}>
        <span className="max-sm:sr-only">{t('duel.room.copyWatch')}</span>
      </Button>
    </div>
  )
}

interface InviteLinkProps {
  link: string
  room: string
  /** El rival ya entró: el enlace ya no hace falta a la vista (queda para el lector de pantalla y para copiar con los botones). */
  peerPresent: boolean
}

/**
 * Lo que se le manda al rival, mientras no entró: el enlace entero, el código y quién puede mirar, en el centro del escenario de la sala (es lo que toca hacer en el primer paso). Con el rival adentro
 * se esconde a la vista —el enlace sigue en el documento—: ocupaba el lugar de lo que sigue (estar listo y definir quién empieza).
 */
export function InviteLink({ link, room, peerPresent }: InviteLinkProps) {
  if (peerPresent) {
    return (
      <span className="sr-only" data-testid="duel-link">
        {link}
      </span>
    )
  }

  return (
    <div className="grid justify-items-center gap-1.5 text-center">
      <p className="m-0 text-micro font-semibold uppercase tracking-[0.04em] text-soft">{t('duel.room.link')}</p>
      <p className="m-0 max-w-full break-all text-body font-semibold text-info-soft" data-testid="duel-link">
        {link}
      </p>
      {/* En un celular bajo (menos de 760 px de alto) el código y la aclaración de quién mira se esconden: el enlace y los botones dicen lo que hace falta y la sala tiene que entrar sin scroll. */}
      <p className="m-0 text-micro text-soft max-[1100px]:[@media(max-height:760px)]:hidden">{t('duel.room.code', { code: room })}</p>
      <p className="m-0 max-w-md text-micro text-soft max-[1100px]:[@media(max-height:760px)]:hidden">{t('duel.room.watchHint')}</p>
    </div>
  )
}
