import { useMemo, useRef, useState, type ComponentProps } from 'react'

import { SUPPORT_PLACE, inMenuBlocks, type MenuPlace } from '../../../app/mat-menu-order'
import type { LabResults, LabViewResult } from '../../../app/probability-lab'
import { printImageUrl } from '../../../app/card-prices'
import type { MatPile } from '../../../app/practice-mat'
import type { ArtChoice } from '../../../app/use-card-art-options'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../../app/use-media-query'
import { Presence } from '../../../app/use-presence'
import { useSheetDrag } from '../../../app/use-sheet-drag'
import { showToastMessage, type ToastTone } from '../../../app/use-toast-message'
import { formatDay, t } from '../../../i18n'
import type { ApiCardReference } from '../../../types'
import { foilKindOf, type FoilFrame, type FoilKind } from '../../../app/card-foil'
import { CardGlare, TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from '../../card-detail/card-tilt'
import { CardZoom } from '../../card-detail/CardZoom'
import { RarityFoil } from '../../card-detail/RarityFoil'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Heading } from '../../ui/Heading'
import { LanguageSwitcher } from '../../ui/LanguageSwitcher'
import { Modal } from '../../ui/Modal'
import { SheetHandle } from '../../ui/SheetHandle'
import { overline } from '../../ui/typography'
import { CardSheet } from '../../probability/CardSheet'
import { ConfirmDialog } from '../../probability/ConfirmDialog'
import { LabScoreSheet } from '../../probability/LabScoreSheet'
import { CardMenu, PILE_TITLES, PileStripContext, PileViewer, PlayTag, type MenuItem } from '../../probability/MatDialogs'
import { PhaseRow } from '../../probability/PhaseRow'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'
import { sampleCombo } from './duel-sample'

const SIZES = ['sm', 'md', 'full', 'sheet', 'screen', 'keypad'] as const

type ConfirmSample = Omit<ComponentProps<typeof ConfirmDialog>, 'isOpen' | 'onCancel' | 'onConfirm'>

/** Tres confirmaciones de referencia, con texto de acá: borrar algo con nombre, descartar (el botón seguro dice lo que sigue) y una que no destruye (violeta). */
const REFERENCE_CONFIRMS: ConfirmSample[] = [
  { title: '¿Borrar “Branded 40”?', description: 'Se borra la build guardada. No se puede deshacer.', confirmLabel: 'Borrar build', confirmColor: 'danger' },
  { title: '¿Descartar los cambios?', description: 'Se pierde lo que editaste desde que guardaste.', cancelLabel: 'Seguir editando', confirmLabel: 'Descartar', confirmColor: 'danger' },
  { title: '¿Terminar tu turno?', description: 'El turno pasa a Ana.', confirmLabel: 'Terminar turno' },
]

/** Cinco confirmaciones de la app con sus textos de verdad: se arman al dibujar (`t()` nunca al cargar el módulo) y salen en el idioma elegido. */
const appConfirms = (): ConfirmSample[] => [
  { title: t('builder.delete.title', { name: '2+ Handtraps yendo 2º' }), description: t('builder.delete.impact.second', { before: '96', after: '84' }), confirmLabel: t('builder.delete.confirm'), confirmColor: 'danger' },
  { title: t('deck.builder.clearAllTitle'), description: t('deck.builder.clearConfirm', { count: 40 }), confirmLabel: t('deck.builder.clearConfirmYes'), confirmColor: 'danger' },
  {
    title: t('deck.import.replace.title'),
    description: t('deck.import.replace.description', { count: 40, incoming: 42 }),
    cancelLabel: t('deck.import.replace.keep'),
    confirmLabel: t('deck.import.replace.confirm'),
    confirmColor: 'danger',
  },
  { title: t('deck.backup.confirmTitle'), description: t('deck.backup.confirmTextDated', { date: formatDay('2026-10-12T10:00:00.000Z') }), confirmLabel: t('deck.backup.confirmButton'), confirmColor: 'danger' },
  { title: t('roles.panel.confirmTitle'), description: t('roles.panel.confirmText', { count: 40 }), confirmLabel: t('roles.panel.confirmAction'), confirmColor: 'danger' },
]
const sampleView = (clean: number, handSize: number, cleanHands: number | null, totalHands: number | null): LabViewResult => ({
  handSize,
  cleanProbability: clean,
  noOpeningProbability: 1 - clean,
  withProblemProbability: 0,
  cleanHands,
  totalHands,
  patternResults: [],
  segmentRules: { clean: [], withProblem: [], noOpening: [] },
})
const SAMPLE_RESULTS: LabResults = { first: sampleView(0.846, 5, 556416, 658008), second: sampleView(0.903, 6, 4401234, 4874568), average: sampleView(0.875, 5, null, null) }
const TOASTS: ToastTone[] = ['info', 'success', 'warning', 'error']

