import type { ReactNode } from 'react'

import { cx } from '../../ui/cx'
import { overline } from '../../ui/typography'

/** Un paso del editor: título arriba, o (inline) título a la izquierda y el control a la derecha. */
export function RuleStep({ title, inline = false, children }: { title: string; inline?: boolean; children: ReactNode }) {
  return (
    <section className={cx('grid content-start gap-2', inline && 'min-[520px]:grid-cols-[4.5rem_minmax(0,1fr)] min-[520px]:items-center min-[520px]:gap-3')}>
      <h4 className={cx('m-0', overline)}>{title}</h4>
      {children}
    </section>
  )
}
