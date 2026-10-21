import { useState } from 'react'

import { CARD_BACK, FX_RGB, type FxTone } from '../../probability/practice-styles'
import { Badge } from '../../ui/Badge'
import { Button, type ButtonVariant } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { CopiesBadge } from '../../ui/CopiesBadge'
import { cx } from '../../ui/cx'
import { DraggableFab } from '../../ui/DraggableFab'
import { FilterChips } from '../../ui/FilterChips'
import { Icon } from '../../ui/Icon'
import { CloseButton, IconButton } from '../../ui/IconButton'
import { OverflowMenu } from '../../ui/OverflowMenu'
import { ScrollRow } from '../../ui/ScrollRow'
import { Segmented } from '../../ui/Segmented'
import { choiceChip, filterChip } from '../../ui/surfaces'
import { Stepper } from '../../ui/Stepper'
import { Switch } from '../../ui/Switch'
import { TONE, type Tone } from '../../ui/tone'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'tertiary', 'outline']
const SIZES = ['sm', 'md', 'lg'] as const
const ICON_TONES = ['raised', 'close', 'ghost', 'flat', 'tile'] as const
const TONES = Object.keys(TONE) as Tone[]
/** Los chips de muestra de `FilterChips`: los puestos de los decks de torneo (uno sin decks, apagado) y las rarezas de una expansión. */
const PLACEMENTS = [
  { name: 'Winner', count: 103 },
  { name: 'Runner-Up', count: 87 },
  { name: 'Top 4', count: 160 },
  { name: 'Top 8', count: 0 },
]
const RARITIES = [
  { name: 'Super Rare', count: 79 },
  { name: 'Ultra Rare', count: 147 },
  { name: 'Secret Rare', count: 79 },
  { name: 'Starlight Rare', count: 0 },
]