// La carta en grande de muestra: una carta real (su escaneo en TCGplayer) con dos impresiones, para probar el zoom, el texto y la lista.
const ZOOM_PRODUCT = 207892
const ZOOM_CARD = {
  ygoprodeckId: 2801664,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description:
    'Gains 300 ATK for each monster your opponent controls, during your turn only. You can only use each of the following effects of "Ancient Warriors - Valiant Zhang De" once per turn.\n● If you control 2 or more "Ancient Warriors" monsters: You can Special Summon this card from your hand.\n● If your opponent controls more monsters than you do: You can activate this effect; this card can make up to 2 attacks on monsters during each Battle Phase this turn.',
  race: 'Beast-Warrior',
  attribute: 'WIND',
  level: 7,
  linkValue: null,
  atk: '2700',
  def: '900',
  archetype: 'Ancient Warriors',
  ygoprodeckUrl: null,
  imageUrl: printImageUrl(ZOOM_PRODUCT, 'in_1000x1000'),
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
} as ApiCardReference
// Una rareza de cada efecto, para ver todos los brillos de una vez, y dos de arte extendido (sin ventana: el brillo cubre toda la carta).
const FOIL_SAMPLES: ReadonlyArray<{ rarity: string; kind: FoilKind; frame: FoilFrame; product?: number }> = [
  ...[
    'Rare',
    'Super Rare',
    'Ultra Rare',
    'Secret Rare',
    'Ultimate Rare',
    'Platinum Secret Rare',
    'Gold Rare',
    'Ghost Rare',
    'Starfoil Rare',
    'Shatterfoil Rare',
    'Mosaic Rare',
    "Collector's Rare",
    'Prismatic Secret Rare',
    'Quarter Century Secret Rare',
    'Duel Terminal Ultra Parallel Rare',
    'Secret Pharaoh’s Rare',
    'Grand Master Rare',
    'Starlight Rare',
  ].flatMap((rarity) => {
    const kind = foilKindOf(rarity)

    return kind ? [{ rarity, kind, frame: 'monster' as const }] : []
  }),
  { rarity: 'Ultra Rare · Extended Art', kind: 'ultra', frame: 'full', product: 719865 },
  { rarity: 'Starlight Rare · Extended Art', kind: 'starlight', frame: 'full', product: 719866 },
]

const ZOOM_ARTS: ArtChoice[] = [
  {
    id: 'print-1',
    imageUrl: printImageUrl(ZOOM_PRODUCT, '400w'),
    imageUrlSmall: null,
    label: '',
    printing: { set: 'Ignition Assault', code: 'IGAS-EN013', rarity: 'Ultra Rare', variant: '', editions: [{ edition: '1st Edition', market: 0.29 }] },
  },
  {
    id: 'print-2',
    imageUrl: printImageUrl(ZOOM_PRODUCT, '400w'),
    imageUrlSmall: null,
    label: '',
    printing: { set: 'Ignition Assault', code: 'IGAS-EN013', rarity: 'Starlight Rare', variant: 'Extended Art', editions: [{ edition: '1st Edition', market: 107.11 }] },
  },
]

// El visor de una pila: las cartas del combo de muestra (nombre y arte de YGOPRODeck). Un cementerio de seis (sin buscador) y un Main de catorce (con buscador y tres Ash Blossom para filtrar).
const pileCard = (passcode: number, copy = 1) => `card-${passcode}-${copy}`
const ASH = pileCard(14558127)
const OGRE = pileCard(59438930)
const TALKER = pileCard(86066372)
const SAMPLE_GY = [ASH, OGRE, TALKER, pileCard(83764718), pileCard(27204311), pileCard(38342335)]
const SAMPLE_MAIN = [ASH, pileCard(5318639), OGRE, pileCard(14558127, 2), pileCard(53129443), pileCard(27204311), pileCard(10045474), pileCard(14558127, 3), pileCard(83764718), pileCard(24094653), pileCard(59438930, 2), pileCard(44095762), pileCard(53582587), pileCard(10045474, 2)]
// La tira: un Main más largo (veintidós), así en el ancho de la mesa no entra en dos renglones y se ve que se desliza.
const SAMPLE_DECK = [...SAMPLE_MAIN, ...[5318639, 53129443, 27204311, 83764718, 24094653, 44095762, 53582587, 10045474].map((passcode) => pileCard(passcode, 3))]
// Los monstruos del Extra Deck de la muestra: los únicos que pueden volver al Extra.
const SAMPLE_EXTRA = new Set([TALKER, pileCard(38342335)])

