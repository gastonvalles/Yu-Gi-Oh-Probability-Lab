import { useState } from 'react'

import { addCards, moveCard, moveTierTo, newList, removeCard, type MakerList } from '../../../app/tierlist-maker'
import type { ArtChoice } from '../../../app/use-card-art-options'
import { CardArt } from '../../CardArt'
import { CardArtPicker } from '../../card-detail/CardArtPicker'
import { CardEffectText } from '../../card-detail/CardEffectText'
import { CardEffectTraits } from '../../card-detail/CardEffectTraits'
import { TierMakerBoard } from '../../meta/TierMakerBoard'
import { TILE_WIDTH, TierStrip } from '../../meta/TierStrip'
import { createRoleGroupKey, getDeckGroupTheme } from '../../../app/deck-groups'
import { InfoTip } from '../../ui/InfoTip'
import { ProgressRing } from '../../ui/ProgressRing'
import { formatPer100 } from '../../ui/ring-shared'
import { SegmentedRing } from '../../ui/SegmentedRing'
import { BUILD_TONE, RING_ARC, TONE, judgeTone, progressTone, type Tone } from '../../ui/tone'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const TONES = Object.keys(TONE) as Tone[]

/** El reparto del Lab: buenas, con problema y sin salida. */
const REPARTO = [
  { key: 'clean', value: 0.813, color: RING_ARC.success },
  { key: 'withProblem', value: 0.002, color: RING_ARC.warning },
  { key: 'noOpening', value: 0.185, color: RING_ARC.danger },
]

/** El centro del protagonista: el número y su unidad, pegados. */
function ProtagonistNumber({ value }: { value: number }) {
  return (
    <span className="grid justify-items-center leading-none">
      <span>{formatPer100(value)}</span>
      <span className="mt-1 text-body font-normal tracking-normal text-muted">de cada 100</span>
    </span>
  )
}

/** El centro de un progreso: «9 de 17». */
function ProgressCount({ done, total }: { done: number; total: number }) {
  return (
    <span className="grid justify-items-center leading-tight">
      <span className="text-lead font-bold">{done}</span>
      <span className="text-micro font-normal text-muted">de {total}</span>
    </span>
  )
}

// Cartas reales con rasgos confirmados distintos (por su número de YGOPRODeck).
const TRAIT_SAMPLES = [
  { name: 'Ash Blossom & Joyous Spring', id: 14558127 },
  { name: 'Effect Veiler', id: 38814750 },
  { name: 'Called by the Grave', id: 24224830 },
  { name: 'Fiendsmith Engraver', id: 60764609 },
  { name: 'Dotscaper', id: 18789533 },
]

// Una carta con muchas impresiones: la galería no le pide nada a TCGplayer, las miniaturas son imágenes de cartas de YGOPRODeck.
const ART_CARDS = [63288573, 14558127, 38814750, 24224830, 60764609, 18789533]
const MANY_ARTS: readonly ArtChoice[] = Array.from({ length: 14 }, (_, index) => {
  const card = ART_CARDS[index % ART_CARDS.length]!

  return { id: String(index), label: `Impresión ${index + 1}`, imageUrl: `https://images.ygoprodeck.com/images/cards/${card}.jpg`, imageUrlSmall: `https://images.ygoprodeck.com/images/cards_small/${card}.jpg` }
})

/** La galería en columna al costado de una carta, como en el builder y en el detalle: la caja de la galería mide lo que la fila (la carta) y la galería va adentro. */
function ArtGallerySample() {
  const [picked, setPicked] = useState<string | null>(null)
  const art = MANY_ARTS.find((option) => option.id === picked) ?? MANY_ARTS[0]!

  return (
    <div className="flex gap-1">
      <div className="relative w-10 self-stretch">
        <CardArtPicker arts={MANY_ARTS} selectedId={art.id} onSelect={setPicked} direction="column" />
      </div>
      <div className="aspect-[421/614] w-36">
        <CardArt remoteUrl={art.imageUrl} name="Carta de muestra" className="block h-full w-full object-contain" />
      </div>
    </div>
  )
}

