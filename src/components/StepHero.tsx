import type { ReactNode } from 'react'

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

/** Encabezado compacto de cada vista: título + ayuda a pedido + acciones. */
export function StepHero({ title, help, side, sideVariant = 'actions' }: StepHeroProps) {
  return (
    <header className="step-hero">
      <div className="step-hero-title">
        <h2>{title}</h2>
        <InfoTip label={`Qué hace “${title}”`}>{help}</InfoTip>
      </div>
      {side ? (
        <div className="step-hero-side" data-variant={sideVariant}>
          {side}
        </div>
      ) : null}
    </header>
  )
}
