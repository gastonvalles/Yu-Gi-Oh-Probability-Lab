import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { NavGroup, NavItem, NavTone } from '../shell/nav-model'
import type { IconName } from '../ui/Icon'

export type DeckWorkflowStepKey = 'deck-builder' | 'categorization' | 'probability-lab' | 'export' | 'workspace' | 'solo' | 'practice' | 'duel' | 'life' | 'meta' | 'tier-maker' | 'tournaments' | 'replays' | 'expansions' | 'banlists'

export interface DeckModeNavigationItem {
  key: DeckWorkflowStepKey
  step: string
  /** Nombre corto: es el que se ve en las pestañas (igual en desktop y mobile). */
  label: string
  /** Nombre completo: tooltip y lectores de pantalla. */
  title: string
  icon: IconName
  /** Estado del paso: tooltip y lectores de pantalla. */
  detail: string
  tone: NavTone
  disabled: boolean
  /** La línea corta de la hoja del celular (los pasos de referencia). */
  blurb?: string
  /** El estado de la hoja del celular (los pasos del deck). */
  pill?: { label: string; ok?: boolean }
}

interface DeckWorkflowNavigationSnapshot {
  mainDeckCount: number
  roleCardCount: number
  unclassifiedCardCount: number
  /** Las cartas con roles sugeridos que todavía no se confirmaron (lo que dice «N sin confirmar» en la hoja del celular). */
  pendingReviewCount?: number
  hasCompletedRoleStep: boolean
  patternCount: number
  /** Las builds guardadas para comparar (el estado de «Comparar» en la hoja del celular). */
  savedBuildCount?: number
}

const WORKFLOW_STEP_KEYS: readonly DeckWorkflowStepKey[] = [
  'deck-builder',
  'categorization',
  'probability-lab',
  'workspace',
  'export',
  'solo',
  'practice',
  'duel',
  'life',
  'meta',
  'tier-maker',
  'tournaments',
  'replays',
  'expansions',
  'banlists',
]

export function isDeckWorkflowStepKey(value: string): value is DeckWorkflowStepKey {
  return WORKFLOW_STEP_KEYS.some((stepKey) => stepKey === value)
}

