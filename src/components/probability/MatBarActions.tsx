import { toggleDuelFullscreen, useDuelFullscreen } from '../../app/duel-fullscreen'
import { setSoundsOn, useSoundsOn } from '../../app/sound-prefs'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { HandtrapsMatButton } from '../duel/HandtrapPool'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { MatViewToggle } from './MatViewToggle'

/**
 * La fila de la barra de arriba que lleva los íconos de la mesa (la de la práctica y la de «Jugar solo automático»): en un celular angosto los botones de 44 px no entran y se achican
 * (40 px hasta 419 px de ancho, 36 hasta 379), y el área que se toca crece 2 px a cada lado (`before`, sin agrandar lo que se ve): 44 px a 390 px de ancho.
 */
export const MAT_BAR_ROW =
  'flex items-center gap-1 max-[419px]:gap-0.5 max-[419px]:[&>button]:size-10! max-[379px]:[&>button]:size-9! max-[419px]:[&>button]:relative max-[419px]:[&>button]:before:absolute max-[419px]:[&>button]:before:-inset-0.5'

/** «Volver a Jugar» (la flecha de la izquierda de la barra de la mesa): la práctica y el automático salen igual, al inicio de Jugar. */
export function MatExitButton({ onExit }: { onExit: () => void }) {
  return (
    <IconButton tone="flat" size="sm" aria-label={t('practice.mat.exit')} title={t('practice.mat.exit')} onClick={onExit}>
      <Icon name="chevron-left" />
    </IconButton>
  )
}

interface MatBarActionsProps {
  /** Deshacer: la última jugada (la práctica) o tu última orden al núcleo (el automático); `canUndo` apagado si no hay. */
  onUndo: () => void
  canUndo: boolean
  /** «Nueva mano»: la práctica reparte otra; el automático arma otro duelo, con otra semilla (otras cartas). */
  onNewHand: () => void
  /** Se aplicaron las handtraps del rival (ya quedaron guardadas): la práctica reparte otra mano; el automático arma el duelo de nuevo. */
  onHandtraps: () => void
  /** El duelo automático: la hoja de las handtraps dice que aplicar reinicia el duelo y cuáles el rival todavía no usa solo. */
  auto?: boolean
  /** «Guardar combo» (sin esto no está: el automático todavía no tiene los pasos); `canSave` apagado sin jugadas. */
  onSave?: () => void
  canSave?: boolean
  /** Para el primero (la vista): la práctica empuja el grupo a la derecha (`ml-auto`). */
  className?: string
}

/**
 * Los íconos de la barra de arriba de la mesa, los mismos en la práctica (`PracticeMat`) y en «Jugar solo automático» (`AutoBar`), y en este orden: la vista (3D o superior), los sonidos,
 * la ventana grande (sólo en escritorio: en el celular la mesa ya ocupa todo), las handtraps del rival, «Nueva mano», deshacer y «Guardar combo». Lo propio de cada mesa va después, en
 * su barra: los pasos de la práctica (en el celular) y el engranaje del automático (Gastón, 2026-10-25: «TODAS las mesas deberían ser iguales… menos las opciones de cada una»).
 *
 * - Variantes: con o sin «Guardar combo» (`onSave`); la hoja de las handtraps de la práctica o la del automático (`auto`).
 * - Estados: blancos y en ámbar al apuntarlos, al enfocarlos (el aro de siempre) o con el ajuste prendido (`aria-pressed`: los sonidos, la ventana grande y las handtraps; la vista 3D con
 *   `data-active`); deshacer y guardar se apagan sin nada que deshacer o guardar.
 * - Accesibilidad: cada uno con `aria-label` y `title` (el de los sonidos y el de la ventana grande dicen qué pasa al tocarlos). Son botones sueltos (un fragmento): van dentro del
 *   `role="toolbar"` de la barra, que los acomoda y los achica en el celular (`MAT_BAR_ROW`, `[&>button]`).
 * - El estado es de toda la app (la vista, los sonidos, la ventana grande y las handtraps se recuerdan): las dos mesas lo comparten y acá no se guarda nada.
 * - Hacer: lo propio de una mesa va después del grupo, en su barra. No hacer: copiar uno de estos botones en otra barra (lo que falta se suma acá, con una prop) ni mostrar uno
 *   que esa mesa no usa (sin `onSave` no hay «Guardar combo»).
 * - Usos: la barra de la práctica (`PracticeMat`), la de «Jugar solo automático» (`AutoBar`: en el celular, en escritorio y con laterales) y la muestra del catálogo; la del duelo
 *   por enlace (`DuelBar`) puede tomarlo igual, con su engranaje y su bandera después.
 */
export function MatBarActions({ onUndo, canUndo, onNewHand, onHandtraps, auto = false, onSave, canSave = false, className }: MatBarActionsProps) {
  const sounds = useSoundsOn()
  const bigWindow = useDuelFullscreen()
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  return (
    <>
      <MatViewToggle className={className} />
      {/* Los sonidos de las jugadas: el mismo ajuste que «Más opciones» de un duelo (se recuerda en el navegador). */}
      <IconButton tone="flat" size="sm" aria-label={t('practice.mat.sounds')} title={t(sounds ? 'practice.mat.soundsOff' : 'practice.mat.soundsOn')} aria-pressed={sounds} onClick={() => setSoundsOn(!sounds)}>
        <Icon name={sounds ? 'volume' : 'volume-off'} />
      </IconButton>
      {/* Ventana grande: sin el menú lateral y, si el navegador deja, en pantalla completa. Es de la mesa: se apaga al salir de ella. */}
      {isDesktop ? (
        <IconButton tone="flat" size="sm" aria-label={bigWindow ? t('duel.bar.bigWindowOff') : t('duel.bar.bigWindowOn')} title={bigWindow ? t('duel.bar.bigWindowOff') : t('duel.bar.bigWindowOn')} aria-pressed={bigWindow} onClick={toggleDuelFullscreen}>
          <Icon name={bigWindow ? 'minimize' : 'maximize'} />
        </IconButton>
      ) : null}
      {/* Las handtraps del rival: se encienden y se elige el pool acá. Con menos de 340 px no entra. */}
      <HandtrapsMatButton className="max-[339px]:hidden" auto={auto} onApply={onHandtraps} />
      <IconButton tone="flat" size="sm" aria-label={t('practice.mat.newHand')} title={t('practice.mat.newHand')} onClick={onNewHand}>
        <Icon name="refresh" />
      </IconButton>
      <IconButton tone="flat" size="sm" aria-label={t('practice.mat.undo')} title={t('practice.mat.undo')} disabled={!canUndo} className="disabled:opacity-35" onClick={onUndo}>
        <Icon name="undo" />
      </IconButton>
      {onSave ? (
        <IconButton tone="flat" size="sm" aria-label={t('practice.mat.saveCombo')} title={t('practice.mat.saveCombo')} disabled={!canSave} className="disabled:opacity-35" onClick={onSave}>
          <Icon name="save" />
        </IconButton>
      ) : null}
    </>
  )
}
