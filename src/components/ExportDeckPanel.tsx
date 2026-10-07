import { useEffect, useMemo, useState } from 'react'

import { canvasToJpegBlob } from '../app/deck-image-export-download'
import { renderDeckAsCanvas } from '../app/deck-image-export-render'
import { buildKdeDecklistSections } from '../app/kde-decklist'
import type { DeckBuilderState } from '../app/model'
import type { DeckFormat } from '../types'
import { StepHero } from './StepHero'
import { StepPage } from './ui/StepPage'
import { Button } from './ui/Button'
import { Skeleton } from './ui/Skeleton'
import { surface } from './ui/surfaces'

interface ExportDeckPanelProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  deckName: string
  mainDeckCount: number
  onExport: () => Promise<void>
}

/** La vista previa es chica: se dibuja a 1× y con menos calidad (el archivo descargado sigue a 2×). */
const PREVIEW_SCALE = 1
const PREVIEW_QUALITY = 0.8

export function ExportDeckPanel({
  deckBuilder,
  deckFormat,
  deckName,
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
        subtitle="Imagen, lista de texto, YDK o planilla de torneo."
        help={`Descargá ${deckName.trim() || 'tu deck'} como imagen, lista de texto, .ydk o planilla de torneo (KDE), sin moverte del workflow.`}
        side={(
          <Button
            variant="primary"
            size="md"
            disabled={busy || mainDeckCount === 0}
            onClick={() => {
              void handleExport()
            }}
          >
            {busy ? 'Generando archivos...' : 'Descargar Deck'}
          </Button>
        )}
      />

      <section className="grid min-h-0 gap-3 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <article className={`${surface.panelSoft} grid min-h-0 gap-2.5 overflow-hidden p-3 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]`}>
          <div className="grid gap-1">
            <p className="text-accent m-0 text-micro uppercase tracking-widest">Imagen del deck</p>
            <p className="text-muted m-0 text-caption">
              Se descarga en alta resolución (JPG) para compartir.
            </p>
          </div>

          <div className="min-h-80 overflow-y-auto overflow-x-hidden min-[1180px]:min-h-0">
            {previewState === 'ready' && imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="Vista previa de la imagen del deck"
                className="pointer-events-none block h-auto w-full select-none"
                draggable={false}
              />
            ) : previewState === 'loading' ? (
              <div className="grid gap-2 p-2" aria-hidden="true">
                <Skeleton radius="panel" className="h-10 w-[42%]" />
                <Skeleton radius="none" className="aspect-[0.74] w-full" />
                <div className="grid grid-cols-4 gap-2">
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                  <Skeleton radius="none" className="aspect-[0.72] w-full" />
                </div>
              </div>
            ) : (
              <div className="grid h-full place-items-center text-center">
                <p className="text-muted m-0 max-w-md text-small">
                  {previewState === 'error'
                    ? 'No pude generar la vista previa de la imagen.'
                    : 'Agregá cartas al Main Deck para habilitar la preview.'}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className={`${surface.panelSoft} grid min-h-0 gap-2.5 overflow-hidden p-3 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]`}>
          <div className="grid gap-1">
            <p className="text-accent m-0 text-micro uppercase tracking-widest">Decklist oficial (PDF)</p>
            <p className="text-muted m-0 text-caption">
              Planilla de Konami para torneos, lista para imprimir. Completá tus datos antes de entregarla.
            </p>
          </div>

          <div className="min-h-80 overflow-y-auto overflow-x-hidden min-[1180px]:min-h-0">
            <div className="grid gap-3">
              {decklistSections
                .filter((section) => section.total > 0)
                .map((section) => (
                  <section key={section.key} className="grid gap-1">
                    <h3 className="m-0 flex items-baseline justify-between gap-2 border-b border-border-subtle pb-1 text-caption font-semibold uppercase tracking-wider text-foreground">
                      <span>{section.label}</span>
                      <span className="text-muted tabular-nums">{section.total}</span>
                    </h3>
                    <ul className="m-0 grid list-none gap-0.5 p-0 text-small">
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
          </div>
        </article>
      </section>
    </StepPage>
  )
}
