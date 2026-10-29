import type { ButtonHTMLAttributes, ComponentProps } from 'react'

import { cx, variants } from './cx'
import { Icon } from './Icon'

type IconButtonSize = 'sm' | 'md' | 'lg'

/**
 * Los botones que son sólo un ícono no llevan fondo y son siempre blancos: el aviso de que se pueden tocar es que el ícono se pone ámbar
 * al pasar el mouse, y ámbar se queda mientras el botón está seleccionado (`aria-pressed`, `aria-selected` o `data-active`); un poco menos
 * de opacidad al apretar; el foco lleva el aro de siempre. El tono sólo cambia el tamaño y la forma:
 * raised: el de las barras de herramientas (por defecto) · close: la X de los encabezados · ghost: el de las zonas del deck (papelera, ordenar) ·
 * flat: el grande de la práctica · outline: redondo con borde, que también se enciende en ámbar (cambiar A y B en Comparar) · tile: el de la mesa (el + y la fase del campo, la fila de abajo
 * del duelo), en una caja oscura de 44 px con un borde fino que se vuelve ámbar si está prendido (`aria-pressed`, `data-active`: la fase en tu turno); apagado, el ícono o la sigla en lila (se sigue leyendo).
 * Con su nombre debajo es `TileButton`.
 * primary y play son la excepción: redondos y con relleno, la acción principal de una barra: primary, violeta (enviar un mensaje); play, ámbar (reproducir un replay: el ámbar es lo que se toca, como el botón de la fase de ahora).
 * swatch: un círculo que es su color (`style={{ backgroundColor }}`; el color del ícono lo pone quien lo usa, para que contraste): el color de una fila de tier list. El elegido (`aria-pressed`) lleva el aro ámbar.
 */
type IconButtonTone = 'raised' | 'close' | 'ghost' | 'flat' | 'outline' | 'tile' | 'primary' | 'play' | 'swatch'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize
  tone?: IconButtonTone
}

const BASE =
  'inline-flex shrink-0 items-center justify-center p-0 transition-[opacity,color,border-color,background-color,box-shadow] duration-150 focus-visible:outline-none focus-visible:shadow-focus [&_svg]:block'

/** Lo común de los que van sin fondo: ícono blanco que se pone ámbar al pasar el mouse o al estar seleccionado, más tenue al apretar o si está deshabilitado. */
const BARE =
  'bg-transparent text-white hover:text-info aria-pressed:text-info aria-selected:text-info data-[active=true]:text-info active:opacity-70 disabled:pointer-events-none disabled:opacity-40'

/** La caja de la mesa (`tile` y `TileButton`): el borde fino está siempre, así prenderlo sólo le cambia el color (nada se corre) y se ve también sobre un panel del color de la caja (la línea de fases). */
const TILE_BOX = 'rounded-card border border-border bg-card-background [&_svg]:stroke-[1.5]'

const SIZES: Record<IconButtonTone, Record<IconButtonSize, string>> = {
  raised: { sm: 'size-9 pointer-coarse:size-11 [&_svg]:size-4', md: 'size-10 pointer-coarse:size-11 [&_svg]:size-[1.125rem]', lg: 'size-11 [&_svg]:size-5' },
  // En táctil los chicos crecen a 44 px (área mínima recomendada) sin cambiar el ícono.
  close: { sm: 'size-8 pointer-coarse:size-11 [&_svg]:size-4', md: 'size-9 pointer-coarse:size-11 [&_svg]:size-[1.125rem]', lg: 'size-10 pointer-coarse:size-11 [&_svg]:size-5' },
  ghost: { sm: 'size-8 pointer-coarse:size-11 [&_svg]:size-4', md: 'size-10 pointer-coarse:size-11 [&_svg]:size-5', lg: 'size-10 pointer-coarse:size-11 [&_svg]:size-5' },
  flat: { sm: 'size-11 [&_svg]:size-6', md: 'size-12 [&_svg]:size-7', lg: 'size-12 [&_svg]:size-7' },
  outline: { sm: 'size-9 pointer-coarse:size-11 [&_svg]:size-4', md: 'size-10 pointer-coarse:size-11 [&_svg]:size-[1.125rem]', lg: 'size-12 [&_svg]:size-5' },
  tile: { sm: 'size-11 [&_svg]:size-5', md: 'size-11 [&_svg]:size-5', lg: 'size-12 [&_svg]:size-6' },
  primary: { sm: 'size-10 pointer-coarse:size-11 [&_svg]:size-[1.125rem]', md: 'size-12 [&_svg]:size-5', lg: 'size-14 [&_svg]:size-6' },
  play: { sm: 'size-10 pointer-coarse:size-11 [&_svg]:size-[1.125rem]', md: 'size-12 [&_svg]:size-5', lg: 'size-14 [&_svg]:size-6' },
  swatch: { sm: 'size-8 pointer-coarse:size-11 [&_svg]:size-4', md: 'size-10 pointer-coarse:size-11 [&_svg]:size-[1.125rem]', lg: 'size-11 [&_svg]:size-5' },
}

