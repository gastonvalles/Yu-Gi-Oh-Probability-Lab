import { useEffect, useState, type MouseEventHandler } from 'react'

import { hasUnseen, NOVEDADES_SEEN_EVENT, NOVEDADES_SEEN_KEY, readLastSeen, type NovedadesEntry } from '../../app/novedades'
import { useStoredValue } from '../../app/use-stored-value'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { TONE } from '../ui/tone'
import { textLink } from '../ui/typography'

/** Si hay algo sin ver. El JSON se pide aparte (no entra en lo primero que baja la app); mientras llega, o sin almacenamiento, no hay punto. */
function useHasNews(): boolean {
  const [entries, setEntries] = useState<NovedadesEntry[]>([])
  const lastSeen = useStoredValue(readLastSeen, NOVEDADES_SEEN_EVENT, NOVEDADES_SEEN_KEY)

  useEffect(() => {
    let alive = true
    void import('../../data/novedades.json').then(
      (data) => alive && setEntries(data.default.entries as NovedadesEntry[]),
      () => {},
    )
    return () => {
      alive = false
    }
  }, [])

  return hasUnseen(entries, lastSeen)
}

/**
 * El enlace «Novedades» de abajo del menú (junto a la privacidad): lleva a `#novedades` y, si la entrada más nueva no se vio, lleva un punto lima (`info`) que el lector
 * de pantalla oye en el nombre del enlace. Abrir la pantalla lo apaga. El tamaño lo pone quien lo usa (el menú lateral y el cajón del celular).
 */
export function NovedadesLink({ className, onClick }: { className?: string; onClick?: MouseEventHandler<HTMLAnchorElement> }) {
  const unseen = useHasNews()

  return (
    <a href="#novedades" aria-label={unseen ? t('novedades.linkUnseen') : undefined} onClick={onClick} className={cx('inline-flex w-fit items-center gap-1.5 rounded-control', textLink, className)}>
      {t('novedades.title')}
      {unseen ? <span aria-hidden="true" className={cx('size-2 shrink-0 rounded-full', TONE.info.fill)} /> : null}
    </a>
  )
}
