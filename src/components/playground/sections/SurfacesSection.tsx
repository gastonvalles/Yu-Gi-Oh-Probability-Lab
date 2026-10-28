import { useState } from 'react'

import { Button } from '../../ui/Button'
import { Callout } from '../../ui/Callout'
import { Card } from '../../ui/Card'
import { cx } from '../../ui/cx'
import { EmptyState } from '../../ui/EmptyState'
import { FieldBox, fieldInline } from '../../ui/FieldBox'
import { MultiSelect } from '../../ui/MultiSelect'
import { SearchField } from '../../ui/SearchField'
import { Skeleton } from '../../ui/Skeleton'
import { field, surface } from '../../ui/surfaces'
import { TONE, type Tone } from '../../ui/tone'
import { Specimen, SpecimenGrid, Tag } from '../Specimen'

const TONES = Object.keys(TONE) as Tone[]

/** Tarjetas, avisos, estados vacíos, esqueletos y campos: las superficies de la app. */
export function SurfacesSection() {
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')

  return (
    <div className="grid gap-4">
      <SpecimenGrid min="22rem">
        <Specimen title="Card" layout="column" note={<>Toda tarjeta sale de acá; adentro no van más cajas. Archivo: <Tag>ui/Card.tsx</Tag></>}>
          <Card className="grid gap-1">
            <strong className="text-body font-semibold text-foreground">level="card"</strong>
            <span className="text-body text-muted">La tarjeta común sobre el lienzo.</span>
          </Card>
          <Card level="hero" className="grid gap-2">
            <strong className="text-body font-semibold">level="hero"</strong>
            <span className="text-body text-primary-foreground/85">La destacada violeta: una por pantalla, con su botón lavanda.</span>
            <div>
              <Button variant="onBrand" size="sm">
                Acción
              </Button>
            </div>
          </Card>
          <div className="grid grid-cols-2 gap-3">
            {TONES.filter((tone) => tone !== 'neutral').map((tone) => (
              <Card key={tone} tone={tone} padding="sm">
                <strong className="text-body font-semibold text-foreground">tone="{tone}"</strong>
              </Card>
            ))}
          </div>
        </Specimen>

        <Specimen title="Callout" layout="column" note={<>Aviso o consejo: fondo teñido, sin borde. Archivo: <Tag>ui/Callout.tsx</Tag></>}>
          {TONES.map((tone) => (
            <Callout key={tone} tone={tone} title={`Tono ${tone}`}>
              Un texto que explica qué pasa y qué hacer.
            </Callout>
          ))}
          <Callout tone="warning" title="Con acción" action={<Button size="sm">Resolver</Button>}>
            El botón va a la derecha.
          </Callout>
        </Specimen>
      </SpecimenGrid>

      <SpecimenGrid min="22rem">
        <Specimen title="EmptyState" note={<>Lista o pantalla vacía. Archivo: <Tag>ui/EmptyState.tsx</Tag></>}>
          <EmptyState icon="layers" title="Todavía no hay nada">
            Qué falta y qué hacer, sin caja ni marcos.
          </EmptyState>
          {/* Con sus puertas (`actions`): uno o dos botones, la principal al final (la primera vez de Comparar). */}
          <EmptyState
            icon="columns"
            title="Todavía no tenés con qué comparar"
            actions={
              <>
                <Button variant="secondary" icon="upload">Importar un deck</Button>
                <Button variant="primary" icon="flask">Probar un cambio en el Lab</Button>
              </>
            }
          >
            Con `actions`, las salidas del vacío van debajo del texto.
          </EmptyState>
        </Specimen>

        <Specimen title="Skeleton" layout="column" note={<>El esqueleto mientras algo carga. Archivo: <Tag>ui/Skeleton.tsx</Tag>. Con <Tag>still</Tag> queda sin el brillo que corre: para cuando hay decenas a la vez (las imágenes de las cartas, <Tag>CardArt</Tag>).</>}>
          <Skeleton className="h-10 w-full" />
          <div className="flex gap-3">
            <Skeleton radius="chip" className="size-10" />
            <Skeleton radius="panel" className="h-10 flex-1" />
            <Skeleton still radius="panel" className="h-10 flex-1" />
          </div>
        </Specimen>

        <Specimen title="Campos" layout="column" note={<>Clases de <Tag>ui/surfaces.ts</Tag> (<Tag>field</Tag>), <Tag>ui/FieldBox.tsx</Tag> (campo en tarjeta de una línea: sin etiqueta, el valor o el placeholder dicen qué es) y <Tag>ui/SearchField.tsx</Tag> (todo campo de búsqueda lleva la lupa) y <Tag>ui/MultiSelect.tsx</Tag> (selector desplegable de elección múltiple: el campo dice qué hay elegido y se abre con una lista de casillas).</>}>
          <input aria-label="Texto" placeholder="Campo de texto" className={cx(field, 'h-11 w-full px-3 text-body')} />
          <select aria-label="Opciones" className={cx(field, 'h-11 w-full px-3 text-body')}>
            <option>Un select</option>
            <option>Otra opción</option>
          </select>
          <textarea aria-label="Texto largo" placeholder="Texto largo" rows={2} className={cx(field, 'w-full px-3 py-2 text-body')} />
          <FieldBox>
            <input aria-label="Nombre del deck" placeholder="Nombre del deck" className={fieldInline} />
          </FieldBox>
          <SearchField label="Buscar" value="" onChange={() => {}} placeholder="Campo de búsqueda: siempre con lupa" />
          <MultiSelect
            label="Selector múltiple"
            options={[
              { value: 'fusion', label: 'Fusión' },
              { value: 'synchro', label: 'Sincro' },
              { value: 'xyz', label: 'Xyz' },
              { value: 'link', label: 'Enlace' },
            ]}
            selected={picked}
            onChange={setPicked}
          />
        </Specimen>

        <Specimen title="SearchField · píldora" layout="column" note={<>Con <Tag>shape="pill"</Tag>: 48 px de alto, la lupa a la izquierda y la X de borrar (44 px con el dedo) mientras haya texto. Placeholder corto: lo que no entra se corta con «…». Con el dedo nunca se enfoca solo al abrir algo. Estados: vacío, con texto, foco (tocalo) y deshabilitado. Archivo: <Tag>ui/SearchField.tsx</Tag></>}>
          <SearchField shape="pill" label="Buscar decks" value={query} onChange={setQuery} placeholder="Deck, torneo o jugador" />
          <SearchField shape="pill" label="Buscar decks (con texto)" value="Fire King" onChange={() => {}} />
          <SearchField shape="pill" label="Buscar decks (deshabilitado)" value="" onChange={() => {}} placeholder="Sin decks para buscar" disabled />
        </Specimen>
      </SpecimenGrid>

      <Specimen title="Elevación" note={<>Las sombras del tema (<Tag>--shadow-*</Tag> en <Tag>index.css</Tag>; Tailwind no las deja leer como variables, por eso esta lista es a mano: si se suma una, se suma acá).</>}>
        {['shadow-card', 'shadow-overlay', 'shadow-focus'].map((name) => (
          <div key={name} className={cx(name, 'grid h-20 w-40 place-items-center rounded-card bg-card-background p-2 text-center text-micro text-foreground')}>
            {name}
          </div>
        ))}
      </Specimen>

      <Specimen title="Superficies" note={<>Las clases de <Tag>surface</Tag> en <Tag>ui/surfaces.ts</Tag>: panel (diálogos y cajones) y tarjetas teñidas.</>}>
        {(Object.keys(surface) as Array<keyof typeof surface>)
          .filter((name) => surface[name])
          .map((name) => (
            <div key={name} className={cx(surface[name], 'grid h-20 w-40 place-items-center p-2 text-center text-micro text-foreground')}>
              surface.{name}
            </div>
          ))}
      </Specimen>
    </div>
  )
}