const smallImage = (id: number) => `https://images.ygoprodeck.com/images/cards_small/${id}.jpg`

/** Tres filas (S, A y B, la B en el gris oscuro de la letra clara) con una carta en S y otra en A, y el resto en «Sin clasificar». */
function sampleTierList(): MakerList {
  const base = newList('Muestra', 'muestra')
  const tiers = base.tiers.slice(0, 3).map((tier, index) => (index === 2 ? { ...tier, color: '#3b3b3b' } : tier))
  const list = addCards({ ...base, tiers }, TRAIT_SAMPLES.map(({ name, id }) => ({ id, name, image: smallImage(id) })))

  return [0, 1].reduce((current, index) => moveCard(current, TRAIT_SAMPLES[index]!.id, { kind: 'tier', id: tiers[index]!.id }), list)
}

/** El tablero del creador de verdad: las cartas y las filas se arrastran (las filas, por su agarre o con ↑ ↓); el engranaje acá no abre nada (en la app abre el menú de la fila). */
function TierMakerSample() {
  const [list, setList] = useState(sampleTierList)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  return (
    <TierMakerBoard
      list={list}
      selectedId={selectedId}
      onSelect={setSelectedId}
      onMove={(cardId, to, before) => {
        setList((current) => moveCard(current, cardId, to, before))
        setSelectedId(null)
      }}
      onRemoveCard={(cardId) => setList((current) => removeCard(current, cardId))}
      onEditTier={() => {}}
      onMoveTier={(tierId, index) => setList((current) => moveTierTo(current, tierId, index))}
    />
  )
}

const ASH_BLOSSOM = 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card, then target 1 card on the field; negate that effect. You can only use this effect of "Ash Blossom & Joyous Spring" once per turn.'
const BULLETS =
  'Once per turn, during your Standby Phase: You can pay 500 LP; draw 1 card.\n● If this card is Special Summoned from the GY: You can send 1 monster from your hand to the GY; add 1 card from your Deck to your hand.\nThis card gains 500 ATK for each monster you control.'

