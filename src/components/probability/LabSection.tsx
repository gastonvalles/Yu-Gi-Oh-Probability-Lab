import { useId, useState, type ReactNode } from 'react'

import { useMediaQuery } from '../../app/use-media-query'

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
    <section className={`lab-section ${className}`} data-open={isOpen ? 'true' : 'false'}>
      <header className="lab-section-header">
        {isMobile ? (
          <button
            type="button"
            className="lab-section-toggle"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setIsOpenOnMobile((current) => !current)}
          >
            <SectionHeading title={title} summary={summary} />
            <span className="lab-section-chevron" aria-hidden="true" />
          </button>
        ) : (
          <SectionHeading title={title} summary={summary} />
        )}
        {actions && isOpen ? <div className="lab-section-actions">{actions}</div> : null}
      </header>
      {isOpen ? (
        <div id={contentId} className="lab-section-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}

function SectionHeading({ title, summary }: { title: string; summary?: ReactNode }) {
  return (
    <span className="lab-section-heading">
      <strong className="lab-section-title">{title}</strong>
      {summary ? <span className="lab-section-summary">{summary}</span> : null}
    </span>
  )
}
