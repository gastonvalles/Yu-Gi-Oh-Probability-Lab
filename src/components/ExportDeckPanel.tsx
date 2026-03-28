import { useState } from 'react'

import { StepHero } from './StepHero'
import { Button } from './ui/Button'

interface ExportDeckPanelProps {
  deckName: string
  deckFormatLabel: string
  mainDeckCount: number
  extraDeckCount: number
  sideDeckCount: number
  totalCardCount: number
  onExport: () => Promise<void>
}

function ExportStatCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'accent'
}) {
  return (
    <article
      className={[
        'grid gap-1 rounded-none border px-3 py-3',
        tone === 'accent'
          ? 'border-(--primary) bg-[rgb(var(--primary-rgb)/0.12)]'
          : 'border-(--border-subtle) bg-[rgb(var(--card-background-rgb)/0.86)]',
      ].join(' ')}
    >
      <span className="app-soft text-[0.68rem] uppercase tracking-widest">{label}</span>
      <strong className="text-[1.05rem] leading-none text-(--text-main)">{value}</strong>
    </article>
  )
}

export function ExportDeckPanel({
  deckName,
  deckFormatLabel,
  mainDeckCount,
  extraDeckCount,
  sideDeckCount,
  totalCardCount,
  onExport,
}: ExportDeckPanelProps) {
  const [busy, setBusy] = useState(false)
  const hasDeck = totalCardCount > 0

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

  return (
    <article className="surface-panel grid h-full min-h-0 gap-3 p-2.5 min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
      <StepHero
        step="Paso 4"
        pill="Export"
        title="Exportá tu deck"
        description="Cuando ya tengas la lista armada, podés descargar una imagen del deck y un TXT con Main, Extra y Side en nombres en inglés."
      />

      <div className="grid gap-3 min-[1180px]:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="surface-panel-soft grid gap-3 p-3 min-[1180px]:min-h-[420px] min-[1180px]:grid-rows-[auto_auto_1fr]">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Resumen del deck</p>
            <h3 className="m-0 text-[1.1rem] leading-none">
              {deckName.trim() || 'Deck sin nombre'}
            </h3>
            <p className="app-muted m-0 text-[0.78rem] leading-[1.2]">
              Formato activo: {deckFormatLabel}. La exportación genera una imagen del deck y un TXT con la lista en inglés.
            </p>
          </div>

          <div className="grid gap-2 min-[860px]:grid-cols-2 min-[1420px]:grid-cols-4">
            <ExportStatCard label="Main Deck" value={`${mainDeckCount}`} tone="accent" />
            <ExportStatCard label="Extra Deck" value={`${extraDeckCount}`} />
            <ExportStatCard label="Side Deck" value={`${sideDeckCount}`} />
            <ExportStatCard label="Total" value={`${totalCardCount}`} />
          </div>

          <div className="grid content-start gap-2 min-[1320px]:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
            <article className="surface-panel-strong grid gap-2.5 p-3">
              <div className="grid gap-1">
                <strong className="text-[0.95rem] leading-none text-(--text-main)">
                  Salida preparada para compartir
                </strong>
                <p className="app-muted m-0 text-[0.76rem] leading-[1.18]">
                  El deck exporta una preview visual y un TXT con Main, Extra y Side. Todo sale desde el mismo estado que usaste en builder, categorización y laboratorio.
                </p>
              </div>

              <div className="grid gap-2 min-[760px]:grid-cols-2">
                <div className="surface-card grid gap-1 px-2.5 py-2.5">
                  <span className="app-soft text-[0.68rem] uppercase tracking-widest">Archivo 1</span>
                  <strong className="text-[0.88rem] leading-none text-(--text-main)">Imagen del deck</strong>
                  <p className="app-muted m-0 text-[0.74rem] leading-[1.16]">
                    Útil para compartir la lista completa de un vistazo.
                  </p>
                </div>

                <div className="surface-card grid gap-1 px-2.5 py-2.5">
                  <span className="app-soft text-[0.68rem] uppercase tracking-widest">Archivo 2</span>
                  <strong className="text-[0.88rem] leading-none text-(--text-main)">TXT en inglés</strong>
                  <p className="app-muted m-0 text-[0.74rem] leading-[1.16]">
                    Listo para copiar, guardar o reutilizar fuera de la app.
                  </p>
                </div>
              </div>
            </article>

            <article className="surface-card grid content-start gap-2.5 p-3">
              <span className="app-soft text-[0.68rem] uppercase tracking-widest">Checklist</span>
              <div className="grid gap-2">
                <div className="flex items-start gap-2">
                  <span className="builder-status-dot shrink-0" />
                  <div className="grid gap-0.5">
                    <strong className="text-[0.82rem] leading-none text-(--text-main)">Mismo estado del deck</strong>
                    <p className="app-muted m-0 text-[0.72rem] leading-[1.16]">
                      No hay una copia aparte para exportar.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="builder-status-dot shrink-0" />
                  <div className="grid gap-0.5">
                    <strong className="text-[0.82rem] leading-none text-(--text-main)">Formato actual</strong>
                    <p className="app-muted m-0 text-[0.72rem] leading-[1.16]">
                      La exportación usa el formato seleccionado en el builder.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <span className="builder-status-dot shrink-0" />
                  <div className="grid gap-0.5">
                    <strong className="text-[0.82rem] leading-none text-(--text-main)">Deck listo</strong>
                    <p className="app-muted m-0 text-[0.72rem] leading-[1.16]">
                      {hasDeck ? 'Hay cartas cargadas para descargar ahora.' : 'Todavía no hay cartas cargadas.'}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </section>

        <aside className="surface-panel-strong grid content-start gap-3 p-3 min-[1180px]:sticky min-[1180px]:top-0 min-[1180px]:self-start">
          <div className="grid gap-1">
            <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Acción principal</p>
            <h3 className="m-0 text-[1.05rem] leading-none">Descargar archivos</h3>
            <p className="app-muted m-0 text-[0.76rem] leading-[1.18]">
              Generá la exportación final sin salir del workflow.
            </p>
          </div>

          <Button
            variant="primary"
            size="lg"
            disabled={busy || mainDeckCount === 0}
            onClick={() => {
              void handleExport()
            }}
          >
            {busy ? 'Generando archivos...' : 'Descargar Deck'}
          </Button>

          <div className="surface-card grid gap-1.5 px-2.5 py-2.5">
            <span className="app-soft text-[0.68rem] uppercase tracking-widest">Estado</span>
            <strong className="text-[0.9rem] leading-none text-(--text-main)">
              {hasDeck ? 'Listo para exportar' : 'Esperando cartas'}
            </strong>
            <p className="app-muted m-0 text-[0.74rem] leading-[1.16]">
              {hasDeck
                ? `Main ${mainDeckCount} · Extra ${extraDeckCount} · Side ${sideDeckCount}`
                : 'Volvé al Deck Builder y cargá cartas para habilitar la descarga.'}
            </p>
          </div>
        </aside>
      </div>
    </article>
  )
}