/** Los botones de la app y los controles que se tocan: todos salen de `src/components/ui/` (Button, IconButton, Segmented, FilterChips, Switch, Stepper, Badge, surfaces.ts). */
export function ButtonsSection() {
  const [track, setTrack] = useState('b')
  const [chips, setChips] = useState('b')
  const [cards, setCards] = useState('b')
  const [on, setOn] = useState(true)
  const [copies, setCopies] = useState(3)
  const [chosen, setChosen] = useState(['a'])
  const [placements, setPlacements] = useState<string[]>([])
  const [rarity, setRarity] = useState<string | null>('Ultra Rare')
  const [fab, setFab] = useState(false)
  const options = [
    { value: 'a', label: 'Primero' },
    { value: 'b', label: 'Segundo' },
    { value: 'c', label: 'Promedio' },
  ]

  return (
    <div className="grid gap-4">
      <Specimen title="Button" layout="column" note={<>Una sola <Tag>primary</Tag> por vista. En táctil los tamaños chicos crecen solos. Archivo: <Tag>ui/Button.tsx</Tag></>}>
        <div className="grid gap-3">
          {VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-3">
              <Tag>{variant}</Tag>
              {SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  Guardar {size}
                </Button>
              ))}
              <Button variant={variant} icon="save">
                Con ícono
              </Button>
              <Button variant={variant} iconEnd="arrow-right">
                Siguiente
              </Button>
              <Button variant={variant} disabled>
                Deshabilitado
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <Tag>danger</Tag>
            <Button variant="primary" color="danger" icon="trash">
              Borrar
            </Button>
            <Button variant="secondary" color="danger">
              Quitar
            </Button>
            <Button variant="tertiary" color="danger">
              Descartar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Tag>success</Tag>
            <Button variant="primary" color="success" icon="check">
              Estoy listo
            </Button>
            <Button variant="secondary" color="success">
              Listo
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Tag>confirm</Tag>
            <Button variant="primary" color="confirm" icon="check">
              Listo (pasá el mouse)
            </Button>
          </div>
          <Button fullWidth icon="download">
            Ocupa todo el ancho
          </Button>
          <Card level="hero" padding="md" className="flex flex-wrap items-center gap-3">
            <Tag>onBrand</Tag>
            <Button variant="onBrand">Sobre una tarjeta violeta</Button>
            <Button variant="onBrand" icon="play" size="sm">
              Ver
            </Button>
          </Card>
          {/* Por qué existe `outline`: sobre una tarjeta la lavanda de `secondary` casi no se ve (1,08:1); el borde fino sí, y se enciende en ámbar al apuntarlo. */}
          <Card padding="md" className="flex flex-wrap items-center gap-3">
            <Tag>sobre una tarjeta</Tag>
            <Button variant="secondary" icon="layers">
              secondary
            </Button>
            <Button variant="outline" icon="layers">
              Ver deck (outline)
            </Button>
          </Card>
        </div>
      </Specimen>

      <SpecimenGrid>
        <Specimen title="IconButton" note={<>Un botón sin texto va <b>sin fondo y siempre blanco</b>: el aviso es que se pone <b>ámbar</b> al pasar el mouse y mientras está seleccionado (el único con relleno es <Tag>primary</Tag>, la acción principal de una barra). Siempre con <Tag>aria-label</Tag>. Archivo: <Tag>ui/IconButton.tsx</Tag></>} layout="column">
          {ICON_TONES.map((tone) => (
            <div key={tone} className="flex items-center gap-3">
              <span className="w-14"><Tag>{tone}</Tag></span>
              {SIZES.map((size) => (
                <IconButton key={size} tone={tone} size={size} aria-label={`${tone} ${size}`}>
                  <Icon name="plus" />
                </IconButton>
              ))}
            </div>
          ))}
          <div className="flex items-center gap-3">
            <span className="w-14"><Tag>close</Tag></span>
            <CloseButton aria-label="Cerrar" />
          </div>
        </Specimen>

        <Specimen title="Segmented" note={<>Elegir una opción entre pocas. Lo elegido va en <b>ámbar</b> con el texto oscuro (la tarjeta elegida, <Tag>cards</Tag>, con el borde y el texto ámbar). Archivo: <Tag>ui/Segmented.tsx</Tag></>} layout="column">
          <Segmented label="Pista" variant="track" value={track} onChange={setTrack} options={options} />
          <Segmented label="Pastillas" variant="chips" value={chips} onChange={setChips} options={options} />
          {/* Los detalles del turno del Lab (los de antes, «5 cartas · 57%», no entraban en tres tarjetas de esta columna y pisaban el borde de la elegida). */}
          <Segmented label="Tarjetas" variant="cards" value={cards} onChange={setCards} options={options.map((option, at) => ({ ...option, detail: ['5 cartas', '6 cartas', '50/50'][at] }))} />
          <Segmented label="Chico" variant="track" size="sm" value={track} onChange={setTrack} options={options} />
        </Specimen>

        <Specimen
          title="Fila de chips y menú ⋯"
          note={<>Como la fila de categorías y los tres puntos de un video de YouTube: los chips en una sola fila que scrollea de costado (`variant="scroll"` dentro de un <Tag>ScrollRow</Tag>, con flechas y degradé donde se corta) y el menú de acciones de segundo plano de una tarjeta. Archivos: <Tag>ui/ScrollRow.tsx</Tag> <Tag>ui/OverflowMenu.tsx</Tag></>}
          layout="column"
        >
          <div className="w-full max-w-md">
            <ScrollRow>
              <Segmented label="Torneo" variant="scroll" value={chips} onChange={setChips} options={[...options, { value: 'ycs', label: 'YCS Paris 2026', count: 18 }, { value: 'wcq', label: 'WCQ Brussels 2026 · Genesys', count: 12 }, { value: 'na', label: 'North American WCQ', count: 1 }]} />
            </ScrollRow>
          </div>
          <OverflowMenu label="Más opciones" items={[{ label: 'Ver deck Elfnote', icon: 'layers', onSelect: () => {} }]} />
        </Specimen>

        <Specimen title="Switch y Stepper" note={<>El interruptor encendido va en ámbar con el pulgar oscuro. Archivos: <Tag>ui/Switch.tsx</Tag> <Tag>ui/Stepper.tsx</Tag></>}>
          <Switch label="Interruptor" checked={on} onChange={setOn} />
          <Switch label="Apagado" checked={false} onChange={() => {}} />
          <Stepper label="Copias" value={copies} min={0} max={3} onChange={setCopies} />
          <Stepper label="En línea" variant="inline" value={copies} min={0} max={3} onChange={setCopies} />
        </Specimen>

        <Specimen title="Pastillas de selección" note={<>Clases de <Tag>ui/surfaces.ts</Tag>: <Tag>choiceChip</Tag> (lavanda; elegida con <Tag>aria-pressed</Tag>, ámbar) y <Tag>filterChip</Tag> (un filtro puesto: ámbar, se toca para quitarlo).</>}>
          {['a', 'b', 'c'].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={chosen.includes(value)}
              className={cx(choiceChip, 'min-h-9 px-4 text-body')}
              onClick={() => setChosen((current) => (current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]))}
            >
              Opción {value.toUpperCase()}
            </button>
          ))}
          <button type="button" className={filterChip}>
            Filtro activo
            <Icon name="x" size={12} strokeWidth={2.5} />
          </button>
        </Specimen>

        <Specimen title="Botón flotante" note={<>El de la práctica y el de la calculadora de LP: se arrastra y se pega al borde. Archivo: <Tag>ui/DraggableFab.tsx</Tag></>}>
          <Button size="sm" onClick={() => setFab((current) => !current)}>
            {fab ? 'Ocultar el botón' : 'Mostrarlo en la página'}
          </Button>
          {fab ? (
            <DraggableFab label="Botón de prueba" storageKey="ygo-lab:playground-fab" onClick={() => setFab(false)}>
              <Icon name="hand" size={24} strokeWidth={1.8} />
            </DraggableFab>
          ) : null}
        </Specimen>
      </SpecimenGrid>

      <Specimen
        title="FilterChips"
        layout="column"
        note={
          <>
            La fila de chips para filtrar: el que apaga los filtros («Todos») y uno por valor con su cuenta. Lo elegido va en <b>ámbar</b> con el texto oscuro, igual que un filtro
            puesto (<Tag>filterChip</Tag>, el primero de la fila de arriba); uno sin elementos queda apagado en su lugar. El mouse y el teclado muestran el hover y el foco.
            Archivo: <Tag>ui/FilterChips.tsx</Tag>
          </>
        }
      >
        {/* Arriba, «Todos» elegido (variante `scroll`, como los decks de torneo); abajo, una rareza elegida entre varias (variante `wrap`, como Expansiones). */}
        <div className="w-full max-w-2xl">
          <ScrollRow>
            <button type="button" className={cx(filterChip, 'shrink-0')}>
              <span className="truncate">Ash Blossom & Joyous Spring</span>
              <Icon name="x" size={12} strokeWidth={2.2} />
            </button>
            <FilterChips
              variant="scroll"
              label="Puesto"
              all="Todos"
              allActive={placements.length === 0}
              onAll={() => setPlacements([])}
              chips={PLACEMENTS.map(({ name, count }) => ({
                key: name,
                name,
                count,
                active: placements.includes(name),
                disabled: count === 0,
                onToggle: () => setPlacements((current) => (current.includes(name) ? current.filter((entry) => entry !== name) : [...current, name])),
              }))}
            />
          </ScrollRow>
        </div>
        <FilterChips
          label="Rareza"
          all="Todas"
          allActive={rarity === null}
          onAll={() => setRarity(null)}
          chips={RARITIES.map(({ name, count }) => ({ key: name, name, count, active: rarity === name, disabled: count === 0, onToggle: () => setRarity((current) => (current === name ? null : name)) }))}
        />
      </Specimen>

      <Specimen title="Badge" layout="column" note={<>Estado, conteo o tipo. El color significa algo: <Tag>brand</Tag> lo tuyo · <Tag>success</Tag> bien · <Tag>warning</Tag> ojo · <Tag>danger</Tag> mal · <Tag>info</Tag> dato. Archivo: <Tag>ui/Badge.tsx</Tag></>}>
        {(['pill', 'tag'] as const).map((shape) => (
          <div key={shape} className="flex flex-wrap items-center gap-2">
            <span className="w-10"><Tag>{shape}</Tag></span>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} shape={shape} dot>
                {tone}
              </Badge>
            ))}
            <Badge tone="brand" shape={shape} icon="tag">
              Con ícono
            </Badge>
            <Badge tone="success" size="sm" shape={shape}>
              sm
            </Badge>
          </div>
        ))}
        {/* `onImage`: sobre una foto (la portada de un deck de torneo) el tinte de un tono no se lee; va el fondo oscuro casi opaco. */}
        <div className="flex flex-wrap items-center gap-2">
          <Tag>onImage</Tag>
          <span className="relative block h-16 w-28 overflow-hidden rounded-tag">
            <span aria-hidden="true" className={CARD_BACK} />
            <span className="absolute right-1.5 top-1.5 z-2">
              <Badge onImage icon="play" size="sm">
                2
              </Badge>
            </span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10"><Tag>copias</Tag></span>
          <CopiesBadge copies={1} />
          <CopiesBadge copies={3} />
        </div>
        {/* `rgb`: un color de afuera de los tonos; el chip de cada jugada en la lista de pasos lleva el de su destello en la mesa. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10"><Tag>rgb</Tag></span>
          {(Object.keys(FX_RGB) as FxTone[]).map((fx) => (
            <Badge key={fx} size="sm" shape="tag" rgb={FX_RGB[fx]}>
              {fx}
            </Badge>
          ))}
        </div>
      </Specimen>
    </div>
  )
}
