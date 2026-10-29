import { useRef, useState } from 'react'

import { MAX_LINK_LENGTH, MAX_REPLAY_FILE, linkFits, readShared, type SavedReplay, type SharedRead } from '../../app/duel-replay-share'
import { showToastMessage } from '../../app/use-toast-message'
import { formatDay, t } from '../../i18n'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { OverflowMenu } from '../ui/OverflowMenu'
import { surface } from '../ui/surfaces'
import { cx } from '../ui/cx'
import { replayResultText, titleOf } from './duel-replay-text'

/**
 * «Tus duelos»: los replays guardados en este navegador, en una tarjeta con una fila por duelo (la fila lo abre; el ⋯ copia el enlace —si entra—, baja el archivo o lo borra,
 * con confirmación), y arriba «Abrir archivo» y pegar un enlace: un solo lector para lo que sea (`readShared`: un duelo se mira acá; un combo, en la mesa).
 */
interface YourDuelsProps {
  items: readonly SavedReplay[]
  onOpen: (item: SavedReplay) => void
  onCopyLink: (item: SavedReplay) => void
  onDownload: (item: SavedReplay) => void
  onDelete: (item: SavedReplay) => void
  onImport: (result: SharedRead) => void
}

/** El texto de un archivo elegido, sin pasar el tope. */
export async function readSharedFile(file: File): Promise<SharedRead> {
  return file.size > MAX_REPLAY_FILE ? { ok: false, error: 'tooBig' } : readShared(await file.text().catch(() => ''))
}

export function YourDuels({ items, onOpen, onCopyLink, onDownload, onDelete, onImport }: YourDuelsProps) {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [deleting, setDeleting] = useState<SavedReplay | null>(null)
  const paste = async () => {
    let text: string
    try {
      text = await navigator.clipboard.readText()
    } catch {
      showToastMessage(t('meta.duels.pasteFailed'), 'warning')
      return
    }
    onImport(await readShared(text))
  }

  return (
    <section id="your-duels" aria-labelledby="your-duels-title" className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 flex-1 basis-64 gap-1">
          <Heading level="section" id="your-duels-title">
            {t('meta.duels.title')}
          </Heading>
          <p className="m-0 text-body text-muted">{t('meta.duels.subtitle')}</p>
        </div>
        {/* Pegar el enlace es el ícono; abrir el archivo, el botón con su nombre (como en los combos). */}
        <div className="flex items-center gap-1">
          <IconButton tone="ghost" size="sm" aria-label={t('meta.duels.paste')} title={t('meta.duels.paste')} onClick={() => void paste()}>
            <Icon name="link" />
          </IconButton>
          <Button variant="secondary" size="sm" icon="upload" onClick={() => fileRef.current?.click()}>
            {t('meta.duels.open')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label={t('meta.duels.open')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void readSharedFile(file).then(onImport)
              // Elegir el mismo archivo otra vez también lo abre.
              event.target.value = ''
            }}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className={cx(surface.card, 'min-w-0 p-4')}>
          <EmptyState icon="play" title={t('meta.duels.empty')}>
            {t('meta.duels.emptyHint')}
          </EmptyState>
        </div>
      ) : (
        <ul aria-label={t('meta.duels.listLabel')} className={cx(surface.card, 'm-0 grid min-w-0 list-none divide-y divide-border-subtle px-4')}>
          {items.map((item) => {
            const title = titleOf(item)
            const facts = [formatDay(item.savedAt), t('meta.duels.plays', { count: item.steps }), replayResultText(item), ...(item.view === 'mine' ? [t('meta.duels.handIncluded')] : [])].join(' · ')

            return (
              <li key={item.id} className="flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  aria-label={t('meta.duels.watch', { title })}
                  className="-mx-2 flex min-h-16 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-control px-2 py-3 text-left transition-colors duration-150 hover:bg-tint/7 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none"
                  onClick={() => onOpen(item)}
                >
                  <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-tint/14 text-white">
                    <Icon name="play" size={20} variant="bulk" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className="truncate text-body font-semibold text-foreground">{title}</span>
                    <span className="line-clamp-2 text-micro text-muted tabular-nums">{facts}</span>
                  </span>
                </button>
                <OverflowMenu
                  label={t('meta.duels.more', { title })}
                  className="-mr-2 shrink-0"
                  items={[
                    ...(linkFits(item.payload, MAX_LINK_LENGTH) ? [{ label: t('meta.duels.copyLink'), icon: 'link' as const, onSelect: () => onCopyLink(item) }] : []),
                    { label: t('meta.duels.download'), icon: 'download', onSelect: () => onDownload(item) },
                    { label: t('meta.duels.delete'), icon: 'trash', tone: 'danger', onSelect: () => setDeleting(item) },
                  ]}
                />
              </li>
            )
          })}
        </ul>
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        title={deleting ? t('meta.duels.deleteTitle', { title: titleOf(deleting) }) : ''}
        description={t('meta.duels.deleteBody')}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('meta.duels.delete')}
        confirmColor="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onDelete(deleting)
          setDeleting(null)
        }}
      />
    </section>
  )
}
