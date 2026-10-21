import { useRef, useState } from 'react'

import { collectBackup, parseBackup, restoreBackup, type LabBackup } from '../../app/backup'
import { downloadBlob } from '../../app/deck-image-export-download'
import { stopPersisting } from '../../app/store'
import { useToastMessage } from '../../app/use-toast-message'
import { formatDay, t } from '../../i18n'
import { ConfirmDialog } from '../probability/ConfirmDialog'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'

/** Una fila del cajón del celular: el ícono y lo que hace, de 48 px, con una línea fina arriba salvo la primera. */
const LIST_ROW = 'flex h-12 w-full cursor-pointer items-center gap-3 border-t border-nav-raised text-left text-body font-medium text-foreground transition-colors duration-150 hover:text-info focus-visible:outline-none focus-visible:shadow-focus'

/**
 * Los dos botones de la copia de seguridad (bajar todo lo guardado en este navegador y restaurarlo desde un archivo), con el diálogo que pide
 * confirmar antes de pisar lo que hay. Los usan la pantalla de exportar y el cajón de ajustes del celular (ahí, `variant="list"`: dos filas con su ícono).
 */
export function BackupActions({ variant = 'buttons' }: { variant?: 'buttons' | 'list' }) {
  // La copia elegida para restaurar, esperando la confirmación.
  const [pendingBackup, setPendingBackup] = useState<LabBackup | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { showToast } = useToastMessage()

  const downloadBackup = () => {
    const backup = collectBackup()

    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' }), t('deck.backup.fileName', { date: backup.savedAt.slice(0, 10) }), 'json')
  }

  const readBackupFile = async (file: File | undefined) => {
    if (!file) return

    try {
      setPendingBackup(parseBackup(await file.text()))
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('deck.backup.readFailed'), 'error')
    }
  }

  const restorePendingBackup = () => {
    if (!pendingBackup) return

    // Lo que hay en memoria no debe escribirse más: al recargar, la app arranca de lo restaurado.
    stopPersisting()
    restoreBackup(pendingBackup)
    window.location.reload()
  }

  return (
    <>
      {variant === 'list' ? (
        <>
          <button type="button" className={cx(LIST_ROW, 'border-t-0')} onClick={downloadBackup}>
            <Icon name="download" size={20} className="shrink-0" />
            {t('deck.backup.saveCopy')}
          </button>
          <button type="button" className={LIST_ROW} onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={20} className="shrink-0" />
            {t('deck.backup.restoreCopy')}
          </button>
        </>
      ) : (
        <>
          <Button size="sm" icon="download" onClick={downloadBackup}>
            {t('deck.backup.download')}
          </Button>
          <Button size="sm" variant="tertiary" icon="upload" onClick={() => inputRef.current?.click()}>
            {t('deck.backup.restore')}
          </Button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label={t('deck.backup.fileLabel')}
        onChange={(event) => {
          void readBackupFile(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <ConfirmDialog
        isOpen={pendingBackup !== null}
        title={t('deck.backup.confirmTitle')}
        description={pendingBackup?.savedAt ? t('deck.backup.confirmTextDated', { date: formatDay(pendingBackup.savedAt) }) : t('deck.backup.confirmText')}
        confirmLabel={t('deck.backup.confirmButton')}
        confirmColor="danger"
        onCancel={() => setPendingBackup(null)}
        onConfirm={restorePendingBackup}
      />
    </>
  )
}