const toneStyle = variants({
  base: BASE,
  variants: {
    tone: {
      raised: cx('rounded-control', BARE),
      close: cx('rounded-full', BARE),
      ghost: cx('rounded-control', BARE),
      flat: cx('rounded-full [&_svg]:stroke-[1.3]', BARE),
      outline: cx('rounded-full border border-tint/30 hover:border-info/80', BARE),
      tile: cx(
        TILE_BOX,
        'text-white hover:text-info aria-expanded:text-info aria-pressed:border-info aria-pressed:text-info data-[active=true]:border-info data-[active=true]:text-info active:opacity-70 disabled:pointer-events-none disabled:text-muted',
      ),
      primary: 'rounded-full bg-primary text-primary-foreground hover:bg-primary-hover active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
      play: 'rounded-full bg-primary text-white hover:brightness-110 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none',
      swatch: 'rounded-full active:opacity-70 disabled:pointer-events-none disabled:opacity-40 aria-pressed:shadow-focus',
    },
  },
  defaults: { tone: 'raised' },
})

export function IconButton({ size = 'md', tone = 'raised', className = '', type = 'button', ...props }: IconButtonProps) {
  return <button type={type} className={cx(toneStyle({ tone }, SIZES[tone][size]), className)} {...props} />
}

/**
 * La caja de la mesa (`tile`, de 40 px) con su nombre debajo: la botonera de «Jugar solo automático» (Automático, Cadena, Pasos, Opciones) y la línea de fases. Se toca todo el botón (56 × 56) y el estado lo
 * dicen la caja y el nombre a la vez: blancos en reposo, ámbar al apuntarlo, y ámbar con el borde ámbar si está prendido (`aria-pressed`) o es el de ahora (`aria-current`); apagado pero enfocable
 * (`aria-disabled`, «Todavía no»), en lila. Sin rellenos: en la mesa el violeta lleno es sólo de la acción principal con texto (Listo, Pasar turno). `children`: el ícono o la sigla; `label`, el nombre.
 */
export function TileButton({ label, children, className, type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      className={cx(
        'group grid min-w-14 cursor-pointer justify-items-center gap-1 rounded-control border-0 bg-transparent p-0 text-white outline-none transition-colors focus-visible:shadow-focus hover:not-aria-disabled:text-info aria-pressed:text-info aria-[current=true]:text-info aria-disabled:cursor-default aria-disabled:text-muted active:opacity-70 disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
      {...props}
    >
      <span aria-hidden="true" className={cx(TILE_BOX, 'grid size-10 place-items-center transition-colors [&_svg]:size-5 group-aria-pressed:border-info group-aria-[current=true]:border-info group-aria-disabled:border-border-subtle')}>
        {children}
      </span>
      <span aria-hidden="true" className="whitespace-nowrap text-micro font-semibold leading-none">
        {label}
      </span>
    </button>
  )
}

type CloseButtonProps = Omit<IconButtonProps, 'children'>

export function CloseButton({ tone = 'close', ...props }: CloseButtonProps) {
  return (
    <IconButton {...props} tone={tone}>
      <CloseIcon />
    </IconButton>
  )
}

/** La X del set de íconos, para usarla suelta (chips, campos). */
export function CloseIcon(props: Omit<ComponentProps<typeof Icon>, 'name'>) {
  return <Icon name="x" strokeWidth={2} {...props} />
}
