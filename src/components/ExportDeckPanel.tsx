import { useEffect, useMemo, useState } from 'react'

import { canvasToJpegBlob } from '../app/deck-image-export-download'
import { renderDeckAsCanvas } from '../app/deck-image-export-render'
import { buildKdeDecklistSections } from '../app/kde-decklist'
import type { DeckBuilderState } from '../app/model'
import type { DeckFormat } from '../types'
import { StepHero } from './StepHero'
import { StepPage } from './ui/StepPage'
import { Button } from './ui/Button'
import { cx } from './ui/cx'
import { EmptyState } from './ui/EmptyState'
import { SectionHeader } from './ui/SectionHeader'
import { Skeleton } from './ui/Skeleton'
import { overline } from './ui/typography'

interface ExportDeckPanelProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  mainDeckCount: number
  onExport: () => Promise<void>
}

/** La vista previa es chica: se dibuja a 1× y con menos calidad (el archivo descargado sigue a 2×). */
const PREVIEW_SCALE = 1
const PREVIEW_QUALITY = 0.8

export function ExportDeckPanel({
  deckBuilder,
  deckFormat,
  mainDeckCount,
  onExport,
}: ExportDeckPanelProps) {
  const [busy, setBusy] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const decklistSections = useMemo(() => buildKdeDecklistSections(deckBuilder), [deckBuilder])

  const handleExport = async () => {
    setBusy(true)

    try {
      await onExport()
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
            disabled={busy || mainDeckCount === 0}
            onClick={() => {
              void handleExport()
            }}
          >
            {busy ? 'Generando archivos...' : 'Descargar Deck'}
          </Button>
        )}
      />

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
                : 'Agregá cartas al Main Deck para habilitar la preview.'}
            </EmptyState>
          )}
        </article>

        <article className="grid min-w-0 content-start gap-4 min-[1180px]:border-l min-[1180px]:border-border-subtle min-[1180px]:pl-10">
          <SectionHeader
            icon="file"
            title="Decklist oficial (PDF)"
            description="Planilla de Konami para torneos. Completá tus datos antes de entregarla."
          />

          <div className="grid gap-5">
            {decklistSections
              .filter((section) => section.total > 0)
              .map((section) => (
                <section key={section.key} className="grid gap-1">
                  <h3 className={cx('m-0 flex items-baseline justify-between gap-2 border-b border-border-subtle pb-1.5', overline)}>
                    <span className="text-foreground">{section.label}</span>
                    <span className="tabular-nums">{section.total}</span>
                  </h3>
                  <ul className="m-0 grid list-none gap-0.5 p-0 text-body">
                    {section.entries.map((entry) => (
                      <li key={entry.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1.5">
                        <span className="text-muted text-right tabular-nums">{entry.count}</span>
                        <span className="truncate text-foreground">{entry.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          </div>
        </article>
      </section>
    </StepPage>
  )
}
