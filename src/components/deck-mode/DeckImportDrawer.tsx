import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react'

import {
  buildDeckImportPreview,
  buildDeckImportPreviewFromJson,
  buildDeckImportPreviewFromYdk,
  getDeckImportFileKind,
  type DeckImportConflict,
  type DeckImportPreview,
  type ImportedDeckEntry,
  type ImportedDeckInvalidLine,
  type ResolvedImportedDeckEntry,
} from '../../app/deck-import'
import type { DeckBuilderState, DeckZone } from '../../app/model'
import { formatInteger } from '../../app/utils'
import type { DeckFormat } from '../../types'
import { loadCardCatalog } from '../../ygoprodeck'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'

interface DeckImportDrawerProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  isOpen: boolean
  onApplyImport: (nextDeckBuilder: DeckBuilderState) => void
  onClose: () => void
}

const FILE_ACCEPT = '.txt,.json,.ydk,application/json,text/plain'

export function DeckImportDrawer({
  deckBuilder,
  deckFormat,
  isOpen,
  onApplyImport,
  onClose,
}: DeckImportDrawerProps) {
  const [inputValue, setInputValue] = useState('')
  const [preview, setPreview] = useState<DeckImportPreview | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [manualFallbackOpen, setManualFallbackOpen] = useState(false)
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const currentDeckCardCount =
    deckBuilder.main.length + deckBuilder.extra.length + deckBuilder.side.length
  const hasExistingDeck = currentDeckCardCount > 0
  const canApplyPreview = Boolean(preview && preview.importedCardCount > 0)
  const applyButtonLabel = hasExistingDeck ? 'Reemplazar deck actual' : 'Importar al builder'

  useEffect(() => {
    if (!isOpen) {
      setInputValue('')
      setPreview(null)
      setFormError(null)
      setIsProcessing(false)
      setIsReplaceConfirmOpen(false)
      setIsDragActive(false)
      setManualFallbackOpen(false)
      setSelectedFileName(null)
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const handlePreviewResult = (nextPreview: DeckImportPreview, options?: { emptyMessage?: string }) => {
    setPreview(nextPreview)

    if (nextPreview.parsedEntries.length === 0) {
      setFormError(options?.emptyMessage ?? 'No pude detectar cartas importables en la entrada cargada.')
      return
    }

    if (nextPreview.importedCardCount === 0) {
      setFormError('No pude resolver ninguna carta para cargarla al deck actual.')
      return
    }

    setFormError(null)
  }

  const processManualText = async () => {
    const trimmedValue = inputValue.trim()

    if (trimmedValue.length === 0) {
      setPreview(null)
      setFormError('Pegá una lista de cartas si querés usar el fallback manual.')
      return
    }

    setFormError(null)
    setIsProcessing(true)

    try {
      const cards = await loadCardCatalog()
      const nextPreview = buildDeckImportPreview({
        cards,
        deckFormat,
        deckName: deckBuilder.deckName,
        text: trimmedValue,
        source: {
          kind: 'text',
          label: 'Texto pegado manualmente',
        },
      })

      handlePreviewResult(nextPreview, {
        emptyMessage: 'No pude detectar una lista válida en el texto pegado.',
      })
    } catch (error) {
      setPreview(null)
      setFormError(error instanceof Error ? error.message : 'No pude procesar el texto pegado.')
    } finally {
      setIsProcessing(false)
    }
  }

  const processFile = async (file: File) => {
    const fileKind = getDeckImportFileKind(file.name)

    if (!fileKind) {
      setPreview(null)
      setFormError('Formato no soportado. Usá un archivo .txt, .json o .ydk.')
      return
    }

    setFormError(null)
    setIsProcessing(true)
    setSelectedFileName(file.name)

    try {
      const fileText = await file.text()
      let nextPreview: DeckImportPreview

      if (fileKind === 'json') {
        nextPreview = buildDeckImportPreviewFromJson({
          deckName: deckBuilder.deckName,
          text: fileText,
          source: {
            kind: 'json',
            fileName: file.name,
            label: `Archivo JSON: ${file.name}`,
          },
        })
      } else {
        const cards = await loadCardCatalog()

        nextPreview =
          fileKind === 'ydk'
            ? buildDeckImportPreviewFromYdk({
                cards,
                deckFormat,
                deckName: deckBuilder.deckName,
                text: fileText,
                source: {
                  kind: 'ydk',
                  fileName: file.name,
                  label: `Archivo YDK: ${file.name}`,
                },
              })
            : buildDeckImportPreview({
                cards,
                deckFormat,
                deckName: deckBuilder.deckName,
                text: fileText,
                source: {
                  kind: 'txt',
                  fileName: file.name,
                  label: `Archivo TXT: ${file.name}`,
                },
              })
      }

      handlePreviewResult(nextPreview, {
        emptyMessage: 'El archivo no contiene cartas importables.',
      })
    } catch (error) {
      setPreview(null)
      setFormError(error instanceof Error ? error.message : 'No pude leer el archivo seleccionado.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setIsReplaceConfirmOpen(false)
    onClose()
  }

  const applyImport = () => {
    if (!preview || preview.importedCardCount === 0) {
      return
    }

    onApplyImport(preview.importedDeck)
    handleClose()
  }

  const handleApplyClick = () => {
    if (!preview || preview.importedCardCount === 0) {
      return
    }

    if (hasExistingDeck) {
      setIsReplaceConfirmOpen(true)
      return
    }

    applyImport()
  }

  const handleChooseFileClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    event.target.value = ''

    if (!file) {
      return
    }

    void processFile(file)
  }

  const handleDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragActive(false)
    const file = event.dataTransfer.files?.[0] ?? null

    if (!file) {
      return
    }

    void processFile(file)
  }

  return (
    <>
      <div className="fixed inset-0 z-[150]">
        <button
          type="button"
          aria-label="Cerrar importador"
          className="absolute inset-0 h-full w-full bg-[rgb(var(--background-rgb)/0.7)]"
          onClick={handleClose}
        />

        <aside
          className={[
            'surface-panel absolute right-0 top-0 grid h-[100dvh] w-full grid-rows-[auto_minmax(0,1fr)] gap-0 border-l border-(--border-subtle) p-0 shadow-[-28px_0_54px_rgba(0,0,0,0.38)]',
            preview ? 'max-w-[62rem]' : 'max-w-[46rem]',
          ].join(' ')}
        >
          <div className="grid gap-2 border-b border-(--border-subtle) px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Importacion de deck</p>
                <h3 className="m-[0.18rem_0_0] text-[1.05rem] leading-none text-(--text-main)">
                  Subir archivo y previsualizar antes de reemplazar
                </h3>
                <p className="app-muted m-[0.35rem_0_0] max-w-[52ch] text-[0.78rem] leading-[1.16]">
                  El camino principal es archivo. Soporta el TXT exportado por la app, JSON serializado del proyecto y YDK. Pegar texto manual queda como alternativa secundaria.
                </p>
              </div>

              <button
                type="button"
                className="app-icon-button text-[1rem] leading-none"
                aria-label="Cerrar importador"
                onClick={handleClose}
              >
                ×
              </button>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-4 py-4">
            <div
              className={[
                'grid gap-4',
                preview ? 'min-[980px]:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]' : '',
              ].join(' ').trim()}
            >
              <section className="grid gap-3 self-start">
                <article className="surface-card grid gap-3 px-3 py-3">
                  <div className="grid gap-0.5">
                    <small className="app-muted text-[0.68rem] uppercase tracking-widest">Archivo</small>
                    <strong className="text-[0.96rem] text-(--text-main)">Subí o arrastrá el deck</strong>
                    <p className="app-muted m-0 text-[0.76rem] leading-[1.16]">
                      Round-trip directo con el TXT que genera el Paso 4. También podés cargar `.json` y `.ydk`.
                    </p>
                  </div>

                  <div
                    className={[
                      'grid gap-3 border border-dashed px-4 py-5 text-center transition-colors',
                      isDragActive
                        ? 'border-(--primary) bg-[rgb(var(--primary-rgb)/0.12)]'
                        : 'border-(--border-subtle) bg-[rgb(var(--background-rgb)/0.4)]',
                    ].join(' ')}
                    onDragEnter={(event) => {
                      event.preventDefault()
                      setIsDragActive(true)
                    }}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setIsDragActive(true)
                    }}
                    onDragLeave={(event) => {
                      event.preventDefault()
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        return
                      }
                      setIsDragActive(false)
                    }}
                    onDrop={handleDrop}
                  >
                    <div className="grid gap-1">
                      <strong className="text-[0.9rem] text-(--text-main)">Arrastrá el archivo acá</strong>
                      <p className="app-muted m-0 text-[0.74rem] leading-[1.14]">
                        o elegilo manualmente para procesarlo y ver el preview.
                      </p>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2">
                      <Button variant="primary" size="sm" onClick={handleChooseFileClick} disabled={isProcessing}>
                        {isProcessing ? 'Procesando...' : 'Seleccionar archivo'}
                      </Button>
                    </div>

                    <div className="flex flex-wrap justify-center gap-1.5">
                      <span className="app-chip px-2 py-1 text-[0.7rem]">.txt</span>
                      <span className="app-chip px-2 py-1 text-[0.7rem]">.json</span>
                      <span className="app-chip px-2 py-1 text-[0.7rem]">.ydk</span>
                    </div>

                    {selectedFileName ? (
                      <span className="app-chip-accent justify-self-center px-2 py-1 text-[0.72rem]">
                        Archivo seleccionado: {selectedFileName}
                      </span>
                    ) : null}

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={FILE_ACCEPT}
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                  </div>

                  {formError ? (
                    <p className="surface-card-danger m-0 px-2.5 py-2 text-[0.76rem] leading-[1.16] text-(--text-main)">
                      {formError}
                    </p>
                  ) : (
                    <p className="app-muted m-0 text-[0.74rem] leading-[1.16]">
                      Si el archivo ya estaba exportado por la app, el TXT debería reimportarse sin fricción.
                    </p>
                  )}
                </article>

                <article className="surface-panel-soft grid gap-2 px-3 py-3">
                  <div className="flex items-start justify-between gap-3 max-[620px]:grid">
                    <div className="grid gap-0.5">
                      <small className="app-muted text-[0.68rem] uppercase tracking-widest">Fallback manual</small>
                      <strong className="text-[0.88rem] text-(--text-main)">Pegar texto como alternativa</strong>
                      <p className="app-muted m-0 text-[0.75rem] leading-[1.14]">
                        Úsalo sólo si no tenés archivo o querés probar una lista copiada.
                      </p>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setManualFallbackOpen((current) => !current)}
                    >
                      {manualFallbackOpen ? 'Ocultar texto' : 'Pegar texto'}
                    </Button>
                  </div>

                  {manualFallbackOpen ? (
                    <div className="grid gap-2.5">
                      <textarea
                        value={inputValue}
                        onChange={(event) => {
                          setInputValue(event.target.value)
                          setPreview(null)
                          setFormError(null)
                        }}
                        placeholder={'3 Ash Blossom & Joyous Spring\n3 Maxx "C"\n2 Called by the Grave\n\nExtra Deck:\n1 S:P Little Knight'}
                        className="app-field min-h-[13rem] w-full resize-y px-3 py-2 text-[0.82rem] leading-[1.25]"
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="app-muted m-0 text-[0.74rem] leading-[1.16]">
                          Si no hay encabezados, todo entra a Main Deck por defecto.
                        </p>

                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setInputValue('')
                              setPreview(null)
                              setFormError(null)
                            }}
                          >
                            Limpiar
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              void processManualText()
                            }}
                            disabled={isProcessing}
                          >
                            {isProcessing ? 'Procesando...' : 'Procesar texto'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </article>
              </section>

              {preview ? (
                <section className="grid gap-3 self-start">
                    <article className="surface-card grid gap-2.5 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <small className="app-muted text-[0.68rem] uppercase tracking-widest">Preview</small>
                          <h4 className="m-[0.22rem_0_0] text-[0.95rem] leading-none text-(--text-main)">
                            {buildPreviewHeadline(preview)}
                          </h4>
                          <p className="app-muted m-[0.28rem_0_0] text-[0.76rem] leading-[1.16]">
                            {buildPreviewDescription(preview)}
                          </p>
                        </div>

                        <div className="flex flex-wrap justify-end gap-1.5">
                          <span className="app-chip px-2 py-1 text-[0.72rem]">{getPreviewSourceBadge(preview)}</span>
                          <span className="app-chip-accent px-2 py-1 text-[0.72rem] whitespace-nowrap">
                            {formatInteger(preview.importedCardCount)} / {formatInteger(preview.requestedCardCount)} listas
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {preview.source.fileName ? (
                          <span className="app-chip px-2 py-1 text-[0.72rem]">
                            Archivo: {preview.source.fileName}
                          </span>
                        ) : null}
                        <span className="app-chip px-2 py-1 text-[0.72rem]">
                          Deck: {preview.importedDeck.deckName.trim() || 'Sin nombre'}
                        </span>
                      </div>

                      <div className="grid gap-2 min-[620px]:grid-cols-3">
                        <ZoneTotalCard
                          label="Main Deck"
                          imported={preview.importedTotals.main}
                          requested={preview.requestedTotals.main}
                        />
                        <ZoneTotalCard
                          label="Extra Deck"
                          imported={preview.importedTotals.extra}
                          requested={preview.requestedTotals.extra}
                        />
                        <ZoneTotalCard
                          label="Side Deck"
                          imported={preview.importedTotals.side}
                          requested={preview.requestedTotals.side}
                        />
                      </div>

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="secondary" size="sm" onClick={handleClose}>
                          Cancelar
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleApplyClick}
                          disabled={!canApplyPreview}
                        >
                          {applyButtonLabel}
                        </Button>
                      </div>
                    </article>

                    {preview.resolvedEntries.length > 0 ? (
                      <ImportSection
                        title="Cartas encontradas"
                        subtitle="Estas cartas quedaron listas para cargar en el Deck Builder."
                        bodyClassName="max-h-[24rem] overflow-y-auto pr-1"
                      >
                        {preview.resolvedEntries.map((entry) => (
                          <ResolvedEntryCard key={`${entry.zone}:${entry.card.ygoprodeckId}`} entry={entry} />
                        ))}
                      </ImportSection>
                    ) : null}

                    {preview.missingEntries.length > 0 ? (
                      <ImportSection
                        title="No encontradas"
                        subtitle="Quedan afuera del import hasta que el nombre o ID coincida con una carta disponible."
                        tone="danger"
                      >
                        {preview.missingEntries.map((entry) => (
                          <SimpleEntryCard
                            key={`${entry.zone}:${entry.name}`}
                            entry={entry}
                            detail="No se encontró coincidencia válida en el dataset actual."
                          />
                        ))}
                      </ImportSection>
                    ) : null}

                    {preview.conflicts.length > 0 ? (
                      <ImportSection
                        title="Conflictos del import"
                        subtitle="Estas copias no se pudieron aplicar usando las reglas reales del deck builder."
                        tone="warning"
                      >
                        {preview.conflicts.map((entry) => (
                          <ConflictEntryCard key={`${entry.zone}:${entry.name}:${entry.reason}`} entry={entry} />
                        ))}
                      </ImportSection>
                    ) : null}

                    {preview.invalidLines.length > 0 ? (
                      <ImportSection
                        title="Líneas inválidas"
                        subtitle="Se ignoraron porque no pude leer una carta válida en esas líneas."
                        tone="danger"
                      >
                        {preview.invalidLines.map((entry) => (
                          <InvalidLineCard key={`${entry.lineNumber}:${entry.rawLine}`} entry={entry} />
                        ))}
                      </ImportSection>
                    ) : null}
                </section>
              ) : null}
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={isReplaceConfirmOpen}
        title="Reemplazar deck actual"
        description={
          preview
            ? `Tu deck actual tiene ${formatInteger(currentDeckCardCount)} carta${currentDeckCardCount === 1 ? '' : 's'}. Si confirmás, se reemplaza por ${formatInteger(preview.importedCardCount)} carta${preview.importedCardCount === 1 ? '' : 's'} resueltas del import.`
            : ''
        }
        cancelLabel="Volver"
        confirmLabel="Sí, reemplazar"
        onCancel={() => setIsReplaceConfirmOpen(false)}
        onConfirm={applyImport}
      />
    </>
  )
}

