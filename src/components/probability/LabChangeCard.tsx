import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { DraftLine } from '../../app/build-draft'
import { getCardRoleDefinition } from '../../app/deck-groups'
import { mainRole } from '../../app/lab-change'
import type { LabDraft } from '../../app/use-lab-draft'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { CloseButton } from '../ui/IconButton'
import { supportText } from '../ui/typography'

interface ChangeActions {
  /** La X o «Descartar»: vuelve a tu deck de verdad. */
  onDiscard: () => void
  /** «Comparar»: abre Comparar con A = tu deck y B = con el cambio. */
  onCompare: () => void
  /** «Aplicar al deck»: la principal. */
  onApply: () => void
}

interface LabChangeCardProps extends ChangeActions {
  lines: LabDraft['lines']
  /** En el celular las acciones van en la barra fija de abajo (`LabChangeBar`); desde 768 px, abajo en la tarjeta (número + acción). */
  actionsInCard: boolean
  /** Recién tocado «Probar el cambio» (o «Deshacer»): el botón que se tocó ya no está y el foco pasa acá, al título, en vez de perderse. */
  autoFocus?: boolean
  className?: string
}

/**
 * «Estás probando un cambio»: ocupa el lugar de «Lo que más te frena» mientras todo el Lab mide tu deck con el cambio. Dice que no se guarda nada, las dos cartas
 * (rectas, con cuántas quedan) y, en escritorio, las tres acciones. El borde ámbar es el de la build B de Comparar: es tu deck con el cambio.
 */
export function LabChangeCard({ lines, actionsInCard, autoFocus = false, onDiscard, onCompare, onApply, className }: LabChangeCardProps) {
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (autoFocus) {
      headerRef.current?.focus()
    }
  }, [autoFocus])

  return (
    <Card tone="info" padding="lg" aria-label={t('lab.change.label')} className={cx('flex flex-col gap-3', className)}>
      <header ref={headerRef} tabIndex={-1} className="grid gap-1 outline-none">
        <Heading level="kicker" as="h2">
          {t('lab.change.overline')}
        </Heading>
        <p className={supportText}>{t('lab.change.body')}</p>
      </header>

      {lines ? (
        <ul className="m-0 grid list-none divide-y divide-border-subtle p-0">
          <ChangeLine action="remove" line={lines.out} />
          <ChangeLine action="add" line={lines.in} />
        </ul>
      ) : null}

      {actionsInCard ? <LabChangeActions onDiscard={onDiscard} onCompare={onCompare} onApply={onApply} /> : null}
    </Card>
  )
}

interface LabChangeStaleProps {
  problem: NonNullable<LabDraft['problem']>
  onDiscard: () => void
  className?: string
}

/** Tu deck cambió y el cambio ya no se puede aplicar: lo dice con el motivo y ofrece descartarlo (no se pierde en silencio; si volvés a dejar el deck como estaba, vuelve solo). */
export function LabChangeStale({ problem, onDiscard, className }: LabChangeStaleProps) {
  return (
    <Card padding="lg" aria-label={t('lab.change.label')} className={cx('flex flex-col gap-3', className)}>
      <Heading level="kicker" as="h2">
        {t('lab.change.overline')}
      </Heading>
      <Callout tone="warning" title={t('lab.change.stale.title')}>
        {problem.reason === 'missing-card' ? t('lab.change.stale.missingCard') : problem.issue}
      </Callout>
      {/* Abajo y a la derecha, como la acción de las demás tarjetas (al costado del aviso, en el celular, el texto quedaba en una columna de una palabra). */}
      <div className="mt-auto flex justify-end">
        <Button variant="secondary" onClick={onDiscard}>
          {t('lab.change.discardLabel')}
        </Button>
      </div>
    </Card>
  )
}

/** Las tres acciones: lo que descarta, lo alternativo y, al final, la principal. `compact` es la barra del celular (la X y «Comparar», corto). */
export function LabChangeActions({ compact = false, onDiscard, onCompare, onApply }: ChangeActions & { compact?: boolean }) {
  return compact ? (
    <div className="flex items-center gap-2">
      <CloseButton aria-label={t('lab.change.discardLabel')} title={t('lab.change.discardLabel')} onClick={onDiscard} />
      <Button variant="secondary" onClick={onCompare}>
        {t('lab.change.compare')}
      </Button>
      <Button variant="primary" className="flex-1" onClick={onApply}>
        {t('lab.change.apply')}
      </Button>
    </div>
  ) : (
    <div className="mt-auto flex flex-wrap items-center justify-end gap-2">
      <Button variant="tertiary" onClick={onDiscard}>
        {t('lab.change.discard')}
      </Button>
      <Button variant="secondary" onClick={onCompare}>
        {t('lab.suggestion.compare')}
      </Button>
      <Button variant="primary" onClick={onApply}>
        {t('lab.change.apply')}
      </Button>
    </div>
  )
}

/**
 * En el celular las acciones quedan fijas abajo, sobre la barra del armazón (al alcance del pulgar), como «Falta un paso para medir». Va al `body`: los bloques de la
 * pantalla entran con un `transform` (`stagger`) y un `fixed` adentro se correría. Debajo de la barra del armazón (`z-40`) y de su hoja (`z-150`).
 */
export function LabChangeBar(props: ChangeActions) {
  return createPortal(
    <div role="group" aria-label={t('lab.change.label')} className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-border-subtle bg-background px-gutter py-3">
      <LabChangeActions compact {...props} />
    </div>,
    document.body,
  )
}

/** Una carta del cambio: recta, «Sacar 1 Dominus Impulse» y debajo su rol y cuántas quedan; el −1 / +1 a la derecha. */
function ChangeLine({ action, line }: { action: 'remove' | 'add'; line: DraftLine }) {
  const remove = action === 'remove'
  const role = mainRole(line.card.roles)
  const roleLabel = role ? getCardRoleDefinition(role).label : t('rules.suggestion.fillerCard')

  return (
    <li className="grid min-h-14 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-1">
      <span className="block w-8">
        <CardArt remoteUrl={line.card.apiCard.imageUrlSmall} name={line.card.name} className="block aspect-[421/614] w-full object-cover" />
      </span>
      <span className="grid min-w-0">
        <strong className="min-w-0 truncate text-body font-semibold text-foreground">
          {t(remove ? 'lab.suggestion.removeVerb' : 'lab.suggestion.addVerb')} {line.card.name}
        </strong>
        <span className="text-body text-muted">{t(remove ? 'lab.change.out' : 'lab.change.in', { role: roleLabel, count: line.after, n: formatInteger(line.after) })}</span>
      </span>
      <Badge tone={remove ? 'danger' : 'success'} shape="tag" size="sm">
        {remove ? '−1' : '+1'}
      </Badge>
    </li>
  )
}
