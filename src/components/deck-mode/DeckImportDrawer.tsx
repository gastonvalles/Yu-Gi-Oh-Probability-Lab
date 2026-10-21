import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

import {
  buildDeckImportPreview,
  buildDeckImportPreviewFromJson,
  buildDeckImportPreviewFromYdk,
  getDeckImportFileKind,
  isYdkeLink,
  pastedDeckAsYdk,
  type DeckImportConflict,
  type DeckImportPreview,
  type ImportedDeckEntry,
  type ImportedDeckInvalidLine,
  type ResolvedImportedDeckEntry,
} from '../../app/deck-import'
import {
  buildProblemSummary,
  formatSectionAriaLabel,
  formatZoneGroupHeader,
  groupResolvedByZone,
} from '../../app/deck-import-presentation'
import { loadFormatData } from '../../app/format-data'
import type { DeckBuilderState } from '../../app/model'
import { useFocusTrap } from '../../app/use-focus-trap'
import { useBodyScrollLock, useEscapeKey } from '../../app/use-overlay'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { loadCardCatalog } from '../../ygoprodeck'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Heading } from '../ui/Heading'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { CopiesBadge } from '../ui/CopiesBadge'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'
import { ProgressRing } from '../ui/ProgressRing'
import { Segmented } from '../ui/Segmented'
import { Skeleton } from '../ui/Skeleton'
import { chip, field } from '../ui/surfaces'
import { TONE } from '../ui/tone'
import { overline } from '../ui/typography'

interface DeckImportDrawerProps {
  deckBuilder: DeckBuilderState
  deckFormat: DeckFormat
  isOpen: boolean
  onApplyImport: (nextDeckBuilder: DeckBuilderState) => void
  onClose: () => void
  /**
   * Destino del import. 'builder' reemplaza el deck actual (pide confirmación);
   * 'comparison' guarda una build aparte y usa el deck actual sólo para heredar
   * la clasificación de las cartas que ya conocés.
   */
  target?: 'builder' | 'comparison'
}

/** Cómo se trae la lista: un archivo (.txt, .json, .ydk) o el texto pegado. */
type ImportMethod = 'file' | 'text' | 'link'

