import type { ReactNode } from 'react'

import { Heading } from '../../ui/Heading'
import { cx } from '../../ui/cx'

/** Un paso del editor: título arriba, o (inline) título a la izquierda y el control a la derecha. */
export function RuleStep({ title, inline = false, children }: { title: string; inline?: boolean; children: ReactNode }) {
  return (
    <section className={cx('grid content-start gap-2', inline && 'min-[520px]:grid-cols-[4.5rem_minmax(0,1fr)] min-[520px]:items-center min-[520px]:gap-3')}>
      <Heading level="kicker" as="h4">
        {title}
      </Heading>
      {children}
    </section>
  )
}
