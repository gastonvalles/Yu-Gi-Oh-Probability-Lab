import { createContext, useContext, type ReactNode } from 'react'

import { toggleDuelFullscreen, useDuelFullscreen } from '../../app/duel-fullscreen'
import { setMatView, useMatView } from '../../app/mat-view'
import { setSoundsOn, useSoundsOn } from '../../app/sound-prefs'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { useHandtrapsSheet } from '../duel/HandtrapPool'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { OverflowMenu, type OverflowItem } from '../ui/OverflowMenu'

/** La fila de la barra de arriba que lleva los íconos de la mesa (la de la práctica y la de «Jugar solo automático»): con tres o cuatro íconos de 44 px entran también a 360 px. */
export const MAT_BAR_ROW = 'flex items-center gap-1'

/** «Volver a Jugar» (la flecha de la izquierda de la barra de la mesa): la práctica y el automático salen igual, al inicio de Jugar. */
export function MatExitButton({ onExit }: { onExit: () => void }) {
  return (
    <IconButton tone="flat" size="sm" aria-label={t('practice.mat.exit')} title={t('practice.mat.exit')} onClick={onExit}>
      <Icon name="chevron-left" />
    </IconButton>
  )
}

/**
 * «Guardar combo» de la mesa, para una barra que arma la pantalla (`duel.header`: la de «Jugar solo automático»): el diálogo y la lista de combos son de la mesa (`PracticeMat`),
 * que lo pone alrededor de esa barra; sin `onSave`, `MatBarActions` toma éste.
 */
export const MatSaveContext = createContext<{ onSave: () => void; canSave: boolean } | null>(null)

/** Las salidas y problemas de la mano en el celular (`RulesPill`), que la mesa pone en la barra antes de Deshacer: la de la práctica y la de «Jugar solo automático». Sin ella, nada. */
export const MatRulesContext = createContext<ReactNode>(null)

/** «Pasos y combos» como primer ítem del ⋯: la mesa lo da cuando no tiene la fila de abajo donde iba su botón («Jugar solo automático» en el celular en vertical). Sin él, no va. */
export const MatStepsContext = createContext<(() => void) | null>(null)

/**
 * El replay partido de «Jugar solo automático» en el celular (sin la fila de abajo): qué paso se mira (`step`, el segundo renglón del aviso del repaso) y la línea de tiempo con la lista (`timeline`,
 * debajo del aviso). La mesa lo da sólo mientras se repasa un combo; abajo quedan los botones (`ReplayTransport`). Sin él, el aviso va como siempre.
 */
export const MatReplayContext = createContext<{ step: string; timeline: ReactNode } | null>(null)

/** Deshacer de un duelo por enlace, para su barra de arriba (`DuelBar`, con `undoInHeader`): lo arma la mesa con su estado (sin jugadas, esperando el permiso del rival). Sin él, nada. */
export const MatUndoContext = createContext<ReactNode>(null)

/**
 * «La mesa», el primer grupo del menú ⋯ de toda mesa (la práctica, «Jugar solo automático» y el duelo por enlace): la vista 3D, los sonidos y la ventana grande (sólo en escritorio: en el celular la mesa
 * ya ocupa todo), cada uno con su interruptor. Vienen prendidos de fábrica (la vista 3D y los sonidos) y por eso no van a la vista ni en color: su estado se lee en el interruptor.
 */
export function useMatTableItems(): OverflowItem[] {
  const view = useMatView()
  const sounds = useSoundsOn()
  const bigWindow = useDuelFullscreen()
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  return [
    { group: t('practice.mat.groupTable'), label: t('practice.view.3d'), icon: 'cube', checked: view === '3d', onSelect: () => setMatView(view === '3d' ? 'top' : '3d') },
    { label: t('practice.mat.sounds'), icon: sounds ? 'volume' : 'volume-off', checked: sounds, onSelect: () => setSoundsOn(!sounds) },
    // Ventana grande: sin el menú lateral y, si el navegador deja, en pantalla completa. Es de la mesa: se apaga al salir de ella.
    ...(isDesktop ? [{ label: t('duel.bar.bigWindowOn'), icon: bigWindow ? 'minimize' : 'maximize', checked: bigWindow, onSelect: toggleDuelFullscreen } satisfies OverflowItem] : []),
  ]
}