function buildPreviewHeadline(preview: DeckImportPreview): string {
  if (preview.importedCardCount === 0) {
    return 'No hay cartas listas para importar'
  }

  if (preview.importedCardCount === preview.requestedCardCount) {
    return 'Todo listo para aplicar el import'
  }

  return 'Import parcial listo para revisar'
}

function buildPreviewDescription(preview: DeckImportPreview): string {
  if (preview.importedCardCount === 0) {
    return 'La entrada se pudo leer, pero ninguna carta quedó lista para cargarse en el deck.'
  }

  if (
    preview.missingEntries.length === 0 &&
    preview.conflicts.length === 0 &&
    preview.invalidLines.length === 0
  ) {
    return 'Todas las cartas se pueden convertir directamente en el deck actual.'
  }

  return 'Sólo se van a cargar las cartas resueltas que no tengan conflictos.'
}

function getPreviewSourceBadge(preview: DeckImportPreview): string {
  if (preview.source.kind === 'json') {
    return 'JSON'
  }

  if (preview.source.kind === 'txt') {
    return 'TXT'
  }

  if (preview.source.kind === 'ydk') {
    return 'YDK'
  }

  return 'Texto manual'
}

function getZoneLabel(zone: DeckZone): string {
  if (zone === 'extra') {
    return 'Extra'
  }

  if (zone === 'side') {
    return 'Side'
  }

  return 'Main'
}

