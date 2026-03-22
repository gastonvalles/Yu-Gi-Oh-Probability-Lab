import type { ReactNode } from 'react'

interface StepHeroProps {
  step: string
  pill: string
  title: string
  description: string
  side?: ReactNode
  sideClassName?: string
  sideVariant?: 'card' | 'inline'
}

export function StepHero({
  step,
  pill,
  title,
  description,
  side,
  sideClassName = '',
  sideVariant = 'card',
}: StepHeroProps) {
  return (
    <div className="step-hero grid gap-3 p-3">
      <div
        className={[
          'grid items-start gap-3',
          side ? 'min-[920px]:grid-cols-[minmax(0,1fr)_320px]' : '',
        ].join(' ').trim()}
      >
        <div className="min-w-0 self-center">
          <div className="flex flex-wrap items-center gap-2">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">{step}</p>
            <span className="step-hero-pill px-2 py-[0.22rem] text-[0.68rem] font-semibold uppercase tracking-[0.08em]">
              {pill}
            </span>
          </div>
          <h2 className="m-[0.32rem_0_0] text-[1.2rem] leading-none">{title}</h2>
          <p className="app-muted m-[0.42rem_0_0] max-w-[72ch] text-[0.82rem] leading-[1.28]">
            {description}
          </p>
        </div>

        {side ? (
          <div
            className={[
              sideVariant === 'card'
                ? 'step-hero-sidecard grid gap-1.5 p-2.5'
                : 'flex items-center justify-end self-center',
              sideClassName,
            ].join(' ').trim()}
          >
            {side}
          </div>
        ) : null}
      </div>
    </div>
  )
}
