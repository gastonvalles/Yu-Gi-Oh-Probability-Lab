import type { ReactNode } from 'react'

interface StepHeroProps {
  step: string
  title: string
  description: string
  side?: ReactNode
  sideClassName?: string
  sideVariant?: 'card' | 'inline'
  variant?: 'default' | 'compact'
}

export function StepHero({
  step,
  title,
  description,
  side,
  sideClassName = '',
  sideVariant = 'card',
  variant = 'default',
}: StepHeroProps) {
  return (
    <div className={['step-hero grid', variant === 'compact' ? 'gap-2.5 p-2.5' : 'gap-3 p-3'].join(' ')}>
      <div
        className={[
          'grid items-start',
          variant === 'compact' ? 'gap-2.5' : 'gap-3',
          side
            ? variant === 'compact'
              ? 'min-[1101px]:grid-cols-[minmax(0,1fr)_420px]'
              : 'min-[920px]:grid-cols-[minmax(0,1fr)_320px]'
            : '',
        ].join(' ').trim()}
        >
        <div className="min-w-0 self-center">
          <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">{step}</p>
          <h2
            className={[
              variant === 'compact'
                ? 'm-[0.24rem_0_0] text-[1.06rem] leading-none min-[1101px]:text-[1.14rem]'
                : 'm-[0.32rem_0_0] text-[1.2rem] leading-none',
            ].join(' ')}
          >
            {title}
          </h2>
          <p
            className={[
              'app-muted max-w-[72ch]',
              variant === 'compact'
                ? 'm-[0.3rem_0_0] text-[0.78rem] leading-[1.22]'
                : 'm-[0.42rem_0_0] text-[0.82rem] leading-[1.28]',
            ].join(' ')}
          >
            {description}
          </p>
        </div>

        {side ? (
          <div
            className={[
              sideVariant === 'card'
                ? variant === 'compact'
                  ? 'step-hero-sidecard grid gap-1.5 p-2'
                  : 'step-hero-sidecard grid gap-1.5 p-2.5'
                : 'step-hero-inline-action flex items-center justify-end self-center max-[1100px]:w-full max-[1100px]:justify-stretch',
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
