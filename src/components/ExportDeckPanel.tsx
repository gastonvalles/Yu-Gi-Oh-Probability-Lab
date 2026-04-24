import { useEffect, useMemo, useState } from 'react'

import { buildDecklistText } from '../app/deck-image-export'
import { renderDeckAsCanvas } from '../app/deck-image-export-render'
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
  const textPreview = useMemo(() => buildDecklistText(deckBuilder), [deckBuilder])

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
        const canvas = await renderDeckAsCanvas(deckBuilder, deckFormat)

        if (disposed) {
          return
        }

        setImagePreviewUrl(canvas.toDataURL('image/png'))
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
    }
  }, [deckBuilder, deckFormat, mainDeckCount])

  return (
    <article className="surface-panel deck-mobile-step-shell grid h-full min-h-0 gap-2.5 p-0 min-[1101px]:gap-3 min-[1101px]:p-2.5 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
      <StepHero
        step="Descargá tu deck"
        title="Exportá tu deck"
        description={`Generá la salida final de ${deckName.trim() || 'tu deck'} sin moverte del workflow.`}
        variant="compact"
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
        sideVariant="inline"
      />

      <section className="grid min-h-0 gap-3 min-[1180px]:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <article className="surface-panel-soft grid min-h-0 gap-2.5 overflow-hidden p-3 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Preview PNG</p>
            <p className="app-muted m-0 text-[0.76rem] leading-[1.18]">
              Vista previa estática de la imagen que se va a descargar.
            </p>
          </div>

          <div className="min-h-80 overflow-y-auto overflow-x-hidden min-[1180px]:min-h-0">
            {previewState === 'ready' && imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="Vista previa del PNG del deck"
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
                    ? 'No pude generar la preview del PNG.'
                    : 'Agregá cartas al Main Deck para habilitar la preview.'}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="surface-panel-soft grid min-h-0 gap-2.5 overflow-hidden p-3 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Preview TXT</p>
            <p className="app-muted m-0 text-[0.76rem] leading-[1.18]">
              Vista previa estática del archivo de texto exportado.
            </p>
          </div>

          <div className="min-h-80 overflow-y-auto overflow-x-hidden min-[1180px]:min-h-0">
            <pre className="pointer-events-none m-0 min-h-full text-[0.76rem] leading-[1.36] whitespace-pre-wrap wrap-break-word text-(--text-main) select-none">
              {textPreview}
            </pre>
          </div>
        </article>
      </section>
    </article>
  )
}
