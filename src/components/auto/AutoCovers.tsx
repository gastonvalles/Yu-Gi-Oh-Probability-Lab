import type { AutoSnapshot } from '../../app/auto/auto-session'
import { setAutoPref } from '../../app/auto-prefs'
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
 * Lo que no deja jugar: cartas sin reglas (con la lista, y «Jugar en modo manual»), o el núcleo que no arrancó o se cayó («Reintentar»). El duelo por enlace la usa sin `onRetry`
 * (no hay nada que reintentar: sólo volver) y con su `title` (el duelo se perdió o se cortó).
 */
export function FaultCover({ fault, title: titleText, nameOf, artOf, onRetry, onExit }: { fault: NonNullable<AutoSnapshot['fault']>; title?: string; nameOf: (code: number) => string; artOf: (code: number) => string | null; onRetry?: () => void; onExit: () => void }) {
  const rules = fault.kind === 'rules'
  const title = titleText ?? (rules ? t('auto.fault.rules', { count: fault.cards.length }) : fault.kind === 'crash' ? t('auto.fault.crash') : t('auto.fault.setup'))
  const text = rules ? t('auto.fault.rulesText') : fault.message

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
        <div className="flex justify-end gap-2">
          {/* Sin nada que reintentar, salir es lo único que queda: va como la principal. */}
          <Button variant={onRetry ? 'tertiary' : 'primary'} onClick={onExit}>
            {t('auto.fault.back')}
          </Button>
          {!onRetry ? null : rules ? (
            <Button variant="primary" onClick={() => setAutoPref('duel', false)}>
              {t('auto.fault.manual')}
            </Button>
          ) : (
            <Button variant="primary" icon="refresh" onClick={onRetry}>
              {t('auto.fault.retry')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
