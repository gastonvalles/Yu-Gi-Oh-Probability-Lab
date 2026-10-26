import { DATA_UNAVAILABLE } from '../../app/auto/auto-data'
import type { AutoSnapshot } from '../../app/auto/auto-session'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { CloseButton } from '../ui/IconButton'
import { Skeleton } from '../ui/Skeleton'

/**
 * La portada de carga: el progreso de las reglas y, detrás, la mesa ya repartida (sin brillo animado: el esqueleto quieto). Abajo, qué hace el rival (`rival`: el de handtraps);
 * `note` lo reemplaza (el duelo por enlace no lleva nada: `null`).
 */
export function LoadingCover({ progress, rival = false, note }: { progress: AutoSnapshot['progress']; rival?: boolean; note?: string | null }) {
  const line = note !== undefined ? note : rival ? t('auto.rival.handtraps') : t('auto.rival.passive')

  return (
    <div role="status" aria-busy="true" className="grid h-full place-items-center bg-background/85 p-6">
      <div className="grid w-full max-w-xs justify-items-center gap-3 text-center">
        <Callout tone="info">{progress.total === 0 ? t('auto.loading.start') : t('auto.loading.rules', progress)}</Callout>
        <Skeleton still className="h-40 w-full" />
        {line ? <p className="m-0 text-micro text-soft">{line}</p> : null}
      </div>
    </div>
  )
}

/**
 * Lo que no deja jugar: cartas sin reglas (con la lista, y «Jugar en modo manual»: una mano nueva), o el núcleo que no arrancó, se cayó o se trabó («Reintentar», con `onUndo` «Volver
 * a antes de tu última jugada» y, con `onManual`, «Seguir en modo manual» desde la última jugada buena). El texto es uno por clase de falla: el detalle técnico (`fault.message`)
 * queda en la consola. El duelo por enlace la usa sin `onRetry` (no hay nada que reintentar: sólo volver) y con su `title` (el duelo se perdió o se cortó), que ya lo dice todo.
 */
export function FaultCover({ fault, title: titleText, nameOf, artOf, onRetry, onUndo, onManual, onExit }: { fault: NonNullable<AutoSnapshot['fault']>; title?: string; nameOf: (code: number) => string; artOf: (code: number) => string | null; onRetry?: () => void; onUndo?: () => void; onManual?: () => void; onExit: () => void }) {
  const rules = fault.kind === 'rules'
  const title = titleText ?? (rules ? t('auto.fault.rules', { count: fault.cards.length }) : fault.kind === 'crash' ? t('auto.fault.crash') : fault.kind === 'retry' ? t('auto.fault.stuck') : t('auto.fault.setup'))
  const text = rules
    ? t('auto.fault.rulesText')
    : titleText !== undefined
      ? null
      : fault.kind === 'crash'
        ? t('auto.fault.crashText')
        : fault.kind === 'retry'
          ? t('auto.fault.stuckText')
          : fault.message === DATA_UNAVAILABLE
            ? t('auto.fault.unavailable')
            : t('auto.fault.setupText')

  return (
    <div role="alertdialog" aria-modal="true" aria-label={title} className="relative grid h-full place-items-center overflow-y-auto bg-background/85 p-6">
      <CloseButton size="md" aria-label={t('duel.bar.leave')} title={t('duel.bar.leave')} className="absolute right-3 top-3" onClick={onExit} />
      <div className="grid w-full max-w-sm gap-3">
        <Callout tone="warning">{title}</Callout>
        {text ? <p className="m-0 text-body text-muted">{text}</p> : null}
        {rules ? (
          <ul className="m-0 grid max-h-60 list-none gap-1 overflow-y-auto p-0">
            {fault.cards.map((code) => (
              <li key={code} className="flex items-center gap-2 text-body text-foreground">
                <span aria-hidden="true" className="aspect-[421/614] w-7 shrink-0 overflow-hidden bg-input">
                  <CardArt remoteUrl={artOf(code)} name={nameOf(code)} className="block h-full w-full object-cover" />
                </span>
                <span className="min-w-0 truncate">{nameOf(code)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          {/* Sin nada que reintentar, salir es lo único que queda: va como la principal. */}
          <Button variant={onRetry ? 'tertiary' : 'primary'} onClick={onExit}>
            {t('auto.fault.back')}
          </Button>
          {onRetry && onManual && !rules ? (
            <Button variant="secondary" icon="hand" onClick={onManual}>
              {t('auto.bar.manual')}
            </Button>
          ) : null}
          {!onRetry ? null : rules ? (
            onManual ? (
              <Button variant="primary" onClick={onManual}>
                {t('auto.fault.manual')}
              </Button>
            ) : null
          ) : (
            // Con a dónde volver, volver es la principal: reintentar empieza desde el turno 1.
            <Button variant={onUndo ? 'secondary' : 'primary'} icon="refresh" onClick={onRetry}>
              {t('auto.fault.retry')}
            </Button>
          )}
          {onUndo ? (
            <Button variant="primary" icon="undo" onClick={onUndo}>
              {t('auto.fault.undo')}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
