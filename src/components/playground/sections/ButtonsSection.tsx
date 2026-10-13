import { useState } from 'react'

import { Badge } from '../../ui/Badge'
import { Button, type ButtonVariant } from '../../ui/Button'
import { Card } from '../../ui/Card'
import { CopiesBadge } from '../../ui/CopiesBadge'
import { cx } from '../../ui/cx'
import { DraggableFab } from '../../ui/DraggableFab'
import { Icon } from '../../ui/Icon'
import { CloseButton, IconButton } from '../../ui/IconButton'
import { Segmented } from '../../ui/Segmented'
import { choiceChip, filterChip } from '../../ui/surfaces'
import { Stepper } from '../../ui/Stepper'
import { Switch } from '../../ui/Switch'
import { TONE, type Tone } from '../../ui/tone'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'tertiary']
const SIZES = ['sm', 'md', 'lg'] as const
const ICON_TONES = ['raised', 'close', 'ghost', 'flat'] as const
const TONES = Object.keys(TONE) as Tone[]

/** Los botones de la app y los controles que se tocan: todos salen de `src/components/ui/` (Button, IconButton, Segmented, Switch, Stepper, Badge, surfaces.ts). */
export function ButtonsSection() {
  const [track, setTrack] = useState('b')
  const [chips, setChips] = useState('b')
  const [cards, setCards] = useState('b')
  const [on, setOn] = useState(true)
  const [copies, setCopies] = useState(3)
  const [chosen, setChosen] = useState(['a'])
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
        </div>
      </Specimen>

      <SpecimenGrid>
        <Specimen title="IconButton" note={<>Siempre con <Tag>aria-label</Tag>. Archivo: <Tag>ui/IconButton.tsx</Tag></>} layout="column">
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

        <Specimen title="Segmented" note={<>Elegir una opción entre pocas. Archivo: <Tag>ui/Segmented.tsx</Tag></>} layout="column">
          <Segmented label="Pista" variant="track" value={track} onChange={setTrack} options={options} />
          <Segmented label="Pastillas" variant="chips" value={chips} onChange={setChips} options={options} />
          <Segmented label="Tarjetas" variant="cards" value={cards} onChange={setCards} options={options.map((option) => ({ ...option, detail: '5 cartas · 57%' }))} />
          <Segmented label="Chico" variant="track" size="sm" value={track} onChange={setTrack} options={options} />
        </Specimen>

        <Specimen title="Switch y Stepper" note={<>Archivos: <Tag>ui/Switch.tsx</Tag> <Tag>ui/Stepper.tsx</Tag></>}>
          <Switch label="Interruptor" checked={on} onChange={setOn} />
          <Switch label="Apagado" checked={false} onChange={() => {}} />
          <Stepper label="Copias" value={copies} min={0} max={3} onChange={setCopies} />
          <Stepper label="En línea" variant="inline" value={copies} min={0} max={3} onChange={setCopies} />
        </Specimen>

        <Specimen title="Pastillas de selección" note={<>Clases de <Tag>ui/surfaces.ts</Tag>: <Tag>choiceChip</Tag> (<Tag>aria-pressed</Tag>) y <Tag>filterChip</Tag>.</>}>
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

      <Specimen title="Badge" layout="column" note={<>Estado, conteo o tipo. El color significa algo: <Tag>brand</Tag> lo tuyo · <Tag>success</Tag> bien · <Tag>warning</Tag> ojo · <Tag>danger</Tag> mal · <Tag>info</Tag> dato. Archivo: <Tag>ui/Badge.tsx</Tag></>}>
        {(['pill', 'tag'] as const).map((shape) => (
          <div key={shape} className="flex flex-wrap items-center gap-2">
            <span className="w-10"><Tag>{shape}</Tag></span>
            {TONES.map((tone) => (
              <Badge key={tone} tone={tone} shape={shape} dot>
                {tone}
              </Badge>
            ))}
            <Badge tone="brand" shape={shape} icon="sparkles">
              Con ícono
            </Badge>
            <Badge tone="success" size="sm" shape={shape}>
              sm
            </Badge>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-10"><Tag>copias</Tag></span>
          <CopiesBadge copies={1} />
          <CopiesBadge copies={3} />
        </div>
      </Specimen>
    </div>
  )
}
