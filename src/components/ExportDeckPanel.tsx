import { useEffect, useMemo, useState } from 'react'

import { DECK_EXPORT_FILES, describeExportSelection, downloadYdk, type DeckExportSelection } from '../app/deck-image-export'
import { canvasToJpegBlob } from '../app/deck-image-export-download'
import { renderDeckAsCanvas } from '../app/deck-image-export-render'
import { buildKdeDecklistSections } from '../app/kde-decklist'
import type { DeckBuilderState } from '../app/model'
import { useToastMessage } from '../app/use-toast-message'
import { buildYdkeUrl } from '../app/ydke'
import { t } from '../i18n'
import type { DeckFormat } from '../types'
import { BackupActions } from './shell/BackupActions'
import { StepHero } from './StepHero'
import { StepPage } from './ui/StepPage'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { cx } from './ui/cx'
import { EmptyState } from './ui/EmptyState'
import { Icon } from './ui/Icon'
import { Modal } from './ui/Modal'
import { SectionHeader } from './ui/SectionHeader'
import { Skeleton } from './ui/Skeleton'
import { Switch } from './ui/Switch'
import { overline, textLink } from './ui/typography'

interface ExportDeckPanelProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  mainDeckCount: number
  onExport: (selection: DeckExportSelection) => Promise<void>
  /** Vuelve al builder: el botón de abajo del celular. */
  onBack?: () => void
}

/** La vista previa es chica: se dibuja a 1× y con menos calidad (el archivo descargado sigue a 2×). */
const PREVIEW_SCALE = 1
const PREVIEW_QUALITY = 0.8
const SELECTION_KEY = 'ygo-lab:export-selection'
const DEFAULT_SELECTION: DeckExportSelection = { image: true, pdf: true, ydk: true, txt: false, json: false }

/** Neuron no abre archivos: el deck entra por la base de datos oficial de Konami con esta extensión de la comunidad. */
const EXTENSION_LINKS = [
  { label: 'Chrome', href: 'https://chromewebstore.google.com/detail/deck-transfer-for-yu-gi-o/lgcpomfflpfipndmldmgblhpbnnfidgk' },
  { label: 'Firefox', href: 'https://addons.mozilla.org/firefox/addon/deck-transfer-for-master-duel/' },
  { labelKey: 'deck.export.neuron.sourceCode', href: 'https://github.com/DawnbrandBots/deck-transfer-for-master-duel' },
] as const
const KONAMI_DB_URL = 'https://www.db.yugioh-card.com/yugiohdb/?request_locale=en'
const STEP = 'grid content-start gap-2 rounded-card bg-tint/5 p-3'
const LINK = cx('inline-flex min-h-11 items-center', textLink)

/** Lo que se tildó la última vez: una comodidad, si no se puede leer se vuelve a todo tildado. */
function readSelection(): DeckExportSelection {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null') as Partial<Record<keyof DeckExportSelection, unknown>> | null

    return Object.fromEntries(
      DECK_EXPORT_FILES.map((file) => [file.key, typeof parsed?.[file.key] === 'boolean' ? parsed[file.key] : DEFAULT_SELECTION[file.key]]),
    ) as unknown as DeckExportSelection
  } catch {
    return DEFAULT_SELECTION
  }
}

/** "2026-10-12T10:00:00.000Z" → "12/10/2026" (en inglés, "10/12/2026"). */

function writeSelection(selection: DeckExportSelection) {
  try {
    localStorage.setItem(SELECTION_KEY, JSON.stringify(selection))
  } catch {
    // Si no se puede guardar, se vuelve a elegir la próxima vez.
  }
}

