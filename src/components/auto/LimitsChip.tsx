import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useEscapeKey } from '../../app/use-overlay'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { surface } from '../ui/surfaces'
import { TONE } from '../ui/tone'

/**
 * Las restricciones que rigen sobre vos en el duelo automático («no podés Invocar de Modo Especial, salvo monstruos VIENTO»), con el texto que da su carta, tal cual: un chip chico
 * en el medio del campo, al lado del botón de las fases (la casilla `p2`, que en automático no lleva nada: no corre nada). Tocarlo muestra los textos debajo, fuera del campo (que
 * en la vista 3D va inclinado); se cierra con otro toque, afuera o con Escape. Sin restricciones no se dibuja.
 */
export function LimitsChip({ texts }: { texts: readonly string[] }) {
  const ref = useRef<HTMLButtonElement | null>(null)
  const [at, setAt] = useState<{ left: number; top: number; width: number } | null>(null)
  const label = t('auto.limits.label', { count: texts.length })

  useEscapeKey(() => setAt(null), at !== null)
  if (texts.length === 0) return null

  const toggle = () => {
    const rect = ref.current?.getBoundingClientRect()

    if (at || !rect) return setAt(null)
    const width = Math.min(288, window.innerWidth - 32)

    setAt({ left: Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 16), window.innerWidth - width - 16), top: rect.bottom + 6, width })
  }

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={at !== null}
        title={label}
        data-testid="auto-limits"
        className={cx('inline-flex h-11 min-w-11 items-center justify-center gap-1 rounded-full border px-2 text-micro font-bold tabular-nums text-foreground focus-visible:outline-none focus-visible:shadow-focus', TONE.warning.tint)}
        onClick={toggle}
      >
        <Icon name="lock" size={14} className={TONE.warning.text} />
        {texts.length}
      </button>
      {at
        ? createPortal(
            <div className="fixed inset-0 z-210" onClick={() => setAt(null)}>
              <section aria-label={label} className={cx(surface.panel, 'absolute grid gap-2 px-3 py-2.5')} style={at} onClick={(event) => event.stopPropagation()}>
                <p className="m-0 text-micro font-semibold text-muted">{label}</p>
                {texts.map((text, index) => (
                  <p key={index} className="m-0 text-body text-foreground">
                    {text}
                  </p>
                ))}
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
