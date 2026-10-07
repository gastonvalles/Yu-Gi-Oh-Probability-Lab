import { useId, useState, type ReactNode } from 'react'

import { useMediaQuery } from '../../app/use-media-query'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { sectionTitle, supportText } from '../ui/typography'

interface LabSectionProps {
  title: string
  icon?: IconName
  /** Resumen visible también con la sección colapsada (mobile). */
  summary?: ReactNode
  actions?: ReactNode
  /** En mobile arranca abierta o colapsada; en desktop siempre está abierta. */
  defaultOpenOnMobile?: boolean
  className?: string
  children: ReactNode
}

export function LabSection({ title, icon, summary, actions, defaultOpenOnMobile = true, className = '', children }: LabSectionProps) {
  const isMobile = useMediaQuery('(max-width: 1100px)')
  const [isOpenOnMobile, setIsOpenOnMobile] = useState(defaultOpenOnMobile)
  const isOpen = !isMobile || isOpenOnMobile
  const contentId = useId()

  return (
    <Card className={cx('grid', isOpen ? 'gap-4' : 'gap-0', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        {isMobile ? (
          <button
            type="button"
            className="flex min-h-10 flex-[1_1_100%] items-center justify-between gap-3 rounded-control text-left focus-visible:outline-none focus-visible:shadow-focus"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setIsOpenOnMobile((current) => !current)}
          >
            <SectionHeading title={title} icon={icon} summary={summary} />
            <Icon name="chevron-down" size={18} className={cx('shrink-0 text-soft transition-transform duration-150', isOpen && 'rotate-180')} />
          </button>
        ) : (
          <SectionHeading title={title} icon={icon} summary={summary} />
        )}
        {actions && isOpen ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      {isOpen ? (
        <div id={contentId} className="grid min-w-0 gap-4">
          {children}
        </div>
      ) : null}
    </Card>
  )
}

function SectionHeading({ title, icon, summary }: { title: string; icon?: IconName; summary?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      {icon ? (
        <span className="grid size-8 shrink-0 place-items-center rounded-control border border-border-subtle bg-white/5 text-muted">
          <Icon name={icon} size={16} />
        </span>
      ) : null}
      <span className="grid min-w-0 gap-0.5">
        <strong className={sectionTitle}>{title}</strong>
        {summary ? <span className={cx(supportText, 'tabular-nums')}>{summary}</span> : null}
      </span>
    </span>
  )
}