function ZoneTotalCard({
  label,
  imported,
  requested,
}: {
  imported: number
  label: string
  requested: number
}) {
  return (
    <div className="surface-panel-soft grid gap-0.5 px-2.5 py-2">
      <small className="app-muted text-[0.66rem] uppercase tracking-widest">{label}</small>
      <strong className="text-[0.92rem] leading-none text-(--text-main)">
        {formatInteger(imported)} / {formatInteger(requested)}
      </strong>
      <span className="app-muted text-[0.72rem] leading-none">importadas / pedidas</span>
    </div>
  )
}

function ImportSection({
  bodyClassName = '',
  children,
  subtitle,
  title,
  tone = 'default',
}: {
  bodyClassName?: string
  children: ReactNode
  subtitle: string
  title: string
  tone?: 'default' | 'danger' | 'warning'
}) {
  const containerClassName =
    tone === 'danger'
      ? 'surface-card-danger'
      : tone === 'warning'
        ? 'surface-card-warning'
        : 'surface-card'

  return (
    <article className={`${containerClassName} grid gap-2.5 px-3 py-3`}>
      <div className="grid gap-0.5">
        <small className="app-muted text-[0.68rem] uppercase tracking-widest">{title}</small>
        <p className="m-0 text-[0.76rem] leading-[1.16] text-(--text-muted)">{subtitle}</p>
      </div>

      <div className={['grid gap-1.5', bodyClassName].join(' ').trim()}>{children}</div>
    </article>
  )
}

