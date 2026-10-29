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
  /** Se puede mirar la sala (una con reglas automáticas, todavía no): sin esto no va «Copiar enlace para mirar». */
  watchable?: boolean
}

/**
 * Los botones para invitar, para quien abrió la sala (compartir, copiar el enlace y copiar el enlace para mirar). Van siempre en el encabezado: mientras espera al rival «Copiar enlace» es la acción principal y,
 * cuando entra, deja de serlo pero sigue a mano (el enlace para mirar es de quien quiera ver el duelo). En el celular los dos de los costados son sólo el ícono.
 */
export function InviteButtons({ peerPresent, canShare, onShare, onCopy, stacked = false, watchable = true }: InviteButtonsProps) {
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
      {watchable ? (
        <Button variant="tertiary" size="sm" icon="eye" className={wide} title={t('duel.room.watchHint')} onClick={() => onCopy(true)}>
          <span className="max-sm:sr-only">{t('duel.room.copyWatch')}</span>
        </Button>
      ) : null}
    </div>
  )
}

interface InviteLinkProps {
  link: string
  room: string
  /** El rival ya entró: el código y quién puede mirar ya no hacen falta a la vista. */
  peerPresent: boolean
  /** Se puede mirar la sala: sin esto no se dice quién puede mirar. */
  watchable?: boolean
}

/**
 * Lo que acompaña a los botones para invitar, mientras el rival no entró: el código (chico, para dictarlo o tipearlo en «Tengo un código» desde otro dispositivo) y quién puede mirar. El enlace NO se
 * dibuja (Gastón, 2026-10-29: «el link no debe verse pero sí poder copiarse»): lo copian y lo comparten los botones; queda `hidden` (ni a la vista ni para el lector de pantalla) sólo para que las pruebas lo lean.
 */
export function InviteLink({ link, room, peerPresent, watchable = true }: InviteLinkProps) {
  return (
    <>
      <span hidden data-testid="duel-link">
        {link}
      </span>
      {peerPresent ? null : (
        // En un celular bajo (menos de 760 px de alto) se esconden: los botones dicen lo que hace falta y la sala tiene que entrar sin scroll.
        <div className="grid justify-items-center gap-1 text-center max-[1101px]:[@media(max-height:760px)]:hidden">
          <p className="m-0 text-micro text-soft">{t('duel.room.code', { code: room })}</p>
          {watchable ? <p className="m-0 max-w-md text-micro text-soft">{t('duel.room.watchHint')}</p> : null}
        </div>
      )}
    </>
  )
}
