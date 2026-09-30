import { useEffect, useMemo, useState } from 'react'

import { canvasToJpegBlob } from '../app/deck-image-export-download'
import { renderDeckAsCanvas } from '../app/deck-image-export-render'
import { buildKdeDecklistSections } from '../app/kde-decklist'
import type { DeckBuilderState } from '../app/model'
import type { DeckFormat } from '../types'
import { StepHero } from './StepHero'
import { Button } from './ui/Button'
import { Skeleton } from './ui/Skeleton'

interface ExportDeckPanelProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  deckName: string
  mainDeckCount: number
  onExport: () => Promise<void>
}

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
        const blob = await canvasToJpegBlob(await renderDeckAsCanvas(deckBuilder, deckFormat))

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
    <article className="surface-panel deck-mobile-step-shell grid h-full min-h-0 gap-3 p-0 min-[1101px]:gap-3 min-[1101px]:p-2.5 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
      <StepHero
        title="Exportá tu deck"
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
        <article className="surface-panel-soft grid min-h-0 gap-2.5 overflow-hidden p-3 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Imagen del deck</p>
            <p className="app-muted m-0 text-[0.76rem] leading-[1.18]">
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
                <p className="app-muted m-0 max-w-md text-[0.8rem] leading-[1.2]">
                  {previewState === 'error'
                    ? 'No pude generar la vista previa de la imagen.'
                    : 'Agregá cartas al Main Deck para habilitar la preview.'}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="surface-panel-soft grid min-h-0 gap-2.5 overflow-hidden p-3 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Decklist oficial (PDF)</p>
            <p className="app-muted m-0 text-[0.76rem] leading-[1.18]">
              Planilla de Konami para torneos, lista para imprimir. Completá tus datos antes de entregarla.
            </p>
          </div>

          <div className="min-h-80 overflow-y-auto overflow-x-hidden min-[1180px]:min-h-0">
            <div className="grid gap-3">
              {decklistSections
                .filter((section) => section.total > 0)
                .map((section) => (
                  <section key={section.key} className="grid gap-1">
                    <h3 className="m-0 flex items-baseline justify-between gap-2 border-b border-(--border-subtle) pb-1 text-[0.76rem] font-semibold uppercase tracking-wider text-(--text-main)">
                      <span>{section.label}</span>
                      <span className="app-muted tabular-nums">{section.total}</span>
                    </h3>
                    <ul className="m-0 grid list-none gap-0.5 p-0 text-[0.8rem] leading-[1.3]">
                      {section.entries.map((entry) => (
                        <li key={entry.name} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-1.5">
                          <span className="app-muted text-right tabular-nums">{entry.count}</span>
                          <span className="truncate text-(--text-main)">{entry.name}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
            </div>
          </div>
        </article>
      </section>
    </article>
  )
}