const FILE_ACCEPT = '.txt,.json,.ydk,application/json,text/plain'
/** Una lista de deck pesa unos pocos KB: por encima de esto no es una lista y sólo trabaría la pestaña. */
const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024
const MAX_IMPORT_TEXT_LENGTH = 20_000

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

  const accent = tone === 'danger' ? TONE.danger.text : tone === 'warning' ? TONE.warning.text : ''

  return (
    <article className="grid gap-0 border-t border-border-subtle pt-3" role={role} aria-label={ariaLabel}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <div className="grid gap-0.5 min-w-0">
          <div className="flex items-center gap-2">
            <small className={cx(overline, accent)}>{title}</small>
            <Badge tone="neutral" size="sm">{count}</Badge>
          </div>
          {!isExpanded ? (
            <p className="m-0 text-micro text-muted truncate">{subtitle}</p>
          ) : null}
        </div>
        <Icon name="chevron-down" size={16} className={cx('shrink-0 text-soft transition-transform duration-150', isExpanded && 'rotate-180')} />
      </button>

      {isExpanded ? (
        <div className="grid gap-1.5 pt-2.5">
          <p className="m-0 text-micro text-muted">{subtitle}</p>
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
          <h5 className="m-0 text-micro font-semibold text-foreground">
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
    items.push(t('deck.import.summary.missing', { count: summary.missingCount }))
  }
  if (summary.conflictCount > 0) {
    items.push(t('deck.import.summary.conflicts', { count: summary.conflictCount }))
  }
  if (summary.invalidLineCount > 0) {
    items.push(t('deck.import.summary.invalid', { count: summary.invalidLineCount }))
  }

  return <Callout tone="warning">{items.join(' · ')}</Callout>
}

// --- Task 4.1: Refactored DeckImportDrawer ---

export function DeckImportDrawer({
  deckBuilder,
  deckFormat,
  isOpen,
  onApplyImport,
  onClose,
  target = 'builder',
}: DeckImportDrawerProps) {
  const [inputValue, setInputValue] = useState('')
  const [preview, setPreview] = useState<DeckImportPreview | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false)
  const [isDragActive, setIsDragActive] = useState(false)
  const [method, setMethod] = useState<ImportMethod>('text')
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const asideRef = useRef<HTMLElement | null>(null)
  const currentDeckCardCount =
    deckBuilder.main.length + deckBuilder.extra.length + deckBuilder.side.length
  const hasExistingDeck = target === 'builder' && currentDeckCardCount > 0
  const canApplyPreview = Boolean(preview && preview.importedCardCount > 0)
  const applyButtonLabel =
    target === 'comparison' ? t('deck.import.apply.compare') : hasExistingDeck ? t('deck.import.apply.replace') : t('deck.import.apply.import')
  const methodOptions: ReadonlyArray<{ value: ImportMethod; label: string }> = [
    { value: 'text', label: t('deck.import.pasteText') },
    { value: 'file', label: t('deck.import.method.file') },
    { value: 'link', label: t('deck.import.method.link') },
  ]

  useEffect(() => {
    if (!isOpen) {
      setInputValue('')
      setPreview(null)
      setFormError(null)
      setIsProcessing(false)
      setIsReplaceConfirmOpen(false)
      setIsDragActive(false)
      setMethod('text')
      setSelectedFileName(null)
    }
  }, [isOpen])

  // Escape pasa por la pila de overlays: con la confirmación abierta cierra sólo la confirmación.
  useEscapeKey(() => handleClose(), isOpen)
  useFocusTrap(asideRef, isOpen)
  useBodyScrollLock(isOpen)

  if (!isOpen) {
    return null
  }

  // La ventana cambia de contenido (los controles se van mientras carga y la vista previa se va con "Volver"): el foco se queda en el panel, no cae al <body>.
  const keepFocus = () => asideRef.current?.focus({ preventScroll: true })

  const handlePreviewResult = (nextPreview: DeckImportPreview, options?: { emptyMessage?: string }) => {
    setPreview(nextPreview)

    if (nextPreview.parsedEntries.length === 0) {
      setFormError(options?.emptyMessage ?? t('deck.import.error.noCards'))
      return
    }

    if (nextPreview.importedCardCount === 0) {
      setFormError(t('deck.import.error.unresolved'))
      return
    }

    setFormError(null)
  }

  const processManualText = async () => {
    const trimmedValue = inputValue.trim()

    if (trimmedValue.length === 0) {
      setPreview(null)
      setFormError(t('deck.import.error.emptyText'))
      return
    }

    setFormError(null)
    setIsProcessing(true)
    keepFocus()

    try {
      // Un enlace `ydke://` (o un `.ydk` pegado) trae números de carta: se lee como el archivo. Si el enlace está roto, se dice.
      const asYdk = pastedDeckAsYdk(trimmedValue)

      if (asYdk === null && isYdkeLink(trimmedValue)) {
        setPreview(null)
        setFormError(t('deck.import.error.ydke'))
        return
      }

      const cards = await loadCardCatalog()
      const nextPreview =
        asYdk === null
          ? buildDeckImportPreview({
              cards,
              deckFormat,
              deckName: deckBuilder.deckName,
              text: trimmedValue,
              source: {
                kind: 'text',
                label: t('deck.import.source.pastedManually'),
              },
            })
          : buildDeckImportPreviewFromYdk({
              cards,
              deckFormat,
              deckName: deckBuilder.deckName,
              text: asYdk,
              source: {
                kind: 'ydk',
                label: isYdkeLink(trimmedValue) ? t('deck.import.source.link') : 'YDK',
              },
            })

      handlePreviewResult(nextPreview, {
        emptyMessage: t('deck.import.error.noList'),
      })
    } catch (error) {
      setPreview(null)
      setFormError(error instanceof Error ? error.message : t('deck.import.error.processText'))
    } finally {
      setIsProcessing(false)
    }
  }

  const processFile = async (file: File) => {
    const fileKind = getDeckImportFileKind(file.name)

    if (!fileKind) {
      setPreview(null)
      setFormError(t('deck.import.error.format'))
      return
    }

    setFormError(null)
    setIsProcessing(true)
    keepFocus()
    setSelectedFileName(file.name)

    // Use file name (without extension) as deck name
    const fileDeckName = file.name.replace(/\.[^.]+$/, '').trim() || deckBuilder.deckName

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setPreview(null)
      setFormError(t('deck.import.error.tooBig'))
      setIsProcessing(false)
      return
    }

    try {
      const fileText = await file.text()
      let nextPreview: DeckImportPreview

      if (fileKind === 'json') {
        // Leer el JSON resuelve ahí mismo los puntos de Genesys de las cartas que no los traen: las tablas tienen que estar. Si no bajan, se importa igual.
        await loadFormatData().catch(() => {})

        nextPreview = buildDeckImportPreviewFromJson({
          deckName: fileDeckName,
          text: fileText,
          source: {
            kind: 'json',
            fileName: file.name,
            label: t('deck.import.source.json', { name: file.name }),
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
                  label: t('deck.import.source.ydk', { name: file.name }),
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
                  label: t('deck.import.source.txt', { name: file.name }),
                },
              })
      }

      handlePreviewResult(nextPreview, {
        emptyMessage: t('deck.import.error.emptyFile'),
      })
    } catch (error) {
      setPreview(null)
      setFormError(error instanceof Error ? error.message : t('deck.import.error.readFile'))
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setIsReplaceConfirmOpen(false)
    onClose()
  }

  // Volver a elegir: la vista previa se descarta, pero el método y el texto pegado quedan como estaban para corregirlo (cerrar la ventana los borra).
  const handleBack = () => {
    setPreview(null)
    setFormError(null)
    setSelectedFileName(null)
    keepFocus()
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

  // Se monta en <body>: dentro de un paso animado (con transform) quedaría corrido.
  return createPortal(
    <>
      <div className="fixed inset-0 z-150">
        <button
          type="button"
          aria-label={t('deck.import.close')}
          className="absolute inset-0 h-full w-full bg-background/80"
          onClick={handleClose}
        />

        <aside
          ref={asideRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={t('deck.import.dialog')}
          className="absolute right-0 top-0 flex h-full w-full max-w-136 flex-col border-l outline-none border-border-subtle bg-card-background p-0 shadow-overlay"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-subtle px-4 py-3.5">
            <div className="flex min-w-0 items-start gap-3">
              <Icon name="upload" size={22} className="mt-1 shrink-0 text-foreground" />
              <div className="min-w-0">
                <Heading level="section" as="h3">
                  {t('deck.import.title')}
                </Heading>
              </div>
            </div>

            <CloseButton size="sm" aria-label={t('deck.import.close')} onClick={handleClose} />
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
            <div className="flex min-h-full flex-col gap-4">
              {/* Siempre montada (la zona de soltar no lo está mientras carga): así lo que pasa se anuncia. */}
              <span aria-live="polite" className="sr-only">
                {isProcessing
                  ? t('deck.import.processing')
                  : isDragActive
                    ? t('deck.import.live.dragging')
                    : selectedFileName
                      ? t('deck.import.live.loaded', { name: selectedFileName })
                      : ''}
              </span>

              {!preview && !isProcessing ? (
                // Dos formas de importar, como opciones parejas: el archivo o el texto pegado (la que se elige llena el resto de la ventana).
                <div className="flex min-h-0 flex-1 flex-col gap-4">
                  <Segmented
                    value={method}
                    onChange={(next) => {
                      setMethod(next)
                      setFormError(null)
                    }}
                    options={methodOptions}
                    label={t('deck.import.method.label')}
                    fullWidth
                  />

                  {method === 'file' ? (
                    <div
                      className={[
                        'grid content-center justify-items-center gap-3 rounded-card border border-dashed px-4 py-10 text-center transition-colors pointer-coarse:flex-1',
                        isDragActive ? 'border-info bg-info/12' : 'border-border pointer-coarse:border-transparent',
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
                      <div className="grid justify-items-center gap-2">
                        <Icon name="upload" size={28} className="text-foreground" />
                        {/* En el celular no se arrastra nada: el texto de arrastrar es sólo de los punteros finos (mouse). */}
                        <strong className="text-body font-semibold text-foreground pointer-coarse:hidden">{t('deck.import.drop')}</strong>
                        <strong className="hidden text-body font-semibold text-foreground pointer-coarse:block">{t('deck.import.dropTouch')}</strong>
                      </div>

                      {/* Antes del botón: la trampa de foco toma como último control al último del DOM, y este input (invisible: lo abre el botón) no recibe foco. */}
                      <input ref={fileInputRef} type="file" accept={FILE_ACCEPT} className="hidden" onChange={handleFileInputChange} />

                      <Button variant="primary" size="md" onClick={handleChooseFileClick}>
                        {t('deck.import.chooseFile')}
                      </Button>

                      <p className="m-0 text-micro text-soft">{t('deck.import.formats')}</p>

                      {selectedFileName ? (
                        <span className={`${chip.base} px-2 py-1 text-micro`}>{t('deck.import.selectedFile', { name: selectedFileName })}</span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
                      <textarea
                        aria-label={method === 'link' ? t('deck.import.linkLabel') : t('deck.import.listLabel')}
                        // Una lista real pesa unos pocos KB: el tope evita pegar un archivo gigante por error.
                        maxLength={MAX_IMPORT_TEXT_LENGTH}
                        value={inputValue}
                        onChange={(event) => {
                          setInputValue(event.target.value)
                          setPreview(null)
                          setFormError(null)
                        }}
                        placeholder={method === 'link' ? 'ydke://…' : '3 Ash Blossom & Joyous Spring\n3 Maxx "C"\n2 Called by the Grave\n\nExtra Deck:\n1 S:P Little Knight'}
                        className={`${field} ${method === 'link' ? 'min-h-24' : 'min-h-52'} w-full flex-1 resize-none px-3 py-2 text-body leading-tight placeholder:text-soft`}
                      />

                      <p className="m-0 text-micro text-soft">{method === 'link' ? t('deck.import.linkHint') : t('deck.import.pasteHint')}</p>

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="tertiary"
                          size="sm"
                          onClick={() => {
                            setInputValue('')
                            setPreview(null)
                            setFormError(null)
                          }}
                        >
                          {t('deck.import.clear')}
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            void processManualText()
                          }}
                        >
                          {t('deck.import.processText')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {formError ? <Callout tone="danger">{formError}</Callout> : null}
                </div>
              ) : null}

              {isProcessing ? (
                <article className="grid gap-2.5" aria-hidden="true">
                    <div className="grid gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-5 w-56" />
                      <Skeleton className="h-3 w-full max-w-[24rem]" />
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <Skeleton radius="chip" className="h-7 w-24" />
                      <Skeleton radius="chip" className="h-7 w-40" />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <Skeleton radius="panel" className="h-[4.9rem] w-full" />
                      <Skeleton radius="panel" className="h-[4.9rem] w-full" />
                      <Skeleton radius="panel" className="h-[4.9rem] w-full" />
                    </div>

                    <div className="grid gap-2">
                      {Array.from({ length: 5 }, (_, index) => (
                        <div key={index} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 py-2">
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
                    <article className="grid gap-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <small className={overline}>{t('deck.import.preview')}</small>
                          <Heading level="section" as="h4" className="mt-0.5 leading-tight">
                            {buildPreviewHeadline(preview)}
                          </Heading>
                          <p className="text-muted m-0 mt-1 text-micro">
                            {buildPreviewDescription(preview)}
                          </p>
                        </div>

                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <span className={`${chip.base} px-2 py-1 text-micro`}>{getPreviewSourceBadge(preview)}</span>
                        <span className={`${chip.base} px-2 py-1 text-micro whitespace-nowrap`}>
                          {t('deck.import.cardsRatio', { imported: formatInteger(preview.importedCardCount), requested: formatInteger(preview.requestedCardCount) })}
                        </span>
                      </div>

                      <div className="grid gap-1.5">
                        <div className="grid grid-cols-3 gap-2">
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
                        <p className="m-0 text-center text-micro text-muted">{t('deck.import.zoneTotalCaption')}</p>
                      </div>

                      <ProblemSummaryBar preview={preview} />
                    </article>

                    {preview.resolvedEntries.length > 0 ? (
                      <CollapsibleSection
                        title={t('deck.import.found.title')}
                        subtitle={t('deck.import.found.subtitle')}
                        count={preview.resolvedEntries.length}
                        defaultExpanded={preview.importedCardCount !== preview.requestedCardCount}
                        role="region"
                        aria-label={formatSectionAriaLabel(t('deck.import.found.title'), preview.resolvedEntries.length)}
                      >
                        <ZoneGroupSection entries={preview.resolvedEntries} />
                      </CollapsibleSection>
                    ) : null}

                    {preview.missingEntries.length > 0 ? (
                      <CollapsibleSection
                        title={t('deck.import.missing.title')}
                        subtitle={t('deck.import.missing.subtitle')}
                        count={preview.missingEntries.length}
                        tone="danger"
                        role="region"
                        aria-label={formatSectionAriaLabel(t('deck.import.missing.title'), preview.missingEntries.length)}
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
                        title={t('deck.import.conflicts.title')}
                        subtitle={t('deck.import.conflicts.subtitle')}
                        count={preview.conflicts.length}
                        tone="warning"
                        role="region"
                        aria-label={formatSectionAriaLabel(t('deck.import.conflicts.aria'), preview.conflicts.length)}
                      >
                        {preview.conflicts.map((entry) => (
                          <ConflictEntryCard key={`${entry.zone}:${entry.name}:${entry.reason}`} entry={entry} />
                        ))}
                      </CollapsibleSection>
                    ) : null}

                    {preview.invalidLines.length > 0 ? (
                      <CollapsibleSection
                        title={t('deck.import.invalid.title')}
                        subtitle={t('deck.import.invalid.subtitle')}
                        count={preview.invalidLines.length}
                        tone="danger"
                        role="region"
                        aria-label={formatSectionAriaLabel(t('deck.import.invalid.title'), preview.invalidLines.length)}
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

          {/* Las acciones quedan siempre a la vista (no se pierden al bajar por una lista larga): volver a elegir, o aplicar. */}
          {preview && !isProcessing ? (
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <Button variant="tertiary" size="sm" icon="chevron-left" onClick={handleBack}>
                {t('deck.import.back')}
              </Button>
              <Button variant="primary" size="sm" onClick={handleApplyClick} disabled={!canApplyPreview}>
                {applyButtonLabel}
              </Button>
            </footer>
          ) : null}
        </aside>
      </div>

      <ConfirmDialog
        isOpen={isReplaceConfirmOpen}
        title={t('deck.import.replace.title')}
        description={preview ? t('deck.import.replace.description', { count: formatInteger(currentDeckCardCount), incoming: formatInteger(preview.importedCardCount) }) : ''}
        cancelLabel={t('deck.import.replace.keep')}
        confirmLabel={t('deck.import.replace.confirm')}
        confirmColor="danger"
        onCancel={() => setIsReplaceConfirmOpen(false)}
        onConfirm={applyImport}
      />
    </>,
    document.body,
  )
}

// --- Kept helper functions ---

function buildPreviewHeadline(preview: DeckImportPreview): string {
  if (preview.importedCardCount === 0) {
    return t('deck.import.headline.none')
  }

  if (preview.importedCardCount === preview.requestedCardCount) {
    return t('deck.import.headline.all')
  }

  return t('deck.import.headline.partial')
}

function buildPreviewDescription(preview: DeckImportPreview): string {
  if (preview.importedCardCount === 0) {
    return t('deck.import.description.none')
  }

  if (
    preview.missingEntries.length === 0 &&
    preview.conflicts.length === 0 &&
    preview.invalidLines.length === 0
  ) {
    return t('deck.import.description.all')
  }

  return t('deck.import.description.partial')
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

  return t('deck.import.badge.text')
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
    <div className="grid justify-items-center gap-1.5 text-center">
      <ProgressRing
        value={requested > 0 ? imported / requested : 0}
        tone={imported === requested ? 'success' : 'warning'}
        size={52}
        strokeWidth={5}
        label={t('deck.import.zoneTotalAria', { zone: label, imported: formatInteger(imported), requested: formatInteger(requested) })}
      >
        {formatInteger(imported)}
      </ProgressRing>
      <div className="grid gap-0.5">
        <small className={overline}>{label}</small>
        <strong className="text-body font-semibold leading-none text-foreground tabular-nums">
          {formatInteger(imported)} / {formatInteger(requested)}
        </strong>
      </div>
    </div>
  )
}

function ResolvedEntryCard({ entry }: { entry: ResolvedImportedDeckEntry }) {
  const isPartial = entry.appliedCount !== entry.count

  return (
    <article className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <strong className="min-w-0 truncate text-body text-foreground">{entry.card.name}</strong>
      {isPartial ? (
        <span className={`${chip.base} shrink-0 px-2 py-0.5 text-micro`}>
          {formatInteger(entry.appliedCount)} / {formatInteger(entry.count)}
        </span>
      ) : (
        <CopiesBadge copies={entry.count} />
      )}
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
    <article className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <strong className="min-w-0 truncate text-body text-foreground">{entry.name}</strong>
      <CopiesBadge copies={entry.count} />
    </article>
  )
}

function ConflictEntryCard({ entry }: { entry: DeckImportConflict }) {
  return (
    <article className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <div className="min-w-0">
        <strong className="truncate text-body text-foreground">{entry.name}</strong>
        <p className="text-muted m-0 text-micro">{entry.reason}</p>
      </div>
      <CopiesBadge copies={entry.count} />
    </article>
  )
}

function InvalidLineCard({ entry }: { entry: ImportedDeckInvalidLine }) {
  return (
    <article className="grid gap-1 border-b border-border-subtle py-2 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-body text-foreground">{t('deck.import.line', { number: formatInteger(entry.lineNumber) })}</strong>
        <span className={`${chip.base} px-2 py-1 text-micro`}>{t('deck.import.ignored')}</span>
      </div>
      <p className="m-0 text-micro text-foreground">{entry.rawLine.trim() || t('deck.import.emptyLine')}</p>
      <p className="text-muted m-0 text-micro">{entry.reason}</p>
    </article>
  )
}
