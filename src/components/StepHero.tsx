import type { ReactNode } from 'react'

import { variants } from './ui/cx'
import { InfoTip } from './ui/InfoTip'

interface StepHeroProps {
  /** Qué hacés en esta vista, en pocas palabras (p. ej. "Armá tu deck"). */
  title: string
  /** Explicación larga: se ve sólo si la pedís con el ícono "i". */
  help: ReactNode
  side?: ReactNode
  /** 'form': la parte lateral es un formulario (se ordena en dos columnas en mobile). */
  sideVariant?: 'actions' | 'form'
}

const sideStyle = variants({
  base: 'min-w-0 gap-2',
  variants: {
    variant: {
      actions: 'flex flex-wrap items-center justify-end max-[1100px]:w-full max-[1100px]:justify-stretch max-[1100px]:[&>button]:flex-1',
      // Formulario (nombre y formato del deck + acciones): dos columnas compactas.
      form: 'grid w-full grid-cols-2 gap-[0.45rem]',
    },
  },
  defaults: { variant: 'actions' },
})

/** Encabezado compacto de cada vista: título + ayuda a pedido + acciones. */
export function StepHero({ title, help, side, sideVariant = 'actions' }: StepHeroProps) {
  return (
    <header className="relative flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-[0.6rem] p-0 min-[1101px]:px-1 min-[1101px]:py-[0.2rem]">
      <div className="flex min-w-0 items-center gap-2">
        <h2 className="m-0 text-heading text-foreground">{title}</h2>
        {/* La ayuda se ancla al encabezado (no al ícono): nunca se sale de pantalla. */}
        <InfoTip label={`Qué hace “${title}”`} anchor="parent">
          {help}
        </InfoTip>
      </div>
      {side ? <div className={sideStyle({ variant: sideVariant })}>{side}</div> : null}
    </header>
  )
}