/** El ⋯ de la barra de la mesa (blanco de 44 px; ámbar al apuntarlo, al enfocarlo o abierto): «La mesa» y lo de cada una, en grupos. */
export function MatMoreMenu({ items, lead = [], defaultOpen = false }: { items: OverflowItem[]; /** Lo que va antes de «La mesa» («Pasos y combos»). */ lead?: OverflowItem[]; /** Abierto de entrada (la muestra del catálogo). */ defaultOpen?: boolean }) {
  return <OverflowMenu trigger="bar" label={t('practice.mat.more')} items={[...lead, ...useMatTableItems(), ...items]} defaultOpen={defaultOpen} />
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
  /** «Guardar combo»; `canSave` apagado sin jugadas. Sin esto, el de la mesa (`MatSaveContext`, el automático) o ninguno (el duelo por enlace). */
  onSave?: () => void
  canSave?: boolean
  /** Lo propio de cada mesa, al final del menú (el automático en el celular: «Opciones del duelo»). */
  more?: OverflowItem[]
  /** Para el primero (deshacer): la práctica empuja el grupo a la derecha (`ml-auto`). */
  className?: string
  /** El ⋯ abierto de entrada (la muestra del catálogo). */
  menuOpen?: boolean
}

/**
 * La barra de arriba de la mesa, la misma en la práctica (`PracticeMat`) y en «Jugar solo automático» (`AutoBar`): a la vista sólo deshacer (lo que se toca en cada jugada) y el ⋯ (`MatMoreMenu`),
 * que lleva lo demás en dos grupos: «La mesa» (la vista 3D, los sonidos y la ventana grande, con su interruptor) y «El duelo» (las handtraps del rival, «Nueva mano», «Guardar combo» y lo de cada mesa).
 * La flecha de salir va antes, en la barra de cada una (Gastón, 2026-10-26: «muchos íconos juntos»; antes eran siete a la vista).
 *
 * - Estados: blancos y en ámbar sólo al apuntarlos, al enfocarlos (el aro de siempre) o con el menú abierto; deshacer se apaga sin nada que deshacer y «Guardar combo» sin jugadas («sin jugadas»).
 *   Ningún ícono de la barra queda en ámbar por estar prendido: lo prendido se lee en su interruptor, adentro del ⋯.
 * - Accesibilidad: cada uno con `aria-label` y `title`; el menú es `role="menu"` (los ajustes, `menuitemcheckbox`), ↑ ↓ lo recorren y Escape lo cierra.
 * - El estado es de toda la app (la vista, los sonidos, la ventana grande y las handtraps se recuerdan): las mesas lo comparten y acá no se guarda nada.
 * - Hacer: lo propio de una mesa va en `more` o después, en su barra. No hacer: sacar uno de estos al lado del ⋯ ni copiar uno en otra barra.
 * - Usos: la barra de la práctica (`PracticeMat`), la de «Jugar solo automático» (`AutoBar`: en el celular, en escritorio y con laterales) y la muestra del catálogo; la del duelo por enlace (`DuelBar`)
 *   arma su ⋯ con el mismo grupo «La mesa» (`MatMoreMenu`).
 */
export function MatBarActions({ onUndo, canUndo, onNewHand, onHandtraps, auto = false, onSave, canSave = false, more = [], className, menuOpen = false }: MatBarActionsProps) {
  const fromMat = useContext(MatSaveContext)
  const rules = useContext(MatRulesContext)
  const openSteps = useContext(MatStepsContext)
  const save = onSave ? { onSave, canSave } : fromMat
  const handtraps = useHandtrapsSheet({ onApply: onHandtraps, auto })

  return (
    <>
      {/* La píldora toma el lugar libre (`flex-1`): ya empuja los íconos a la derecha. */}
      {rules}
      <IconButton tone="flat" size="sm" aria-label={t('practice.mat.undo')} title={t('practice.mat.undo')} disabled={!canUndo} className={cx('disabled:opacity-35', !rules && className)} onClick={onUndo}>
        <Icon name="undo" />
      </IconButton>
      <MatMoreMenu
        defaultOpen={menuOpen}
        lead={openSteps ? [{ label: t('practice.mat.stepsAndCombos'), icon: 'list', opens: true, onSelect: openSteps }] : []}
        items={[
          { group: t('practice.mat.groupDuel'), label: t('handtraps.title'), icon: 'hand', meta: t(handtraps.config.enabled ? 'handtraps.mat.on' : 'handtraps.mat.off'), opens: true, onSelect: handtraps.open },
          { label: t('practice.mat.newHand'), icon: 'refresh', onSelect: onNewHand },
          ...(save ? [{ label: t('practice.mat.saveCombo'), icon: 'save', disabled: !save.canSave, ...(save.canSave ? {} : { meta: t('practice.mat.saveNone') }), onSelect: save.onSave } satisfies OverflowItem] : []),
          ...more,
        ]}
      />
      {handtraps.sheet}
    </>
  )
}
