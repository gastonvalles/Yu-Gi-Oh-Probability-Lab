import { useState, type ComponentProps } from 'react'

import type { LabResults, LabViewResult } from '../../../app/probability-lab'
import { printImageUrl } from '../../../app/card-prices'
import type { ArtChoice } from '../../../app/use-card-art-options'
import { showToastMessage, type ToastTone } from '../../../app/use-toast-message'
import { formatDay, t } from '../../../i18n'
import type { ApiCardReference } from '../../../types'
import { foilKindOf, type FoilFrame, type FoilKind } from '../../../app/card-foil'
import { CardGlare, TILT_ART, TILT_PERSPECTIVE, tiltHandlers } from '../../card-detail/card-tilt'
import { CardZoom } from '../../card-detail/CardZoom'
import { RarityFoil } from '../../card-detail/RarityFoil'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { LanguageSwitcher } from '../../ui/LanguageSwitcher'
import { Modal } from '../../ui/Modal'
import { ConfirmDialog } from '../../probability/ConfirmDialog'
import { LabScoreSheet } from '../../probability/LabScoreSheet'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

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
  { title: t('lab.panel.delete.title'), description: t('lab.panel.delete.description'), confirmLabel: t('lab.panel.delete.confirm'), confirmColor: 'danger' },
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

/** Diálogos y avisos: se abren desde acá, tal cual se ven en la app. */
export function DialogsSection() {
  const [size, setSize] = useState<(typeof SIZES)[number] | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomArt, setZoomArt] = useState('print-1')
  const [confirm, setConfirm] = useState<ConfirmSample | null>(null)
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

      <Specimen
        title="Confirmación"
        layout="column"
        note={
          <>
            Toda confirmación es un <Tag>probability/ConfirmDialog.tsx</Tag> (un <Tag>Modal size="keypad"</Tag>: en el celular sale de abajo). El título pregunta con el verbo; el cuerpo dice qué pasa y si se puede deshacer; «Cancelar» va sin caja (o dice lo que sigue, como «Seguir editando», si sería ambiguo) y la principal, al final, repite el verbo del título. Rojo sólo si no hay vuelta. Las de la app salen en el idioma elegido.
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
        {zoomOpen ? <CardZoom card={ZOOM_CARD} name="Ancient Warriors - Valiant Zhang De" arts={ZOOM_ARTS} artId={zoomArt} onArtChange={setZoomArt} onClose={() => setZoomOpen(false)} /> : null}
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
      </Specimen>
    </SpecimenGrid>
  )
}