export function buildDeckWorkflowNavigationItems({
  mainDeckCount,
  roleCardCount,
  unclassifiedCardCount,
  pendingReviewCount = 0,
  hasCompletedRoleStep,
  patternCount,
  savedBuildCount = 0,
}: DeckWorkflowNavigationSnapshot): DeckModeNavigationItem[] {
  return [
    {
      key: 'deck-builder',
      pill:
        mainDeckCount >= 40
          ? { label: t('shell.pill.deckReady', { count: formatInteger(mainDeckCount) }), ok: true }
          : { label: mainDeckCount > 0 ? t('shell.pill.deckMissing', { count: formatInteger(mainDeckCount) }) : t('shell.pill.deckEmpty') },
      step: '1',
      label: t('shell.step.deck.label'),
      title: t('shell.step.deck.title'),
      icon: 'cards',
      detail:
        mainDeckCount >= 40
          ? t('shell.step.deck.ready')
          : mainDeckCount > 0
            ? t('shell.step.deck.remaining', { count: formatInteger(Math.max(0, 40 - mainDeckCount)) })
            : t('shell.step.deck.empty'),
      tone: mainDeckCount >= 40 ? 'complete' : mainDeckCount > 0 ? 'progress' : 'pending',
      disabled: false,
    },
    {
      key: 'categorization',
      pill: {
        label:
          roleCardCount === 0
            ? t('shell.pill.rolesNeedMain')
            : unclassifiedCardCount > 0
              ? t('shell.pill.rolesMissing', { count: unclassifiedCardCount })
              : pendingReviewCount > 0
                ? t('shell.pill.rolesReview', { count: pendingReviewCount })
                : t('shell.pill.rolesDone'),
        ok: roleCardCount > 0 && unclassifiedCardCount === 0 && pendingReviewCount === 0,
      },
      step: '2',
      label: t('shell.step.roles.label'),
      title: t('shell.step.roles.title'),
      icon: 'tag',
      detail:
        roleCardCount === 0
          ? t('shell.step.roles.needsMain')
          : hasCompletedRoleStep
            ? t('shell.step.roles.done')
            : t('shell.step.roles.open', { count: formatInteger(unclassifiedCardCount) }),
      tone:
        roleCardCount === 0
          ? 'pending'
          : hasCompletedRoleStep
            ? 'complete'
            : 'progress',
      disabled: roleCardCount === 0,
    },
    {
      key: 'probability-lab',
      pill: { label: !hasCompletedRoleStep ? t('shell.pill.labFirst') : patternCount > 0 ? t('shell.pill.labRules', { count: patternCount }) : t('shell.pill.labBase') },
      step: '3',
      label: t('shell.step.lab.label'),
      title: t('shell.step.lab.title'),
      icon: 'flask',
      detail: hasCompletedRoleStep
        ? patternCount > 0
          ? t('shell.step.lab.ready')
          : t('shell.step.lab.baseRules')
        : t('shell.step.lab.classifyFirst'),
      tone: hasCompletedRoleStep ? 'complete' : 'pending',
      disabled: false,
    },
    {
      key: 'workspace',
      pill: { label: t('shell.pill.builds', { count: savedBuildCount }) },
      step: '4',
      label: t('shell.step.compare.label'),
      title: t('shell.step.compare.title'),
      icon: 'columns',
      detail: t('shell.step.compare.detail'),
      tone: 'pending',
      disabled: false,
    },
    {
      key: 'export',
      pill: { label: t('shell.pill.exportFormats') },
      step: '5',
      label: t('shell.step.export.label'),
      title: t('shell.step.export.title'),
      icon: 'download',
      detail: mainDeckCount > 0 ? t('shell.step.export.formats') : t('shell.step.export.needsMain'),
      tone: mainDeckCount > 0 ? 'complete' : 'pending',
      disabled: mainDeckCount === 0,
    },
    // No es un paso del deck: es la referencia del meta para armarlo (las tier lists). Siempre se puede abrir.
    {
      key: 'meta',
      blurb: t('shell.blurb.meta'),
      step: '6',
      label: t('shell.step.meta.label'),
      title: t('shell.step.meta.title'),
      icon: 'chart',
      detail: t('shell.step.meta.detail'),
      tone: 'pending',
      disabled: false,
    },
    // Y la herramienta para armar las propias (cartas repartidas en filas, guardadas en el navegador y bajadas como imagen): es «La tuya» de Tier lists, así que el menú la oculta.
    {
      key: 'tier-maker',
      blurb: t('shell.blurb.tierMaker'),
      step: '6b',
      label: t('shell.step.tierMaker.label'),
      title: t('shell.step.tierMaker.title'),
      icon: 'sort',
      detail: t('shell.step.tierMaker.detail'),
      tone: 'pending',
      disabled: false,
    },
    // También es referencia, y va aparte de las tier lists: los decks que llegaron al top de los torneos, completos.
    {
      key: 'tournaments',
      blurb: t('shell.blurb.tournaments'),
      step: '7',
      label: t('shell.step.tournaments.label'),
      title: t('shell.step.tournaments.title'),
      icon: 'trophy',
      detail: t('shell.step.tournaments.detail'),
      tone: 'pending',
      disabled: false,
    },
    // Y los duelos de torneo de esos decks, en video.
    {
      key: 'replays',
      blurb: t('shell.blurb.replays'),
      step: '8',
      label: t('shell.step.replays.label'),
      title: t('shell.step.replays.title'),
      icon: 'play',
      detail: t('shell.step.replays.detail'),
      tone: 'pending',
      disabled: false,
    },
    // Y el catálogo: las cartas de cada expansión con su rareza y su precio.
    {
      key: 'expansions',
      blurb: t('shell.blurb.expansions'),
      step: '9',
      label: t('shell.step.expansions.label'),
      title: t('shell.step.expansions.title'),
      icon: 'package',
      detail: t('shell.step.expansions.detail'),
      tone: 'pending',
      disabled: false,
    },
    // Y las listas de prohibidas y limitadas de todas las épocas, del TCG y del OCG.
    {
      key: 'banlists',
      blurb: t('shell.blurb.banlists'),
      step: '10',
      label: t('shell.step.banlists.label'),
      title: t('shell.step.banlists.title'),
      icon: 'ban',
      detail: t('shell.step.banlists.detail'),
      tone: 'pending',
      disabled: false,
    },
  ]
}

/** Lo que el menú necesita saber de afuera: si hay relay y el duelo en pausa. */
interface AppNavTools {
  /** El duelo en pausa de este navegador: la hoja del celular ofrece volver a él. */
  paused?: { room: string; rival: string | null } | null
  /** El duelo en línea (Online) sólo se ofrece donde hay un relay al que conectarse. */
  duel?: boolean
}

