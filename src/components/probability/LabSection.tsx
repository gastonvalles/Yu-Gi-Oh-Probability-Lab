import { useId, useState, type ReactNode } from 'react'

import { useMediaQuery } from '../../app/use-media-query'
import { cx } from '../ui/cx'

interface LabSectionProps {
  title: string
  /** Resumen visible también con la sección colapsada (mobile). */
  summary?: ReactNode
  actions?: ReactNode
  /** En mobile arranca abierta o colapsada; en desktop siempre está abierta. */
  defaultOpenOnMobile?: boolean
  className?: string
  children: ReactNode
}

export function LabSection({
  title,
  summary,
  actions,
  defaultOpenOnMobile = true,
  className = '',
  children,
}: LabSectionProps) {
  const isMobile = useMediaQuery('(max-width: 1100px)')
  const [isOpenOnMobile, setIsOpenOnMobile] = useState(defaultOpenOnMobile)
  const isOpen = !isMobile || isOpenOnMobile
  const contentId = useId()

  return (
    <section
      className={cx(
        'grid min-w-0 rounded-card border border-border bg-linear-to-b from-card-background/94 to-background/98 px-4 py-[0.95rem]',
        isOpen ? 'gap-3' : 'gap-0',
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        {isMobile ? (
          <button
            type="button"
            className="flex min-h-9 flex-[1_1_100%] items-center justify-between gap-3 text-left"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setIsOpenOnMobile((current) => !current)}
          >
            <SectionHeading title={title} summary={summary} />
            <span
              className={cx(
                'size-[0.55rem] flex-none border-b-2 border-r-2 border-muted transition-transform duration-150',
                isOpen ? '[transform:rotate(-135deg)_translateY(-2px)]' : '[transform:rotate(45deg)_translateY(-2px)]',
              )}
              aria-hidden="true"
            />
          </button>
        ) : (
          <SectionHeading title={title} summary={summary} />
        )}
        {actions && isOpen ? <div className="flex flex-wrap gap-[0.4rem]">{actions}</div> : null}
      </header>
      {isOpen ? (
        <div id={contentId} className="grid min-w-0 gap-3">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function SectionHeading({ title, summary }: { title: string; summary?: ReactNode }) {
  return (
    <span className="grid min-w-0 gap-[0.15rem]">
      <strong className="text-lead text-foreground">{title}</strong>
      {summary ? <span className="text-caption tabular-nums text-muted">{summary}</span> : null}
    </span>
  )
}
