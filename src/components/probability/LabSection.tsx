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
  /** Una línea bajo el título que se ve siempre (con la sección abierta): qué dice el número de la sección. */
  description?: ReactNode
  actions?: ReactNode
  /** En el celular arranca plegada (con su resumen) o abierta; desde 768 px siempre está abierta. */
  defaultOpenOnMobile?: boolean
  /** `false`: nunca se pliega, tampoco en el celular (lo que explica el número va a la vista). */
  collapsible?: boolean
  className?: string
  children: ReactNode
}

/** El celular (el complemento de `md`): desde 768 px el Lab ya va en dos columnas y las secciones se ven enteras. */
const PHONE_MEDIA_QUERY = '(width < 768px)'

/** Una sección del Lab: título con su ícono y, en el celular, plegable (lo que no decide va plegado, con su resumen a la vista). */
export function LabSection({ title, icon, summary, description, actions, defaultOpenOnMobile = false, collapsible = true, className = '', children }: LabSectionProps) {
  const isMobile = useMediaQuery(PHONE_MEDIA_QUERY)
  const [isOpenOnMobile, setIsOpenOnMobile] = useState(defaultOpenOnMobile)
  const folds = collapsible && isMobile
  const isOpen = !folds || isOpenOnMobile
  const contentId = useId()

  return (
    <Card className={cx('grid', isOpen ? 'grid-rows-[auto_minmax(0,1fr)] gap-4' : 'gap-0', className)}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        {folds ? (
          <button
            type="button"
            className="flex min-h-10 pointer-coarse:min-h-11 flex-[1_1_100%] items-center justify-between gap-3 rounded-control text-left focus-visible:outline-none focus-visible:shadow-focus"
            aria-expanded={isOpen}
            aria-controls={contentId}
            onClick={() => setIsOpenOnMobile((current) => !current)}
          >
            <SectionHeading title={title} icon={icon} summary={isOpen ? description : summary} />
            <Icon name="chevron-down" size={18} className={cx('shrink-0 text-soft transition-transform duration-150', isOpen && 'rotate-180')} />
          </button>
        ) : (
          <SectionHeading title={title} icon={icon} summary={description} />
        )}
        {actions && isOpen ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>
      {isOpen ? (
        <div id={contentId} className="flex min-w-0 flex-col gap-4">
          {children}
        </div>
      ) : null}
    </Card>
  )
}

function SectionHeading({ title, icon, summary }: { title: string; icon?: IconName; summary?: ReactNode }) {
  return (
    <span className="flex min-w-0 items-start gap-3">
      {icon ? (
        <Icon name={icon} size={20} className="mt-0.5 shrink-0 text-foreground" />
      ) : null}
      <span className="grid min-w-0 gap-0.5">
        <strong className={sectionTitle}>{title}</strong>
        {summary ? <span className={cx(supportText, 'tabular-nums')}>{summary}</span> : null}
      </span>
    </span>
  )
}