function ResolvedEntryCard({ entry }: { entry: ResolvedImportedDeckEntry }) {
  const isPartial = entry.appliedCount !== entry.count

  return (
    <article className="surface-panel-soft flex items-start justify-between gap-3 px-2.5 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="app-chip px-1.5 py-0.5 text-[0.64rem]">{getZoneLabel(entry.zone)}</span>
          <strong className="text-[0.8rem] text-(--text-main)">{entry.card.name}</strong>
        </div>
        <p className="app-muted m-[0.22rem_0_0] text-[0.72rem] leading-[1.12]">
          {isPartial
            ? `Se aplicaron ${formatInteger(entry.appliedCount)} de ${formatInteger(entry.count)} copias.`
            : `${formatInteger(entry.count)} copia${entry.count === 1 ? '' : 's'} lista${entry.count === 1 ? '' : 's'} para importar.`}
        </p>
      </div>

      <span className={isPartial ? 'app-chip px-2 py-1 text-[0.7rem]' : 'app-chip-accent px-2 py-1 text-[0.7rem]'}>
        {isPartial
          ? `${formatInteger(entry.appliedCount)} / ${formatInteger(entry.count)}`
          : `${formatInteger(entry.count)}x`}
      </span>
    </article>
  )
}

function SimpleEntryCard({
  detail,
  entry,
}: {
  detail: string
  entry: ImportedDeckEntry
}) {
  return (
    <article className="surface-panel-soft flex items-start justify-between gap-3 px-2.5 py-2">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="app-chip px-1.5 py-0.5 text-[0.64rem]">{getZoneLabel(entry.zone)}</span>
          <strong className="text-[0.8rem] text-(--text-main)">{entry.name}</strong>
        </div>
        <p className="app-muted m-[0.22rem_0_0] text-[0.72rem] leading-[1.12]">{detail}</p>
      </div>

      <span className="app-chip px-2 py-1 text-[0.7rem]">{formatInteger(entry.count)}x</span>
    </article>
  )
}

function ConflictEntryCard({ entry }: { entry: DeckImportConflict }) {
  return (
    <article className="surface-panel-soft grid gap-1 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="app-chip px-1.5 py-0.5 text-[0.64rem]">{getZoneLabel(entry.zone)}</span>
          <strong className="text-[0.8rem] text-(--text-main)">{entry.name}</strong>
        </div>
        <span className="app-chip px-2 py-1 text-[0.7rem]">{formatInteger(entry.count)}x</span>
      </div>
      <p className="app-muted m-0 text-[0.72rem] leading-[1.12]">{entry.reason}</p>
    </article>
  )
}

function InvalidLineCard({ entry }: { entry: ImportedDeckInvalidLine }) {
  return (
    <article className="surface-panel-soft grid gap-1 px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-[0.8rem] text-(--text-main)">Línea {formatInteger(entry.lineNumber)}</strong>
        <span className="app-chip px-2 py-1 text-[0.7rem]">Ignorada</span>
      </div>
      <p className="m-0 text-[0.74rem] leading-[1.14] text-(--text-main)">{entry.rawLine.trim() || 'Línea vacía'}</p>
      <p className="app-muted m-0 text-[0.72rem] leading-[1.12]">{entry.reason}</p>
    </article>
  )
}
