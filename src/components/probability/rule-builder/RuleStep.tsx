import type { ReactNode } from 'react'

import { cx } from '../../ui/cx'
import { overline } from '../../ui/typography'

/**
 * Un paso del editor: el título en versalitas arriba y el control debajo (8 px). `note` va al lado del título, en minúscula y sin negrita («(opcional)»);
 * con `htmlFor` el título es la etiqueta del campo.
 */
export function RuleStep({ title, note, htmlFor, children }: { title: string; note?: string; htmlFor?: string; children: ReactNode }) {
  const heading = (
    <>
      {title} {note ? <span className="font-normal normal-case tracking-normal">{note}</span> : null}
    </>
  )

  return (
    <section className="grid content-start gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className={overline}>
          {heading}
        </label>
      ) : (
        <h4 className={cx('m-0', overline)}>{heading}</h4>
      )}
      {children}
    </section>
  )
}