export function ExportDeckPanel({
  deckBuilder,
  deckFormat,
  mainDeckCount,
  onExport,
  onBack,
}: ExportDeckPanelProps) {
  const [busy, setBusy] = useState(false)
  const [downloadOpen, setDownloadOpen] = useState(false)
  const [selection, setSelection] = useState<DeckExportSelection>(readSelection)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const { showToast } = useToastMessage()
  const selectedCount = DECK_EXPORT_FILES.filter((file) => selection[file.key]).length
  const decklistSections = useMemo(() => {
    const sections = buildKdeDecklistSections(deckBuilder)
    const main = sections.filter((section) => ['monster', 'spell', 'trap'].includes(section.key))
    const zone = (key: string, label: string) => sections.find((section) => section.key === key) ?? { key, label, total: 0, entries: [] }

    return [
      { key: 'main', label: 'Main Deck', total: main.reduce((sum, section) => sum + section.total, 0), entries: main.flatMap((section) => section.entries) },
      zone('extra', 'Extra Deck'),
      zone('side', 'Side Deck'),
    ]
  }, [deckBuilder])

  useEffect(() => writeSelection(selection), [selection])

  const handleExport = async () => {
    setBusy(true)

    try {
      await onExport(selection)
      setDownloadOpen(false)
    } catch {
      // El controller maneja el toast de error.
    } finally {
      setBusy(false)
    }
  }

  const copyYdke = async () => {
    try {
      await navigator.clipboard.writeText(buildYdkeUrl(deckBuilder))
      showToast(t('deck.export.neuron.copied'), 'success')
    } catch {
      showToast(t('deck.export.neuron.copyFailed'), 'error')
    }
  }

  useEffect(() => {
    let disposed = false
    let objectUrl: string | null = null

    if (mainDeckCount === 0) {
      setImagePreviewUrl(null)
      setPreviewState('idle')
      return () => {
        disposed = true
      }
    }

    setPreviewState('loading')

    void (async () => {
      try {
        const blob = await canvasToJpegBlob(await renderDeckAsCanvas(deckBuilder, deckFormat, PREVIEW_SCALE), PREVIEW_QUALITY)

        if (disposed) {
          return
        }

        objectUrl = URL.createObjectURL(blob)
        setImagePreviewUrl(objectUrl)
        setPreviewState('ready')
      } catch {
        if (disposed) {
          return
        }

        setImagePreviewUrl(null)
        setPreviewState('error')
      }
    })()

    return () => {
      disposed = true

      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [deckBuilder, deckFormat, mainDeckCount])

  return (
    <StepPage as="article">
      <StepHero
        title={t('deck.export.title')}
        icon="download"
        subtitle={t('deck.export.subtitle')}
        side={(
          // Las opciones van en un modal: la página no las muestra de entrada.
          <Button variant="primary" size="md" icon="download" disabled={busy} className="max-[1100px]:hidden" onClick={() => setDownloadOpen(true)}>
            {busy ? t('deck.export.generating') : t('deck.export.download')}
          </Button>
        )}
      />

      <section className="grid min-w-0 gap-8 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] min-[1180px]:items-start min-[1180px]:gap-10">
        <article className="grid min-w-0 content-start gap-4">
          <SectionHeader icon="image" title={t('deck.export.image.title')} description={t('deck.export.image.description')} />
          {mainDeckCount > 0 ? (
            <p className={cx('m-0', overline)}>
              {t('deck.export.preview.label', { name: deckBuilder.deckName.trim() || t('deck.export.preview.unnamed'), main: deckBuilder.main.length, extra: deckBuilder.extra.length, side: deckBuilder.side.length })}
            </p>
          ) : null}

          {previewState === 'ready' && imagePreviewUrl ? (
            <img
              src={imagePreviewUrl}
              alt={t('deck.export.image.alt')}
              className="pointer-events-none block h-auto w-full select-none rounded-card ring-1 ring-border-subtle"
              draggable={false}
            />
          ) : previewState === 'loading' ? (
            <Skeleton radius="panel" className="aspect-[0.74] w-full" />
          ) : (
            <EmptyState icon="image" title={previewState === 'error' ? t('deck.export.preview.errorTitle') : t('deck.export.preview.emptyTitle')}>
              {previewState === 'error' ? t('deck.export.preview.errorText') : t('deck.export.preview.emptyText')}
            </EmptyState>
          )}
        </article>

        <article className="grid min-w-0 content-start gap-4 min-[1180px]:border-l min-[1180px]:border-border-subtle min-[1180px]:pl-10">
          <SectionHeader
            icon="file"
            title={t('deck.export.pdf.title')}
            description={t('deck.export.pdf.description')}
          />

          <div className="grid gap-3">
            {decklistSections
              .filter((section) => section.total > 0)
              .map((section) => (
                // Cada zona se pliega por separado; arrancan todas abiertas.
                <details key={section.key} open className="group grid gap-1">
                  <summary
                    className={cx(
                      'm-0 flex cursor-pointer list-none items-baseline justify-between gap-2 rounded-control border-b border-border-subtle pb-1.5 pointer-coarse:min-h-11 pointer-coarse:items-center focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden',
                      overline,
                    )}
                  >
                    <span className="text-foreground">{section.label}</span>
                    <span className="flex items-center gap-2 tabular-nums">
                      {section.total}
                      <Icon name="chevron-down" size={16} className="shrink-0 text-soft transition-transform duration-200 group-open:rotate-180" />
                    </span>
                  </summary>
                  <ul className="m-0 grid list-none gap-0.5 p-0 text-body">
                    {section.entries.map((entry) => (
                      <li key={entry.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1.5">
                        <span className="text-muted text-right tabular-nums">{entry.count}</span>
                        <span className="truncate text-foreground">{entry.name}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
          </div>
        </article>
      </section>

      {/* Neuron no importa archivos ni links: el deck entra por la base de datos oficial, con una extensión del navegador. */}
      <Card as="section" padding="md" aria-label={t('deck.export.neuron.title')} className="grid gap-4">
        <SectionHeader
          icon="upload"
          title={t('deck.export.neuron.title')}
          description={t('deck.export.neuron.description')}
        />
        <ol className="m-0 grid list-none gap-3 p-0 min-[700px]:grid-cols-3">
          <li className={STEP}>
            <span className={overline}>{t('deck.export.neuron.step1')}</span>
            <strong className="text-body font-semibold text-foreground">{t('deck.export.neuron.install')}</strong>
            <p className="m-0 text-micro text-muted">{t('deck.export.neuron.installHint')}</p>
            <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-body">
              {EXTENSION_LINKS.map((link) => (
                <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className={LINK}>
                  {'labelKey' in link ? t(link.labelKey) : link.label}
                </a>
              ))}
            </p>
          </li>
          <li className={STEP}>
            <span className={overline}>{t('deck.export.neuron.step2')}</span>
            <strong className="text-body font-semibold text-foreground">{t('deck.export.neuron.copyTitle')}</strong>
            <p className="m-0 text-micro text-muted">{t('deck.export.neuron.copyHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="link" disabled={mainDeckCount === 0} onClick={() => void copyYdke()}>
                {t('deck.export.neuron.copyLink')}
              </Button>
              <Button size="sm" variant="tertiary" icon="download" disabled={mainDeckCount === 0} onClick={() => downloadYdk(deckBuilder)}>
                {t('deck.export.neuron.downloadYdk')}
              </Button>
            </div>
          </li>
          <li className={STEP}>
            <span className={overline}>{t('deck.export.neuron.step3')}</span>
            <strong className="text-body font-semibold text-foreground">{t('deck.export.neuron.importTitle')}</strong>
            <p className="m-0 text-micro text-muted">{t('deck.export.neuron.importHint')}</p>
            <p className="m-0 text-body">
              <a href={KONAMI_DB_URL} target="_blank" rel="noreferrer" className={LINK}>
                {t('deck.export.neuron.openDb')}
              </a>
            </p>
          </li>
        </ol>
      </Card>

      {/* Todo lo guardado en este navegador, en un archivo: para otro navegador o para después de borrar los datos. */}
      <Card as="section" padding="md" aria-label={t('deck.backup.title')} className="grid gap-4">
        <SectionHeader
          icon="save"
          title={t('deck.backup.title')}
          description={t('deck.backup.description')}
          actions={<BackupActions />}
        />
      </Card>

      {/* Qué archivos bajar: se tilda lo que hace falta y el botón descarga sólo eso. */}
      <Modal
        isOpen={downloadOpen}
        onClose={() => {
          if (!busy) {
            setDownloadOpen(false)
          }
        }}
        size="sm"
        icon="download"
        title={t('deck.export.modal.title')}
        subtitle={t('deck.export.modal.subtitle')}
        footer={
          <>
            <Button variant="tertiary" size="sm" disabled={busy} onClick={() => setDownloadOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="download"
              disabled={busy || mainDeckCount === 0 || selectedCount === 0}
              title={mainDeckCount === 0 ? t('deck.export.modal.needsMain') : selectedCount === 0 ? t('deck.export.modal.pickOne') : undefined}
              onClick={() => {
                void handleExport()
              }}
            >
              {busy
                ? t('deck.export.generating')
                : selectedCount === 0
                  ? t('deck.export.modal.choose')
                  : selectedCount === DECK_EXPORT_FILES.length
                    ? t('deck.export.modal.downloadAll')
                    : t('deck.export.modal.downloadSome', { files: describeExportSelection(selection) })}
            </Button>
          </>
        }
      >
        <div className="grid gap-1">
          {mainDeckCount === 0 ? <p className="m-0 px-2 pb-2 text-body text-warning-soft">{t('deck.export.modal.emptyHint')}</p> : null}
          {/* Todo o lo que se elija: un toque marca o desmarca todos los archivos. */}
          <Button
            variant="tertiary"
            size="sm"
            className="justify-self-start"
            onClick={() => setSelection(Object.fromEntries(DECK_EXPORT_FILES.map((file) => [file.key, selectedCount < DECK_EXPORT_FILES.length])) as unknown as DeckExportSelection)}
          >
            {selectedCount === DECK_EXPORT_FILES.length ? t('deck.export.modal.selectNone') : t('deck.export.modal.selectAll')}
          </Button>
          {DECK_EXPORT_FILES.map((file) => (
            <label key={file.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-control px-2 py-2 transition-colors hover:bg-tint/5">
              <span className="grid min-w-0 gap-0.5">
                <span className="text-body font-medium text-foreground">{file.label}</span>
                <span className="text-micro text-muted">{file.description}</span>
              </span>
              <Switch checked={selection[file.key]} label={file.label} onChange={(checked) => setSelection((current) => ({ ...current, [file.key]: checked }))} />
            </label>
          ))}
        </div>
      </Modal>

      {/* En el celular, abajo y al alcance del pulgar: volver al deck y descargar (la principal, a la derecha). */}
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 -mx-gutter -mb-6 flex gap-2 border-t border-border-subtle bg-background px-gutter py-3 min-[1101px]:hidden">
        {onBack ? (
          <Button variant="secondary" size="md" className="min-w-0 flex-1" onClick={onBack}>
            {t('deck.export.back')}
          </Button>
        ) : null}
        <Button variant="primary" size="md" icon="download" className="min-w-0 flex-1" disabled={busy || mainDeckCount === 0} onClick={() => setDownloadOpen(true)}>
          {busy ? t('deck.export.generating') : t('deck.export.download')}
        </Button>
      </div>
    </StepPage>
  )
}
