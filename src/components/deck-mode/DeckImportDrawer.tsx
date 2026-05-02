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
import {
  buildProblemSummary,
  computeActiveStep,
  computeImportStatus,
  formatSectionAriaLabel,
  formatZoneGroupHeader,
  groupResolvedByZone,
  ZONE_LABELS,
  type ImportStep,
} from '../../app/deck-import-presentation'
import type { DeckBuilderState, DeckZone } from '../../app/model'
import { formatInteger } from '../../app/utils'
import type { DeckFormat } from '../../types'
import { loadCardCatalog } from '../../ygoprodeck'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { CloseButton } from '../ui/IconButton'
import { Skeleton } from '../ui/Skeleton'

interface DeckImportDrawerProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  isOpen: boolean
  onApplyImport: (nextDeckBuilder: DeckBuilderState) => void
  onClose: () => void
}

const FILE_ACCEPT = '.txt,.json,.ydk,application/json,text/plain'

const STEP_LABELS: Record<ImportStep, string> = {
  1: 'Subir archivo',
  2: 'Revisar preview',
  3: 'Aplicar import',
}

// --- Task 3.1: StepIndicator ---

function StepIndicator({
  hasPreview,
  canApply,
}: {
  hasPreview: boolean
  canApply: boolean
}) {
  const activeStep = computeActiveStep({ hasPreview, canApply })

  return (
    <div className="flex items-center gap-1.5">
      {([1, 2, 3] as const).map((step) => {
        const isActive = step === activeStep
        const isCompleted = step < activeStep

        return (
          <div key={step} className="flex items-center gap-1.5">
            {step > 1 ? (
              <span
                className={[
                  'h-px w-3',
                  isCompleted ? 'bg-primary' : 'bg-(--border-subtle)',
                ].join(' ')}
              />
            ) : null}
            <span
              className={[
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.66rem] font-medium whitespace-nowrap',
                isActive
                  ? 'bg-[rgb(var(--primary-rgb)/0.18)] text-primary'
                  : isCompleted
                    ? 'bg-[rgb(var(--primary-rgb)/0.08)] text-primary opacity-70'
                    : 'bg-[rgb(var(--background-rgb)/0.5)] text-(--text-muted)',
              ].join(' ')}
            >
              <span
                className={[
                  'grid h-4 w-4 place-items-center rounded-full text-[0.58rem] font-bold',
                  isActive
                    ? 'bg-primary text-white'
                    : isCompleted
                      ? 'bg-[rgb(var(--primary-rgb)/0.3)] text-primary'
                      : 'bg-[rgb(var(--background-rgb)/0.6)] text-(--text-muted)',
                ].join(' ')}
              >
                {isCompleted ? '✓' : step}
              </span>
              {STEP_LABELS[step]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// --- Task 3.2: ImportStatusBadge ---

function ImportStatusBadge({ preview }: { preview: DeckImportPreview }) {
  const status = computeImportStatus(preview)

  const config = {
    success: {
      icon: '✓',
      label: 'Import completo',
      className: 'bg-[rgb(var(--success-rgb,34,197,94)/0.15)] text-[rgb(var(--success-rgb,34,197,94))]',
    },
    warning: {
      icon: '⚠',
      label: 'Import parcial',
      className: 'bg-[rgb(var(--warning-rgb,234,179,8)/0.15)] text-[rgb(var(--warning-rgb,234,179,8))]',
    },
    error: {
      icon: '✕',
      label: 'Sin cartas resueltas',
      className: 'bg-[rgb(var(--danger-rgb,239,68,68)/0.15)] text-[rgb(var(--danger-rgb,239,68,68))]',
    },
  }[status]

  return (
    <span
      role="status"
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.74rem] font-medium',
        config.className,
      ].join(' ')}
    >
      <span className="text-[0.82rem]">{config.icon}</span>
      {config.label}
    </span>
  )
}

// --- Task 3.3: CollapsibleSection ---

function CollapsibleSection({
  'aria-label': ariaLabel,
  children,
  count,
  defaultExpanded = false,
  role,
  subtitle,
  title,
  tone = 'default',
}: {
  'aria-label'?: string
  children: ReactNode
  count: number
  defaultExpanded?: boolean
  role?: string
  subtitle: string
  title: string
  tone?: 'default' | 'danger' | 'warning'
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  if (count === 0) {
    return null
  }

  const containerClassName =
    tone === 'danger'
      ? 'surface-card-danger'
      : tone === 'warning'
        ? 'surface-card-warning'
        : 'surface-card'

  return (
    <article className={`${containerClassName} grid gap-0 px-3 py-3`} role={role} aria-label={ariaLabel}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <div className="grid gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <small className="app-muted text-[0.68rem] uppercase tracking-widest">{title}</small>
            <span className="app-chip px-1.5 py-0.5 text-[0.62rem] font-medium">{count}</span>
          </div>
          {!isExpanded ? (
            <p className="m-0 text-[0.72rem] leading-[1.16] text-(--text-muted) truncate">{subtitle}</p>
          ) : null}
        </div>
        <span className="text-[0.7rem] text-(--text-muted) shrink-0">
          {isExpanded ? '▲' : '▼'}
        </span>
      </button>

      {isExpanded ? (
        <div className="grid gap-1.5 pt-2.5">
          <p className="m-0 text-[0.76rem] leading-[1.16] text-(--text-muted)">{subtitle}</p>
          <div className="grid gap-1.5">{children}</div>
        </div>
      ) : null}
    </article>
  )
}

// --- Task 3.4: ZoneGroupSection ---

function ZoneGroupSection({ entries }: { entries: ResolvedImportedDeckEntry[] }) {
  const groups = groupResolvedByZone(entries)

  if (groups.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2">
      {groups.map((group) => (
        <div key={group.zone} className="grid gap-1.5">
          <h5 className="m-0 text-[0.76rem] font-semibold text-(--text-main)">
            {formatZoneGroupHeader(group.zone, group.totalCards)}
          </h5>
          <div className="grid gap-1.5">
            {group.entries.map((entry) => (
              <ResolvedEntryCard key={`${entry.zone}:${entry.card.ygoprodeckId}`} entry={entry} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// --- Task 3.5: ProblemSummaryBar ---

function ProblemSummaryBar({ preview }: { preview: DeckImportPreview }) {
  const summary = buildProblemSummary(preview)

  if (!summary) {
    return null
  }

  const items: string[] = []
  if (summary.missingCount > 0) {
    items.push(`${summary.missingCount} no encontrada${summary.missingCount === 1 ? '' : 's'}`)
  }
  if (summary.conflictCount > 0) {
    items.push(`${summary.conflictCount} conflicto${summary.conflictCount === 1 ? '' : 's'}`)
  }
  if (summary.invalidLineCount > 0) {
    items.push(`${summary.invalidLineCount} línea${summary.invalidLineCount === 1 ? '' : 's'} inválida${summary.invalidLineCount === 1 ? '' : 's'}`)
  }

  return (
    <div className="surface-card-warning flex items-center gap-2 px-3 py-2 text-[0.74rem]">
      <span className="text-[0.82rem]">⚠</span>
      <span className="text-(--text-main)">
        {items.join(' · ')}
      </span>
    </div>
  )
}

// --- Task 4.1: Refactored DeckImportDrawer ---

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
  const asideRef = useRef<HTMLElement | null>(null)
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

  // Task 6.2: Focus trap, Escape close, and auto-focus on open
  useEffect(() => {
    if (!isOpen) {
      return
    }

    const aside = asideRef.current
    if (!aside) {
      return
    }

    // Auto-focus first interactive element
    const focusableSelector =
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

    requestAnimationFrame(() => {
      const first = aside.querySelector<HTMLElement>(focusableSelector)
      first?.focus()
    })

    const handleKeyDown = (event: KeyboardEvent) => {
      // Escape closes the drawer
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }

      // Focus trap on Tab
      if (event.key === 'Tab') {
        const focusable = Array.from(aside.querySelectorAll<HTMLElement>(focusableSelector))
        if (focusable.length === 0) {
          return
        }

        const first = focusable[0]
        const last = focusable[focusable.length - 1]

        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

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

    // Use file name (without extension) as deck name
    const fileDeckName = file.name.replace(/\.[^.]+$/, '').trim() || deckBuilder.deckName

    try {
      const fileText = await file.text()
      let nextPreview: DeckImportPreview

      if (fileKind === 'json') {
        nextPreview = buildDeckImportPreviewFromJson({
          deckName: fileDeckName,
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
                deckName: fileDeckName,
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
                deckName: fileDeckName,
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
      <div className="fixed inset-0 z-150">
        <button
          type="button"
          aria-label="Cerrar importador"
          className="absolute inset-0 h-full w-full bg-[rgb(var(--background-rgb)/0.7)]"
          onClick={handleClose}
        />

        <aside
          ref={asideRef}
          role="dialog"
          aria-label="Importador de deck"
          className={[
            'surface-panel absolute right-0 top-0 grid h-dvh w-full max-w-136 grid-rows-[auto_minmax(0,1fr)] gap-0 border-l border-(--border-subtle) p-0 shadow-[-28px_0_54px_rgba(0,0,0,0.38)]',
          ].join(' ')}
          style={{ background: 'var(--card-background)' }}
        >
          <div className="grid gap-1.5 border-b border-(--border-subtle) px-3 py-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Importacion de deck</p>
                <h3 className="m-[0.18rem_0_0] text-[1.05rem] leading-none text-(--text-main)">
                  Subí un archivo o pegá texto
                </h3>
              </div>

              <CloseButton size="sm" aria-label="Cerrar importador" onClick={handleClose} />
            </div>

          </div>

          <div className="min-h-0 overflow-y-auto px-3 py-3">
            <div className="grid gap-3">
              {!preview && !isProcessing ? (
                <>
                <article className="surface-card grid gap-2.5 px-3 py-3">
                  <div className="grid gap-0.5">
                    <small className="app-muted text-[0.68rem] uppercase tracking-widest">Archivo</small>
                    <strong className="text-[0.96rem] text-(--text-main)">Subí o arrastrá el deck</strong>
                  </div>

                  <div
                    className={[
                      'grid gap-3 border border-dashed px-4 py-5 text-center transition-colors',
                      isDragActive
                        ? 'border-primary bg-[rgb(var(--primary-rgb)/0.12)]'
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
                    <span aria-live="polite" className="sr-only">
                      {isProcessing
                        ? 'Procesando archivo'
                        : isDragActive
                          ? 'Archivo detectado, soltá para cargar'
                          : selectedFileName
                            ? `Archivo cargado: ${selectedFileName}`
                            : ''}
                    </span>
                    <div className="grid gap-1">
                      <strong className="text-[0.9rem] text-(--text-main)">Arrastrá el archivo acá</strong>
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
                  ) : null}
                </article>

                <article className="surface-panel-soft grid gap-2 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="grid gap-0.5">
                      <small className="app-muted text-[0.68rem] uppercase tracking-widest">Texto manual</small>
                      <strong className="text-[0.88rem] text-(--text-main)">Pegar lista</strong>
                    </div>

                    <Button
                      variant="primary"
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
                        className="app-field min-h-52 w-full resize-y px-3 py-2 text-[0.82rem] leading-tight"
                      />

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="primary"
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
                </>
              ) : null}

              {isProcessing ? (
                <article className="surface-card grid gap-2.5 px-3 py-3" aria-hidden="true">
                    <div className="grid gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-5 w-56" />
                      <Skeleton className="h-3 w-full max-w-[24rem]" />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Skeleton radius="chip" className="h-7 w-24" />
                      <Skeleton radius="chip" className="h-7 w-40" />
                    </div>

                    <div className="grid gap-2 min-[620px]:grid-cols-3">
                      <Skeleton radius="panel" className="h-[4.9rem] w-full" />
                      <Skeleton radius="panel" className="h-[4.9rem] w-full" />
                      <Skeleton radius="panel" className="h-[4.9rem] w-full" />
                    </div>

                    <div className="grid gap-2">
                      {Array.from({ length: 5 }, (_, index) => (
                        <div key={index} className="surface-panel-soft grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2">
                          <Skeleton radius="chip" className="h-5 w-11" />
                          <div className="grid gap-1.5">
                            <Skeleton className="h-3.5 w-[78%]" />
                            <Skeleton className="h-2.5 w-[52%]" />
                          </div>
                          <Skeleton radius="chip" className="h-5 w-10" />
                        </div>
                      ))}
                    </div>
                </article>
              ) : preview ? (
                <>
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

                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <span className="app-chip px-2 py-1 text-[0.72rem]">{getPreviewSourceBadge(preview)}</span>
                        <span className="app-chip-accent px-2 py-1 text-[0.72rem] whitespace-nowrap">
                          {formatInteger(preview.importedCardCount)} / {formatInteger(preview.requestedCardCount)} cartas
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

                      <ProblemSummaryBar preview={preview} />

                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="primary" size="sm" onClick={handleClose}>
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
                      <CollapsibleSection
                        title="Cartas encontradas"
                        subtitle="Estas cartas quedaron listas para cargar en el Deck Builder."
                        count={preview.resolvedEntries.length}
                        defaultExpanded={preview.importedCardCount !== preview.requestedCardCount}
                        role="region"
                        aria-label={formatSectionAriaLabel('Cartas encontradas', preview.resolvedEntries.length)}
                      >
                        <ZoneGroupSection entries={preview.resolvedEntries} />
                      </CollapsibleSection>
                    ) : null}

                    {preview.missingEntries.length > 0 ? (
                      <CollapsibleSection
                        title="No encontradas"
                        subtitle="Quedan afuera del import hasta que el nombre o ID coincida con una carta disponible."
                        count={preview.missingEntries.length}
                        tone="danger"
                        role="region"
                        aria-label={formatSectionAriaLabel('No encontradas', preview.missingEntries.length)}
                      >
                        {preview.missingEntries.map((entry) => (
                          <SimpleEntryCard
                            key={`${entry.zone}:${entry.name}`}
                            entry={entry}
                          />
                        ))}
                      </CollapsibleSection>
                    ) : null}

                    {preview.conflicts.length > 0 ? (
                      <CollapsibleSection
                        title="Conflictos del import"
                        subtitle="Estas copias no se pudieron aplicar usando las reglas reales del deck builder."
                        count={preview.conflicts.length}
                        tone="warning"
                        role="region"
                        aria-label={formatSectionAriaLabel('Conflictos del import', preview.conflicts.length)}
                      >
                        {preview.conflicts.map((entry) => (
                          <ConflictEntryCard key={`${entry.zone}:${entry.name}:${entry.reason}`} entry={entry} />
                        ))}
                      </CollapsibleSection>
                    ) : null}

                    {preview.invalidLines.length > 0 ? (
                      <CollapsibleSection
                        title="Líneas inválidas"
                        subtitle="Se ignoraron porque no pude leer una carta válida en esas líneas."
                        count={preview.invalidLines.length}
                        tone="danger"
                        role="region"
                        aria-label={formatSectionAriaLabel('Líneas inválidas', preview.invalidLines.length)}
                      >
                        {preview.invalidLines.map((entry) => (
                          <InvalidLineCard key={`${entry.lineNumber}:${entry.rawLine}`} entry={entry} />
                        ))}
                      </CollapsibleSection>
                    ) : null}
                </>
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

// --- Kept helper functions ---

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

function ResolvedEntryCard({ entry }: { entry: ResolvedImportedDeckEntry }) {
  const isPartial = entry.appliedCount !== entry.count

  return (
    <article className="surface-panel-soft flex items-center justify-between gap-3 px-2.5 py-1.5">
      <strong className="min-w-0 truncate text-[0.8rem] text-(--text-main)">{entry.card.name}</strong>
      <span className={isPartial ? 'app-chip shrink-0 px-2 py-0.5 text-[0.7rem]' : 'app-chip-accent shrink-0 px-2 py-0.5 text-[0.7rem]'}>
        {isPartial
          ? `${formatInteger(entry.appliedCount)} / ${formatInteger(entry.count)}`
          : `${formatInteger(entry.count)}x`}
      </span>
    </article>
  )
}

function SimpleEntryCard({
  entry,
}: {
  detail?: string
  entry: ImportedDeckEntry
}) {
  return (
    <article className="surface-panel-soft flex items-center justify-between gap-3 px-2.5 py-1.5">
      <strong className="min-w-0 truncate text-[0.8rem] text-(--text-main)">{entry.name}</strong>
      <span className="app-chip shrink-0 px-2 py-0.5 text-[0.7rem]">{formatInteger(entry.count)}x</span>
    </article>
  )
}

function ConflictEntryCard({ entry }: { entry: DeckImportConflict }) {
  return (
    <article className="surface-panel-soft flex items-center justify-between gap-3 px-2.5 py-1.5">
      <div className="min-w-0">
        <strong className="truncate text-[0.8rem] text-(--text-main)">{entry.name}</strong>
        <p className="app-muted m-0 text-[0.68rem] leading-[1.12]">{entry.reason}</p>
      </div>
      <span className="app-chip shrink-0 px-2 py-0.5 text-[0.7rem]">{formatInteger(entry.count)}x</span>
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
