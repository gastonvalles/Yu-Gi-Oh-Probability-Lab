import { MASCOTS, MASCOT_ANIMATION, MASCOT_STILL, maxActiveMascots, restMascot, summonMascot, useActiveMascots, type MascotId } from '../../app/mascot'
import { useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'

const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)'

interface MascotsModalProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * Las mascotas disponibles, en el medio de la pantalla: las que están afuera (hasta `maxActiveMascots`) y las que descansan, cada una con su
 * botón para sacarla o mandarla a descansar. Con el máximo afuera, las que descansan no se pueden sacar hasta que otra descanse.
 */
export function MascotsModal({ isOpen, onClose }: MascotsModalProps) {
  const active = useActiveMascots()
  const reduceMotion = useMediaQuery(REDUCED_MOTION_MEDIA_QUERY)
  const max = maxActiveMascots()
  const full = active.length >= max

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      icon="paw"
      title={t('shell.mascot.title')}
      subtitle={t('shell.mascot.modal.subtitle', { max })}
      footer={
        <Button variant="primary" size="sm" onClick={onClose}>
          {t('shell.mascot.modal.done')}
        </Button>
      }
    >
      <div className="grid gap-3">
        <p className="m-0 text-micro font-semibold text-muted" aria-live="polite">
          {t('shell.mascot.modal.count', { count: active.length, max })}
        </p>
        <ul aria-label={t('shell.mascot.available')} className="m-0 grid list-none grid-cols-2 gap-3 p-0 max-[420px]:grid-cols-1">
          {(Object.keys(MASCOTS) as MascotId[]).map((id) => {
            const mascot = MASCOTS[id]
            const isOut = active.includes(id)

            return (
              <li
                key={id}
                data-out={isOut ? 'true' : 'false'}
                className={cx('grid justify-items-center gap-2 rounded-card border p-3 text-center transition-colors duration-150 motion-reduce:transition-none', isOut ? 'border-primary/55 bg-primary/12' : 'border-border-subtle bg-surface-raised')}
              >
                <img src={`${mascot.folder}/${reduceMotion ? MASCOT_STILL : MASCOT_ANIMATION.idle}`} alt="" draggable={false} className="size-24 select-none object-contain" />
                <div className="grid gap-0.5">
                  <strong className="text-body font-semibold text-foreground">{mascot.name}</strong>
                  <span className="text-micro text-muted">{isOut ? t('shell.mascot.out') : t('shell.mascot.resting')}</span>
                </div>
                {isOut ? (
                  <Button variant="secondary" size="sm" fullWidth aria-label={t('shell.mascot.rest', { name: mascot.name })} onClick={() => restMascot(id)}>
                    {t('shell.mascot.modal.rest')}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" fullWidth aria-label={t('shell.mascot.modal.summonLabel', { name: mascot.name })} disabled={full} onClick={() => summonMascot(id)}>
                    {t('shell.mascot.modal.summon')}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        {full ? <p className="m-0 text-micro text-muted">{t('shell.mascot.modal.full', { max })}</p> : null}
      </div>
    </Modal>
  )
}
