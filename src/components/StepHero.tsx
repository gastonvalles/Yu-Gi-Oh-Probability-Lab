import type { ReactNode } from 'react'

import { t } from '../i18n'

import { Heading } from './ui/Heading'
import { cx, variants } from './ui/cx'
import { Icon, type IconName } from './ui/Icon'
import { InfoTip } from './ui/InfoTip'
import { supportText } from './ui/typography'

interface StepHeroProps {
  /** Qué hacés en esta vista, en pocas palabras (p. ej. "Armá tu deck"). */
  title: string
  /** Ícono del paso (el mismo de la navegación). */
  icon: IconName
  /** Una línea que dice para qué sirve la vista (sólo desktop: en mobile manda el título). */
  subtitle?: string
  /** Explicación larga: se ve sólo si la pedís con el ícono "i". Sólo donde dice algo que no se ve en otro lado. */
  help?: ReactNode
  /** Un botón chico pegado al título (p. ej. el de la guía): no se estira ni baja de renglón en mobile como `side`. */
  titleAction?: ReactNode
  side?: ReactNode
  /** 'form': la parte lateral es un formulario (se ordena en dos columnas en mobile). */
  sideVariant?: 'actions' | 'form'
}

const sideStyle = variants({
  base: 'min-w-0 gap-2',
  variants: {
    variant: {
      actions: 'flex flex-wrap items-center justify-end max-[1101px]:w-full max-[1101px]:justify-stretch max-[1101px]:[&>button]:flex-1',
      // Formulario (nombre y formato del deck): el nombre se queda con el ancho que sobra y el formato con uno fijo.
      form: 'grid w-full grid-cols-[minmax(0,1fr)_8.5rem] gap-2',
    },
  },
  defaults: { variant: 'actions' },
})

/** Encabezado de cada vista: ícono + título + una línea de contexto + ayuda a pedido + acciones. */
export function StepHero({ title, icon, subtitle, help, titleAction, side, sideVariant = 'actions' }: StepHeroProps) {
  return (
    <header className="relative z-20 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        <Icon name={icon} size={28} className="shrink-0 text-foreground" />
        <div className="grid min-w-0">
          {/* Alto fijo del renglón del título (el de la ayuda o el botón de al lado): el título no sube ni baja de una pestaña a otra. */}
          <div className="flex min-h-8 min-w-0 items-center gap-1">
            <Heading level="page" className="truncate">
              {title}
            </Heading>
            {/* La ayuda se ancla al encabezado (no al ícono): nunca se sale de pantalla. */}
            {help ? (
              <InfoTip label={t('shell.stepHero.help', { title })} anchor="parent">
                {help}
              </InfoTip>
            ) : null}
            {/* El botón de al lado mide 44 px en táctil: sobresale, centrado, en vez de agrandar el renglón y bajar el título. */}
            {titleAction ? <span className="-my-1.5 inline-flex shrink-0">{titleAction}</span> : null}
          </div>
          {subtitle ? <p className={cx(supportText, 'max-[1101px]:hidden')}>{subtitle}</p> : null}
        </div>
      </div>
      {side ? <div className={sideStyle({ variant: sideVariant })}>{side}</div> : null}
    </header>
  )
}