/**
 * El menú de la app, en cuatro grupos, uno por lo que se viene a hacer: **Tu deck** (el recorrido del Lab: armarlo, clasificar sus cartas, medirlo, comparar builds y exportarlo), **Jugar** (Solo —contra
 * un bot con su mazo o tu mesa sin bot—, Online —sólo con relay— y la calculadora de LP), **Descubrir** (lo que gana en los torneos: tier lists, decks y replays) y **Cartas** (la referencia:
 * expansiones y banlists). Las mascotas no son un destino sino una preferencia: van abajo, con el idioma, y abren su panel.
 * Lo ven el menú lateral y la barra de abajo del celular. La hoja del celular de cada grupo se dibuja como en el lienzo: los pasos del deck con su estado a la derecha; Jugar, Descubrir y Cartas
 * con una línea que explica cada una. En Jugar, con relay, Solo y Online van arriba en dos tarjetas grandes (el SOLO/ONLINE de Master Duel) y debajo mirar un duelo, entrar con un enlace y la
 * calculadora; sin relay Solo es una fila más (con una sola entrada no hay tarjetas). Si hay un duelo en pausa, un aviso para volver a él.
 */
export function buildAppNavGroups(steps: DeckModeNavigationItem[], tools: AppNavTools): NavGroup[] {
  const pick = (...keys: DeckWorkflowStepKey[]): NavItem[] => keys.flatMap((key) => steps.filter((step) => step.key === key))
  const entry = (key: string, label: string, blurb: string): NavItem => ({ key, label, title: label, icon: 'link' as const, blurb })
  // Solo se ve aunque falten cartas (la pantalla dice qué falta). La mesa (`#practice`) es adonde lleva Solo: queda oculta, para que el grupo siga marcado en ella.
  const solo: NavItem = { key: 'solo', label: t('shell.solo.title'), title: t('shell.solo.title'), icon: 'user' as const, blurb: t('shell.blurb.solo') }
  const table: NavItem = { ...solo, key: 'practice', hidden: true }
  const online: NavItem[] = tools.duel ? [{ key: 'duel', label: t('shell.online.title'), title: t('shell.online.title'), icon: 'link' as const, blurb: t('shell.blurb.online') }] : []
  const paused = tools.duel ? tools.paused ?? null : null
  const life: NavItem = { key: 'life', label: t('shell.life.title'), title: t('shell.life.title'), icon: 'heart' as const, blurb: t('shell.blurb.life') }

  return [
    // Exportar (la lista en PDF para un torneo, el YDK para un simulador) cierra el recorrido del deck: va en «Tu deck», después de Comparar.
    { key: 'deck', label: t('shell.nav.group.deck'), icon: 'cards' as const, sheet: 'status' as const, items: pick('deck-builder', 'categorization', 'probability-lab', 'workspace', 'export') },
    {
      key: 'duel',
      label: t('shell.nav.group.duel'),
      icon: 'target' as const,
      sheet: 'description' as const,
      items: [solo, table, ...online, life],
      ...(tools.duel ? { sheetCards: [solo, ...online] } : {}),
      sheetItems: tools.duel ? [entry('duel-watch', t('duel.watchRoom.open'), t('shell.blurb.watch')), entry('duel-join', t('shell.duel.join'), t('shell.blurb.join')), life] : [solo, life],
      sheetNotice: paused
        ? {
            title: paused.rival ? t('shell.paused.title', { name: paused.rival }) : t('shell.paused.titleNoName'),
            text: t('shell.paused.text'),
            actionLabel: t('shell.paused.resume'),
            actionKey: 'duel-resume',
          }
        : undefined,
    },
    // Crear la tuya es «La tuya» de Tier lists: el paso queda oculto, para que el buscador de la app lo siga encontrando por sus palabras.
    { key: 'discover', label: t('shell.nav.group.discover'), icon: 'compass' as const, sheet: 'description' as const, items: [...pick('meta'), ...pick('tier-maker').map((item) => ({ ...item, hidden: true })), ...pick('tournaments', 'replays')] },
    { key: 'cards', label: t('shell.nav.group.cards'), icon: 'package' as const, sheet: 'description' as const, items: pick('expansions', 'banlists') },
  ].filter((group) => group.items.length > 0)
}