type PileSample = 'plain' | 'two' | 'none' | 'search' | 'batch' | 'strip'

/** Un estado del visor por muestra: qué pila, qué cartas, cuáles llevan la mira y si arranca eligiendo (y con cuáles); `strip`, la tira de la mesa del duelo (el deck del automático: por nombre y sin elegir varias). */
const PILE_SAMPLES: Record<PileSample, { pile: MatPile; ids: string[]; targeted?: string[]; start?: string[]; strip?: true }> = {
  plain: { pile: 'gy', ids: SAMPLE_GY, targeted: [pileCard(83764718)] },
  two: { pile: 'gy', ids: SAMPLE_GY, targeted: [ASH], start: [TALKER, ASH] },
  none: { pile: 'gy', ids: SAMPLE_GY, start: [] },
  search: { pile: 'deck', ids: SAMPLE_MAIN, start: [] },
  batch: { pile: 'gy', ids: SAMPLE_GY, start: [TALKER, ASH, OGRE] },
  strip: { pile: 'deck', ids: SAMPLE_DECK, strip: true },
}

/** Lo que dice una opción que no admiten todas las elegidas, como lo va a decir la mesa: hasta tres nombres; desde cuatro, cuántas. */
const notWith = (names: string[]) => (names.length > 3 ? `No va con ${names.length} de las elegidas` : `No va con ${names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names.at(-1)}` : names[0]}`)

const SEND = (rank: number): MenuPlace => ({ block: 'send', rank })
const PLAY: MenuPlace = { block: 'play', rank: 0 }

/**
 * El menú de Ash Blossom en la mano, en el orden del motor y con el bloque de cada opción, como lo arma la mesa: las respuestas de «cómo» van en `children` (el submenú en escritorio, la › en el
 * celular). `ask` es lo que hace tocar un grupo en la hoja (el segundo paso); `play`, una jugada de muestra.
 */
const ashMenuRows = (ask: (label: string) => void, play: (label: string) => () => void): { entry: MenuItem; place: MenuPlace }[] => {
  const group = (label: string, answers: string[]): MenuItem => ({ label, onSelect: () => ask(label), children: answers.map((answer) => ({ label: answer, onSelect: play(`${label}: ${answer.toLowerCase()}`) })) })
  const single = (label: string, utility?: true): MenuItem => ({ label, onSelect: play(label), utility })

  return [
    { entry: single(t('practice.menu.normalSummon')), place: PLAY },
    { entry: single(t('practice.menu.set')), place: PLAY },
    { entry: group(t('practice.menu.specialSummon'), [t('practice.menu.attack'), t('practice.menu.defense')]), place: PLAY },
    { entry: single(t('practice.menu.activateEffect')), place: PLAY },
    { entry: single(t('practice.menu.reveal'), true), place: SUPPORT_PLACE },
    { entry: single(t('practice.menu.target'), true), place: SUPPORT_PLACE },
    { entry: single(t('practice.menu.discard'), true), place: SEND(2) },
    { entry: { ...group(t('practice.menu.banish'), [t('practice.menu.banishFaceUp'), t('practice.menu.banishFaceDown')]), utility: true }, place: SEND(3) },
    { entry: { ...group(t('practice.menu.toDeck'), [t('practice.menu.deckRandom'), t('practice.menu.deckOnTop'), t('practice.menu.deckOnBottom')]), utility: true }, place: SEND(0) },
  ]
}

/** El asa de una hoja de abajo (la de verdad, con su arrastre) en un marco del tamaño de una mesa: la hoja se baja y se sube adentro del marco, no en la pantalla. */
function LowerSample() {
  const panelRef = useRef<HTMLElement | null>(null)
  const drag = useSheetDrag(panelRef)
  const title = `${PILE_TITLES.gy} · 6`

  return (
    <div className="relative h-80 w-full overflow-hidden rounded-card border border-border-subtle bg-background">
      <p className="m-0 p-3 text-micro text-soft">El campo y la mano van acá atrás: no se mueven.</p>
      <section ref={panelRef} aria-label={title} style={drag.style} className="absolute inset-x-0 bottom-0 flex h-56 flex-col overflow-hidden rounded-t-panel border border-b-0 border-border bg-card-background shadow-overlay">
        <SheetHandle drag={drag} label={title} className="bg-surface-raised">
          <header className="border-b border-border-subtle bg-surface-raised pb-2.5 pl-3 pr-2">
            <p className={cx('m-0', overline)}>{t('practice.mat.name')}</p>
            <Heading level="section">{title}</Heading>
          </header>
        </SheetHandle>
        <p inert={drag.lowered} className="m-0 p-3 text-body text-muted">
          Lo de adentro (lo buscado, lo elegido, el scroll, la pregunta que espera) queda como estaba mientras está bajada.
        </p>
      </section>
    </div>
  )
}

/** Diálogos y avisos: se abren desde acá, tal cual se ven en la app. */
export function DialogsSection() {
  const [size, setSize] = useState<(typeof SIZES)[number] | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [veilless, setVeilless] = useState(false)
  const [matSheet, setMatSheet] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomArt, setZoomArt] = useState('print-1')
  const [confirm, setConfirm] = useState<ConfirmSample | null>(null)
  const [pileSample, setPileSample] = useState<PileSample | null>(null)
  // El menú que abre el visor (como en la mesa, lo abre quien abrió el visor): el de una carta, o el del lote con «Elegir jugada». En escritorio, pegado; en el celular, la hoja de abajo.
  const [pileMenu, setPileMenu] = useState<{ kicker: string; title: string; rect: DOMRect; items: MenuItem[]; card?: string } | null>(null)
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // El menú de una carta de la mano (Ash Blossom): dónde se tocó y, si se abrió con una pregunta, cuál (en escritorio, su submenú abierto; en el celular, su segundo paso).
  const [ashMenu, setAshMenu] = useState<{ rect: DOMRect; ask?: string } | null>(null)
  // La etiqueta de una sola jugada: dónde se tocó.
  const [loneAt, setLoneAt] = useState<DOMRect | null>(null)
  // Las fases en una línea: dónde está el botón de la fase que la abrió.
  const [phasesAt, setPhasesAt] = useState<DOMRect | null>(null)
  const { nameOf, artOf } = useMemo(() => sampleCombo(), [])
  const pileShown = pileSample ? PILE_SAMPLES[pileSample] : null
  // Toda jugada cierra el visor, como en la mesa.
  const playSample = (label: string) => () => {
    setPileMenu(null)
    setPileSample(null)
    showToastMessage(`Jugada de muestra: ${label}`, 'info')
  }
  const cardItems = (): MenuItem[] =>
    [t('practice.menu.specialSummon'), t('practice.menu.toHand'), t('practice.menu.target'), t('practice.menu.banish'), t('practice.menu.toDeck')].map((label, index) => ({ label, onSelect: playSample(label), utility: index > 0 || undefined }))
  const batchItems = (ids: string[]): MenuItem[] => {
    const blocked = ids.filter((id) => !SAMPLE_EXTRA.has(id)).map(nameOf)
    const toExtra = t('practice.menu.toExtra')

    return [
      ...[t('practice.menu.toHand'), t('practice.menu.banish'), t('practice.menu.toDeck'), t('practice.menu.target')].map((label) => ({ label, onSelect: playSample(label), utility: true })),
      { label: toExtra, onSelect: playSample(toExtra), utility: true, disabled: blocked.length > 0, hint: blocked.length > 0 ? notWith(blocked) : undefined },
    ]
  }
  const ashRows = ashMenuRows(
    (label) => setAshMenu((current) => (current ? { ...current, ask: label } : current)),
    (label) => () => {
      setAshMenu(null)
      showToastMessage(`Jugada de muestra: ${label}`, 'info')
    },
  )
  const ashAsked = ashMenu?.ask === undefined ? undefined : ashRows.find(({ entry }) => entry.label === ashMenu.ask)?.entry
  const openButtons = (samples: ConfirmSample[]) =>
    samples.map((sample) => (
      <Button key={sample.title} size="sm" onClick={() => setConfirm(sample)}>
        {sample.title}
      </Button>
    ))

  return (
    <SpecimenGrid min="22rem">
      <Specimen title="Modal" note={<>Todo diálogo sale de <Tag>ui/Modal.tsx</Tag>; el tamaño es fijo y el cuerpo scrollea adentro.</>}>
        {SIZES.map((entry) => (
          <Button key={entry} size="sm" onClick={() => setSize(entry)}>
            {entry}
          </Button>
        ))}
        <Modal isOpen={size !== null} onClose={() => setSize(null)} size={size ?? 'sm'} kicker="Diálogo" icon="info" title={`Tamaño ${size ?? ''}`} subtitle="Un diálogo de prueba." footer={<Button onClick={() => setSize(null)}>Cerrar</Button>}>
          <p className="m-0 text-body text-muted">El contenido del diálogo scrollea adentro si no entra.</p>
        </Modal>
      </Specimen>

      <Specimen title="Modal sin velo" note={<>Los menús de la mesa (<Tag>veil={'{false}'}</Tag>, también en <Tag>ConfirmDialog</Tag> y <Tag>SideDrawer</Tag>): no oscurecen el fondo, así el campo se sigue viendo; el panel despega con el borde marcado (<Tag>surface.floating</Tag>) y la sombra. El foco, Escape y tocar afuera, como siempre.</>}>
        <Button size="sm" onClick={() => setVeilless(true)}>
          Abrir sin velo
        </Button>
        <Modal isOpen={veilless} onClose={() => setVeilless(false)} size="keypad" veil={false} title="Elegí la posición">
          <p className="m-0 text-body text-muted">Lo de atrás se ve tal cual.</p>
        </Modal>
      </Specimen>

      <Specimen
        title="Confirmación"
        layout="column"
        note={
          <>
            Toda confirmación es un <Tag>probability/ConfirmDialog.tsx</Tag> (un <Tag>Modal size="keypad"</Tag>: en el celular sale de abajo; las de la mesa del duelo, <Tag>anchor="mat"</Tag>, como la hoja de la mesa). El título pregunta con el verbo; el cuerpo dice qué pasa y si se puede deshacer; «Cancelar» va sin caja (o dice lo que sigue, como «Seguir editando», si sería ambiguo) y la principal, al final, repite el verbo del título. Rojo sólo si no hay vuelta. Las de la app salen en el idioma elegido.
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <Tag>de referencia</Tag>
          {openButtons(REFERENCE_CONFIRMS)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Tag>de la app</Tag>
          {openButtons(appConfirms())}
          <LanguageSwitcher />
        </div>
        <ConfirmDialog {...(confirm ?? REFERENCE_CONFIRMS[0]!)} isOpen={confirm !== null} onCancel={() => setConfirm(null)} onConfirm={() => setConfirm(null)} />
      </Specimen>

      <Specimen
        title="Menú de una carta"
        note={
          <>
            En escritorio, pegado a la carta (<Tag>CardMenu</Tag>): todo al medio y en tres bloques con una línea fina entre ellos, apoyo (Revelar, Target), envíos (Al deck, Descartar, Desterrar) y las jugadas, con la principal abajo, pegada a la carta. Una opción con › abre al costado un submenú con el «cómo» (al pasar el mouse, con un clic, Enter o →; ← o Escape lo cierran) sin mover el menú; sin ›, actúa o pregunta ahí mismo. En el celular, la hoja de abajo (<Tag>CardSheet</Tag>) en el orden de siempre: la › en los botones que abren un segundo paso y, en ese paso, la flecha para volver. El orden: <Tag>app/mat-menu-order.ts</Tag>.
          </>
        }
      >
        <Button size="sm" onClick={(event) => setAshMenu({ rect: event.currentTarget.getBoundingClientRect() })}>
          Abrir el menú de Ash Blossom
        </Button>
        <Button size="sm" onClick={(event) => setAshMenu({ rect: event.currentTarget.getBoundingClientRect(), ask: t('practice.menu.specialSummon') })}>
          Abrir con «{t('practice.menu.specialSummon')}» abierto
        </Button>
        <LanguageSwitcher />
      </Specimen>
      <Presence>
        {ashMenu && !isDesktop ? (
          <CardSheet
            name={nameOf(ASH)}
            kicker={ashAsked?.label ?? PILE_TITLES.hand}
            art={artOf(ASH)}
            items={ashAsked?.children ?? ashRows.map(({ entry }) => entry)}
            asking={ashAsked?.label}
            onBack={ashAsked ? () => setAshMenu((current) => (current ? { rect: current.rect } : current)) : undefined}
            onClose={() => setAshMenu(null)}
          />
        ) : null}
      </Presence>
      <CardMenu anchor={isDesktop ? (ashMenu?.rect ?? null) : null} kicker={PILE_TITLES.hand} title={nameOf(ASH)} items={inMenuBlocks(ashRows)} startExpanded={ashMenu?.ask} onClose={() => setAshMenu(null)} />

      <Specimen title="Una sola jugada" note={<>En escritorio, una carta con una sola jugada directa y nada más en el menú (con el detalle fijo a la izquierda, sin «Ver carta») no abre el menú de un renglón: la jugada sale como una etiqueta pegada a la carta (<Tag>PlayTag</Tag>), violeta, con su ícono, 44 px y el borde celeste de lo que podés hacer. Otro toque la hace; Escape o tocar afuera la suelta. Con varias jugadas, el menú de arriba. En el celular, la hoja de siempre.</>}>
        <Button size="sm" onClick={(event) => setLoneAt(event.currentTarget.getBoundingClientRect())}>
          Tocar Ash Blossom
        </Button>
      </Specimen>
      <PlayTag
        anchor={loneAt}
        item={{ label: t('practice.menu.activateEffect'), onSelect: () => { setLoneAt(null); showToastMessage(`Jugada de muestra: ${t('practice.menu.activateEffect')}`, 'info') } }}
        name={nameOf(ASH)}
        onClose={() => setLoneAt(null)}
      />

      <Specimen title="Fases en una línea" note={<>El botón de la fase de ahora (el «M1» del campo) abre las seis fases en una línea (<Tag>PhaseRow</Tag>), arriba de él y sin velo, en todos los tamaños: la sigla en un círculo de 44 px y el nombre debajo. La de ahora, violeta con aro ámbar; las que todavía no, apagadas pero enfocables («Todavía no» para el lector). Las opciones son las del menú de fases (qué se puede elegir lo deciden la mesa o el núcleo). ← → recorren, Enter elige; «Cancelar», Escape o tocar afuera la cierran. Bajo 1101 px «Cancelar» sube a la fila del título para que entre en 390 px. Acá, la Main Phase 1 del duelo automático.</>}>
        <Button size="sm" onClick={(event) => setPhasesAt(event.currentTarget.getBoundingClientRect())}>
          Tocar M1
        </Button>
      </Specimen>
      <PhaseRow
        anchor={phasesAt}
        items={['Draw Phase', 'Standby Phase', 'Main Phase 1', 'Battle Phase', 'Main Phase 2', 'End Phase'].map((label, index) => ({
          label,
          current: index === 2 || undefined,
          disabled: index < 2 || undefined,
          hint: index < 2 ? t('auto.phase.notYet') : undefined,
          onSelect: () => { setPhasesAt(null); showToastMessage(`Fase de muestra: ${label}`, 'info') },
        }))}
        onClose={() => setPhasesAt(null)}
      />

      <Specimen title="Visor de una pila" note={<>El Main, el Extra, el cementerio y el destierro se miran acá (<Tag>probability/MatDialogs.tsx</Tag>, <Tag>PileViewer</Tag>). No tapa el detalle de la carta ni las columnas de los costados: sin velo, en escritorio es la ventana de la muestra siguiente, en todas las mesas, y el campo sigue vivo; la carta que se toca o se apunta se lee en el detalle. En el celular es la hoja de abajo (hasta 55 dvh) y se cierra al tocar afuera. Tocar una carta abre su menú; abajo, «Elegir varias» (sólo con dos cartas o más). Una carta lleva la mira del Target.</>}>
        <Button size="sm" onClick={() => setPileSample('plain')}>
          Abrir el cementerio
        </Button>
      </Specimen>

      <Specimen title="Visor como ventana" note={<>En toda mesa de escritorio (la práctica, el duelo, «Jugar solo» automático y el duelo automático) el visor es una ventana ancha que flota sobre el centro de la mesa, apoyada en la fila de las Zonas Extra y de hasta 56 rem, centrada en el campo y sin meterse en los laterales ni en las columnas de los costados (<Tag>PileStripContext</Tag>). Crece hacia arriba hasta la barra (la pisa si no entran dos renglones) y no llega a tu mano; en la práctica, sin el campo del rival arriba, baja sobre tus zonas lo que le falte. Cartas de 5,25 rem en renglones que se deslizan de arriba abajo (hasta tres; con menos alto, menos, nunca menos de uno), el buscador en la fila del título y la X o Escape para cerrarla. Con pocas cartas mide lo justo. Se esconde mientras se elige algo en el campo. Acá, el deck del duelo automático (por nombre, porque su orden no se sabe) en el alto que le deja la mesa a 1440 × 900. En el celular, la hoja de siempre.</>}>
        <Button size="sm" onClick={() => setPileSample('strip')}>
          Abrir el deck
        </Button>
      </Specimen>

      <Specimen
        title="Hoja de la mesa"
        note={
          <>
            Todo cartel del duelo sale en el mismo lugar (<Tag>anchor="mat"</Tag>, <Tag>matSpot</Tag>). La pregunta del medio (<Tag>MatPrompt</Tag>) apoya su borde de abajo sobre la fila de las Zonas Extra y crece hacia el campo del rival: tu campo y la fila Extra se ven siempre; si no entra, su cuerpo se desplaza y la pila de la cadena se acorta. Las hojas (elegir cartas, opciones, ordenar, contadores, pasar a manual, «Más», las partidas y las confirmaciones) van al centro de esa fila en todos los anchos (en el celular ya no salen de abajo), del alto que entra sin tapar la barra y hasta el 70 % de la mesa. Con el teclado del celular abierto van al centro de lo que queda a la vista. Las que piden ver el campo (<Tag>lowerable</Tag>) se minimizan con la flecha a la misma asa de la pregunta (<Tag>PromptHandle</Tag>): los toques pasan a la mesa y la pregunta sigue pendiente. Acá no hay mesa: va al centro de la pantalla y el asa, abajo.
          </>
        }
      >
        <Button size="sm" onClick={() => setMatSheet(true)}>
          Abrir la hoja de la mesa
        </Button>
        <Modal isOpen={matSheet} onClose={() => setMatSheet(false)} size="keypad" anchor="mat" lowerable veil={false} kicker={t('practice.mat.name')} title="Elegí la posición" footer={<Button onClick={() => setMatSheet(false)}>Elegir</Button>}>
          <p className="m-0 text-body text-muted">Minimizala con la flecha de arriba: queda el asa y la pregunta sigue pendiente.</p>
        </Modal>
      </Specimen>

      <Specimen
        title="Hoja que se baja"
        note={
          <>
            En el celular, el visor de una pila lleva un asa arriba (<Tag>ui/SheetHandle.tsx</Tag>, <Tag>app/use-sheet-drag.ts</Tag>). Toda la franja de arriba es el asa: arrastrala para abajo (o tocala) y la hoja queda como una tira con su título, sin cerrarse, para ver la mano; arrastrala para arriba (o tocá la tira) y vuelve como estaba. Bajada, los toques pasan a la mesa y lo de adentro queda inerte.
          </>
        }
      >
        <LowerSample />
      </Specimen>

      <Specimen title="Elegir varias: dos elegidas" note={<>Cada elegida lleva un aro ámbar y su número de orden (el orden se usa: arriba del deck, a la mano). La mira del Target y el aro conviven. Mayús+clic elige el tramo; Escape sale del modo y, otra vez, cierra el visor.</>}>
        <Button size="sm" onClick={() => setPileSample('two')}>
          Abrir con dos elegidas
        </Button>
      </Specimen>

      <Specimen title="Elegir varias: ninguna elegida" note={<>Sin nada elegido, «Elegir jugada» va apagada y el pie dice por qué. «Cancelar» sale del modo sin cerrar el visor.</>}>
        <Button size="sm" onClick={() => setPileSample('none')}>
          Abrir sin elegir
        </Button>
      </Specimen>

      <Specimen title="Elegir varias con buscador" note={<>Con más de ocho cartas, «Elegir todas» va a la derecha del buscador y elige sólo las que se ven: escribí «ash» y tocala (pasa a «Quitar elección»).</>}>
        <Button size="sm" onClick={() => setPileSample('search')}>
          Abrir el Main
        </Button>
      </Specimen>

      <Specimen title="Menú de varias cartas" note={<>«Elegir jugada» le pasa las elegidas a la mesa y ella abre el menú del lote: pegado al botón en escritorio, la hoja de abajo en el celular. Lo que no admiten todas va apagado y dice por qué (hasta tres nombres; desde cuatro, cuántas). Las jugadas son de muestra.</>}>
        <Button size="sm" onClick={() => setPileSample('batch')}>
          Abrir con tres elegidas
        </Button>
      </Specimen>
      {/* Siempre montado, como en la mesa: al cerrarse sale, y cada muestra que se abre arranca con lo suyo (`start`). No es un modal: en escritorio llena la caja donde va (en la mesa, la que mide la ventana); acá, una abajo al medio,
          de hasta 56 rem y del alto que le deja la mesa a 1440 × 900. En el celular, la hoja de abajo. */}
      <div className={cx('pointer-events-none fixed bottom-4 z-180 grid grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)]', 'inset-x-[max(1rem,calc(50%-28rem))] h-[min(28rem,calc(100dvh-2rem))]')}>
        <PileStripContext.Provider value>
          <PileViewer
            pile={pileShown?.pile ?? null}
            ids={pileShown?.strip ? [...pileShown.ids].sort((a, b) => nameOf(a).localeCompare(nameOf(b))) : (pileShown?.ids ?? [])}
            kicker={pileShown?.strip ? t('practice.dialog.byName') : undefined}
            info={(id) => ({ name: nameOf(id), art: artOf(id) })}
            targeted={new Set(pileShown?.targeted)}
            onPick={(id, rect) => pileShown && setPileMenu({ kicker: PILE_TITLES[pileShown.pile], title: nameOf(id), rect, items: cardItems(), card: id })}
            many={
              pileShown?.strip
                ? undefined
                : {
                    label: () => t('practice.many.choosePlay'),
                    onPick: (ids, rect) => pileShown && setPileMenu({ kicker: PILE_TITLES[pileShown.pile], title: t('practice.mat.cardCount', { count: ids.length }), rect, items: batchItems(ids) }),
                    start: pileShown?.start,
                  }
            }
            onClose={() => setPileSample(null)}
          />
        </PileStripContext.Provider>
      </div>
      <Presence>{pileMenu && !isDesktop ? <CardSheet name={pileMenu.title} kicker={pileMenu.kicker} plain={pileMenu.card === undefined} art={pileMenu.card ? artOf(pileMenu.card) : null} items={pileMenu.items} onClose={() => setPileMenu(null)} /> : null}</Presence>
      <CardMenu anchor={isDesktop ? (pileMenu?.rect ?? null) : null} kicker={pileMenu?.kicker ?? ''} title={pileMenu?.title ?? ''} items={pileMenu?.items ?? []} onClose={() => setPileMenu(null)} />

      <Specimen title="Ficha «Cómo se calcula»" note={<>Lo que abre la ⓘ de la tarjeta del resultado del Lab: una mano buena, las cuentas por turno y lo que el número no dice. Archivo: <Tag>probability/LabScoreSheet.tsx</Tag></>}>
        <Button size="sm" onClick={() => setSheetOpen(true)}>
          Abrir la ficha
        </Button>
        <LabScoreSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} results={SAMPLE_RESULTS} handSize={5} onOpenDisclaimer={() => setSheetOpen(false)} />
      </Specimen>

      <Specimen title="Carta en grande" note={<>La carta a pantalla completa del builder: se gira y se inclina en 3D, tiene zoom (100 a 300 %), «Leer texto de efecto» con el texto resaltado y, arriba a la izquierda, la impresión con la lista de las demás. Archivos: <Tag>card-detail/CardZoom.tsx</Tag> <Tag>CardZoomBar.tsx</Tag> <Tag>PrintingMenu.tsx</Tag></>}>
        <Button size="sm" onClick={() => setZoomOpen(true)}>
          Abrir la carta en grande
        </Button>
        <Presence>{zoomOpen ? <CardZoom card={ZOOM_CARD} name="Ancient Warriors - Valiant Zhang De" arts={ZOOM_ARTS} artId={zoomArt} onArtChange={setZoomArt} onClose={() => setZoomOpen(false)} /> : null}</Presence>
      </Specimen>

      <Specimen title="Foil de rareza" note={<>El brillo que simula el papel de la carta impresa, según la rareza de la impresión que se ve: pasá el mouse (o el dedo) por encima y la luz la sigue; sin tocar, se mueve sola. Va adentro del frente de <Tag>CardFlip</Tag>. Dieciocho efectos, cada uno distinto a simple vista (el nombre y el borde de lámina, la hoja holográfica, rayas, vidrio roto, estrellas, jeroglíficos…); una impresión de arte extendido lleva el brillo en toda la carta, sin ventana. Archivos: <Tag>app/card-foil.ts</Tag> <Tag>card-detail/RarityFoil.tsx</Tag> <Tag>foil.css</Tag> <Tag>public/foil/</Tag></>}>
        <div className="grid w-full grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-5">
          {FOIL_SAMPLES.map(({ rarity, kind, frame, product }) => (
            <figure key={rarity} className="m-0 grid gap-2 text-center">
              <div className={cx('mx-auto w-full max-w-[13rem]', TILT_PERSPECTIVE)}>
                <div className={cx('relative aspect-[421/614] overflow-hidden', TILT_ART)} {...tiltHandlers}>
                  <img src={printImageUrl(product ?? ZOOM_PRODUCT, 'in_1000x1000')} alt="" draggable={false} className="block size-full object-cover" />
                  <RarityFoil kind={kind} frame={frame} />
                  <CardGlare />
                </div>
              </div>
              <figcaption className="text-micro text-muted">{rarity}</figcaption>
            </figure>
          ))}
        </div>
      </Specimen>

      <Specimen title="Avisos (toast)" note={<>Aparecen abajo y se descartan deslizándolos. Archivos: <Tag>ui/AppToast.tsx</Tag> <Tag>app/use-toast-message.ts</Tag></>}>
        {TOASTS.map((tone) => (
          <Button key={tone} size="sm" onClick={() => showToastMessage(`Un aviso de tipo ${tone}`, tone)}>
            {tone}
          </Button>
        ))}
        {/* Con una acción (`action`): el botón al final del aviso, que dura el doble (8 s). Tocarlo hace la acción y lo cierra. */}
        <Button
          size="sm"
          onClick={() =>
            showToastMessage('Cargaste "fire-king-starters" en el builder. Tu deck de antes quedó guardado.', 'success', {
              action: { label: 'Deshacer', onAction: () => showToastMessage('Tu deck volvió a como estaba.', 'info') },
            })
          }
        >
          con «Deshacer»
        </Button>
      </Specimen>
    </SpecimenGrid>
  )
}