/** Cómo se muestran los datos: anillos de progreso y repartidos, el texto de una carta con sus partes resaltadas y la explicación a pedido (“i”). */
export function DataSection() {
  return (
    <SpecimenGrid min="22rem">
      <Specimen
        title="ProgressRing: los tonos"
        note={<>Un valor = un anillo; nunca barras de progreso. Un anillo dice <b>una</b> cosa y el número del centro es lo que dibuja el arco: entero «de cada 100», sin «%» (<Tag>formatPer100</Tag>; el decimal va en el nombre accesible). El arco de cada tono pasa 3:1 contra la tarjeta y la pista (<Tag>RING_ARC</Tag>: <Tag>brand</Tag> en lila, <Tag>danger</Tag> en rojo claro, <Tag>neutral</Tag> en blanco) y la pista es <b>una sola</b>, índigo (<Tag>stroke-border</Tag>). Archivos: <Tag>ui/ProgressRing.tsx</Tag>, <Tag>ui/tone.ts</Tag></>}
      >
        {TONES.map((tone, index) => (
          <ProgressRing key={tone} value={0.2 + index * 0.15} tone={tone} label={`Tono ${tone}`} delay={index * 100} />
        ))}
        <ProgressRing value={0.996} label="Casi cien" />
        <ProgressRing value={0.004} label="Casi cero" />
      </Specimen>

      <Specimen title="Los cinco anillos (y «sin medir»)" layout="column" note={<>Cada tipo dice su color con una regla de <Tag>ui/tone.ts</Tag>. 1 · reparto (<Tag>SegmentedRing</Tag>). 2 · medida con juicio (<Tag>judgeTone</Tag>: verde si más es mejor, rojo claro si más es peor). 3 · identidad (<Tag>color</Tag> del rol, sin juzgar: un 0 de Bricks no es malo). 4 · progreso de una tarea (<Tag>progressTone</Tag>: ámbar a medio hacer, verde listo). 5 · builds (<Tag>BUILD_TONE</Tag>: A lila, B ámbar). «Sin medir»: <Tag>unmeasured</Tag>, pista punteada y «?».</>}>
        <div className="flex flex-wrap items-center gap-4">
          <SegmentedRing size={88} label="De cada 100 manos: 81 buenas, menos de 1 con problema, 19 sin salida" format={formatPer100} segments={REPARTO} />
          <ProgressRing value={0.81} tone={judgeTone(true)} size={64} label="Una salida: 81 de cada 100" />
          <ProgressRing value={0.12} tone={judgeTone(false)} size={64} label="Un problema: 12 de cada 100" />
          <ProgressRing value={0.81} color={getDeckGroupTheme(createRoleGroupKey('starter')).rgb} size={64} label="Starters: 81 de cada 100" />
          <ProgressRing value={0} color={getDeckGroupTheme(createRoleGroupKey('brick')).rgb} size={64} label="Bricks: 0 de cada 100" />
          <ProgressRing value={9 / 17} tone={progressTone(9, 17)} size={72} strokeWidth={7} label="Cartas confirmadas: 9 de 17">
            <ProgressCount done={9} total={17} />
          </ProgressRing>
          <ProgressRing value={1} tone={progressTone(17, 17)} size={72} strokeWidth={7} label="Cartas confirmadas: 17 de 17">
            <ProgressCount done={17} total={17} />
          </ProgressRing>
          <ProgressRing value={0.81} tone={BUILD_TONE.A} size={64} label="Build A: 81 de cada 100" />
          <ProgressRing value={0.85} tone={BUILD_TONE.B} size={64} label="Build B: 85 de cada 100" />
          <ProgressRing value={0} unmeasured size={64} label="Build B: sin medir" />
        </div>
      </Specimen>

      <Specimen title="Los tamaños" note={<>Protagonista 140 px en el celular y 184 en escritorio (trazo 14 a 16, número <Tag>text-display</Tag>, cuenta de 0 al aparecer: con <Tag>fluid</Tag> crece con su caja) · tarjeta 56 a 88 (trazo 6 a 8; desde 64 px el número cuenta) · lista y opciones 36 a 44 (trazo 4, número <Tag>text-micro</Tag>, de una). Más chico que 36 no lleva número.</>}>
        <span className="size-35 min-[768px]:size-46">
          <SegmentedRing fluid size={184} strokeWidth={16} label="Protagonista: 81 de cada 100 manos son buenas" format={(value) => <ProtagonistNumber value={value} />} segments={REPARTO} />
        </span>
        <ProgressRing value={0.84} tone="success" size={56} strokeWidth={5} label="Tarjeta: 84 de cada 100" />
        <ProgressRing value={0.87} tone="neutral" size={84} format={formatPer100} label="Tarjeta que cuenta: 87 de cada 100" />
        <ProgressRing value={0.78} tone="success" size={44} label="Lista: 78 de cada 100" />
        <ProgressRing value={0.78} tone="success" size={36} label="Opción: 78 de cada 100" />
      </Specimen>

      <Specimen title="SegmentedRing" note={<>Un reparto en tramos, en orden desde las 12 y separados 3 px: verde las buenas, ámbar las que tienen un problema, rojo claro las que no abren (los colores de <Tag>RING_ARC</Tag>). Con <Tag>format</Tag>, el centro es el primer tramo y cuenta junto con su arco. Archivo: <Tag>ui/SegmentedRing.tsx</Tag></>}>
        <SegmentedRing size={132} label="De cada 100 manos: 62 buenas, 23 con problema, 15 sin salida" format={formatPer100} segments={[
          { key: 'clean', value: 0.62, color: RING_ARC.success },
          { key: 'problem', value: 0.23, color: RING_ARC.warning },
          { key: 'none', value: 0.15, color: RING_ARC.danger },
        ]} />
      </Specimen>

      <Specimen title="CardEffectText" note={<>El efecto de una carta con sus partes marcadas: verde la condición, ámbar «(Quick Effect)», rojo el costo, violeta el objetivo y subrayado el límite; lo que no es seguro queda común. Capa 0 del motor de cartas (<Tag>docs/motor-de-cartas.md</Tag>). Archivo: <Tag>card-detail/CardEffectText.tsx</Tag></>}>
        <div className="grid gap-3 text-body text-foreground">
          <CardEffectText text={ASH_BLOSSOM} />
          <CardEffectText text={BULLETS} />
        </div>
      </Specimen>

      <Specimen title="CardEffectTraits" note={<>Lo que se sabe con certeza de los efectos de una carta, a primera vista: sólo lo que su script de EDOPro <b>y</b> su texto dicen los dos (capa 1 del motor de cartas). Los mismos colores que el texto resaltado. Sin nada confirmado no muestra nada. Archivo: <Tag>card-detail/CardEffectTraits.tsx</Tag></>}>
        <div className="grid gap-3">
          {TRAIT_SAMPLES.map(({ name, id }) => (
            <div key={id} className="grid gap-1">
              <span className="text-body font-semibold text-foreground">{name}</span>
              <CardEffectTraits ygoprodeckId={id} />
            </div>
          ))}
        </div>
      </Specimen>

      <Specimen title="CardArtPicker (en columna)" note={<>Los artes de una carta con muchas impresiones, al costado de la carta: la galería tiene <b>el alto de la carta</b> (va <Tag>absolute inset-0</Tag> dentro de una caja <Tag>relative</Tag> que mide lo que la fila) y lo que no entra se recorre por dentro —rueda, dedo o arrastrando con el mouse—, con la barra escondida. Con un solo arte no muestra nada. Archivo: <Tag>card-detail/CardArtPicker.tsx</Tag></>}>
        <ArtGallerySample />
      </Specimen>

      <Specimen
        title="TierStrip y el tablero del creador"
        className="col-span-full"
        layout="column"
        note={
          <>
            Arriba, la fila de las tier lists del meta (sólo se lee: recuadro y cartas). Abajo, el creador: las cartas se arrastran <b>como en el builder</b> (6 px con el mouse; con el dedo, mantenerla 350 ms): el fantasma de la carta sigue al puntero, la fila de abajo lleva el aro ámbar (<Tag>highlighted</Tag>) y una línea ámbar marca dónde entra; al soltarla cambia de lugar de una, sin vuelo. Cada fila lleva <b>al final</b> (<Tag>trailing</Tag>) el engranaje, que abre el menú de la fila, y el agarre <b>▲▼</b>, que la arrastra entera con el mouse, con el dedo (sólo el agarre es <Tag>touch-none</Tag>) o con ↑ ↓; las demás se corren para dejarle el hueco y, al soltarla, vuela a su lugar (lo único que vuela). Íconos blancos que se ponen ámbar al apuntarlos; la fila levantada lleva el aro ámbar. Archivos: <Tag>meta/TierStrip.tsx</Tag>, <Tag>meta/TierMakerBoard.tsx</Tag>, <Tag>app/use-tier-card-drag.ts</Tag>, <Tag>app/use-tier-row-drag.ts</Tag>, <Tag>app/use-tier-flights.ts</Tag>
          </>
        }
      >
        <TierStrip label="S" color="#ff7f7f" ariaLabel="Fila de sólo lectura">
          <li className={TILE_WIDTH}>
            <CardArt tilt remoteUrl={smallImage(14558127)} name="Ash Blossom & Joyous Spring" className="block aspect-[421/614] w-full object-cover" />
          </li>
        </TierStrip>
        <TierMakerSample />
      </Specimen>

      <Specimen title="InfoTip" note={<>La explicación larga, sólo a pedido. Archivo: <Tag>ui/InfoTip.tsx</Tag></>}>
        <span className="flex items-center gap-1 text-body text-foreground">
          Pasá el mouse o tocá
          <InfoTip label="Qué es esto">Un texto que explica algo que no se ve en otro lado.</InfoTip>
        </span>
      </Specimen>
    </SpecimenGrid>
  )
}
