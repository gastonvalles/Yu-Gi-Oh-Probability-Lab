import { useEffect, useMemo, useState } from 'react'

import { DECK_EXPORT_FILES, describeExportSelection, type DeckExportSelection } from '../app/deck-image-export'
import { canvasToJpegBlob } from '../app/deck-image-export-download'
import { renderDeckAsCanvas } from '../app/deck-image-export-render'
import { buildKdeDecklistSections } from '../app/kde-decklist'
import type { DeckBuilderState } from '../app/model'
import type { DeckFormat } from '../types'
import { StepHero } from './StepHero'
import { StepPage } from './ui/StepPage'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { cx } from './ui/cx'
import { EmptyState } from './ui/EmptyState'
import { Icon } from './ui/Icon'
import { SectionHeader } from './ui/SectionHeader'
import { Skeleton } from './ui/Skeleton'
import { Switch } from './ui/Switch'
import { overline } from './ui/typography'

interface ExportDeckPanelProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  mainDeckCount: number
  onExport: (selection: DeckExportSelection) => Promise<void>
}

/** La vista previa es chica: se dibuja a 1× y con menos calidad (el archivo descargado sigue a 2×). */
const PREVIEW_SCALE = 1
const PREVIEW_QUALITY = 0.8
const SELECTION_KEY = 'ygo-lab:export-selection'
const DEFAULT_SELECTION: DeckExportSelection = { image: true, pdf: true, ydk: true }

/** Lo que se tildó la última vez: una comodidad, si no se puede leer se vuelve a todo tildado. */
function readSelection(): DeckExportSelection {
  try {
    const parsed = JSON.parse(localStorage.getItem(SELECTION_KEY) ?? 'null') as Partial<Record<keyof DeckExportSelection, unknown>> | null

    return {
      image: typeof parsed?.image === 'boolean' ? parsed.image : true,
      pdf: typeof parsed?.pdf === 'boolean' ? parsed.pdf : true,
      ydk: typeof parsed?.ydk === 'boolean' ? parsed.ydk : true,
    }
  } catch {
    return DEFAULT_SELECTION
  }
}

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
}: ExportDeckPanelProps) {
  const [busy, setBusy] = useState(false)
  const [selection, setSelection] = useState<DeckExportSelection>(readSelection)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
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
    } catch {
      // El controller maneja el toast de error.
    } finally {
      setBusy(false)
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
        title="Exportá tu deck"
        icon="download"
        side={(
          <Button
            variant="primary"
            size="md"
            icon="download"
            disabled={busy || mainDeckCount === 0 || selectedCount === 0}
            title={selectedCount === 0 ? 'Tildá al menos un archivo' : undefined}
            onClick={() => {
              void handleExport()
            }}
          >
            {busy ? 'Generando archivos...' : selectedCount === 0 ? 'Elegí qué descargar' : `Descargar ${selectedCount === DECK_EXPORT_FILES.length ? 'todo' : describeExportSelection(selection)}`}
          </Button>
        )}
      />

      {/* Qué archivos bajar: se tilda lo que hace falta y el botón descarga sólo eso. */}
      <Card as="section" padding="sm" aria-label="Archivos a descargar" className="grid gap-1 min-[700px]:grid-cols-3 min-[700px]:gap-2">
        {DECK_EXPORT_FILES.map((file) => (
          <label key={file.key} className="flex cursor-pointer items-center justify-between gap-3 rounded-control px-2 py-2 transition-colors hover:bg-tint/5">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-medium text-foreground">{file.label}</span>
              <span className="text-micro text-muted">{file.description}</span>
            </span>
            <Switch checked={selection[file.key]} label={file.label} onChange={(checked) => setSelection((current) => ({ ...current, [file.key]: checked }))} />
          </label>
        ))}
      </Card>

      <section className="grid min-w-0 gap-8 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)] min-[1180px]:items-start min-[1180px]:gap-10">
        <article className="grid min-w-0 content-start gap-4">
          <SectionHeader icon="image" title="Imagen del deck" description="JPG en alta resolución." />

          {previewState === 'ready' && imagePreviewUrl ? (
            <img
              src={imagePreviewUrl}
              alt="Vista previa de la imagen del deck"
              className="pointer-events-none block h-auto w-full select-none rounded-card ring-1 ring-border-subtle"
              draggable={false}
            />
          ) : previewState === 'loading' ? (
            <Skeleton radius="panel" className="aspect-[0.74] w-full" />
          ) : (
            <EmptyState icon="image" title={previewState === 'error' ? 'No pude generar la vista previa' : 'Todavía no hay vista previa'}>
              {previewState === 'error'
                ? 'No pude generar la vista previa de la imagen.'
                : 'Agregá cartas al Main Deck para habilitar la vista previa.'}
            </EmptyState>
          )}
        </article>

        <article className="grid min-w-0 content-start gap-4 min-[1180px]:border-l min-[1180px]:border-border-subtle min-[1180px]:pl-10">
          <SectionHeader
            icon="file"
            title="Decklist oficial (PDF)"
            description="Planilla de Konami para torneos. Completá tus datos antes de entregarla."
          />

          <div className="grid gap-3">
            {decklistSections
              .filter((section) => section.total > 0)
              .map((section) => (
                // Cada zona se pliega por separado; arrancan todas abiertas.
                <details key={section.key} open className="group grid gap-1">
                  <summary
                    className={cx(
                      'm-0 flex cursor-pointer list-none items-baseline justify-between gap-2 rounded-control border-b border-border-subtle pb-1.5 focus-visible:outline-none focus-visible:shadow-focus [&::-webkit-details-marker]:hidden',
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
    </StepPage>
  )
}
