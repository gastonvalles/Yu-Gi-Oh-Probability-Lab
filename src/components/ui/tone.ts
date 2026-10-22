/**
 * Tonos semánticos de la app. El color siempre significa algo:
 * brand = lo tuyo (selección, acción principal) · success = bien/listo · warning = ojo ·
 * danger = mal/peligro · info = dato destacado · neutral = sin énfasis.
 * Los roles de las cartas (starter, handtrap…) tienen su propia paleta y no usan estos tonos.
 */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info'

interface ToneStyle {
  /** Texto e íconos del tono (versión clara: legible sobre fondos teñidos y sobre el fondo de la app). */
  text: string
  /** Borde + fondo suave: chips, avisos, filas destacadas. */
  tint: string
  /** Sólo fondo teñido (sin borde): avisos y filas destacadas dentro de una tarjeta. */
  soft: string
  /** Tarjeta grande teñida: mismo fondo que una tarjeta común con un velo del color arriba. */
  wash: string
  /** Relleno sólido: puntos, barras, indicadores. */
  fill: string
  /** Publica `--tone-rgb` para componer degradés y brillos (`rgb(var(--tone-rgb)/0.3)`). */
  rgb: string
}

export const TONE: Record<Tone, ToneStyle> = {
  neutral: {
    text: 'text-muted',
    tint: 'border-border bg-tint/5',
    soft: 'bg-tint/7',
    wash: 'border-border-subtle bg-card-background bg-linear-to-b from-tint/6 to-tint/1',
    fill: 'bg-soft',
    rgb: '[--tone-rgb:var(--foreground-rgb)]',
  },
  brand: {
    text: 'text-primary-soft',
    tint: 'border-primary/40 bg-primary/14',
    soft: 'bg-primary/14',
    wash: 'border-primary/30 bg-card-background bg-linear-to-b from-primary/12 to-primary/4',
    fill: 'bg-primary',
    rgb: '[--tone-rgb:var(--primary-rgb)]',
  },
  success: {
    text: 'text-success-soft',
    tint: 'border-success/34 bg-success/12',
    soft: 'bg-success/10',
    wash: 'border-success/26 bg-card-background bg-linear-to-b from-success/10 to-success/3',
    fill: 'bg-success',
    rgb: '[--tone-rgb:var(--success-rgb)]',
  },
  warning: {
    text: 'text-warning-soft',
    tint: 'border-warning/38 bg-warning/12',
    soft: 'bg-warning/10',
    wash: 'border-warning/28 bg-card-background bg-linear-to-b from-warning/10 to-warning/3',
    fill: 'bg-warning',
    rgb: '[--tone-rgb:var(--warning-rgb)]',
  },
  danger: {
    text: 'text-danger-soft',
    tint: 'border-danger/40 bg-danger/12',
    soft: 'bg-danger/10',
    wash: 'border-danger/30 bg-card-background bg-linear-to-b from-danger/10 to-danger/3',
    fill: 'bg-danger',
    rgb: '[--tone-rgb:var(--danger-rgb)]',
  },
  info: {
    text: 'text-info-soft',
    tint: 'border-info/38 bg-info/12',
    soft: 'bg-info/10',
    wash: 'border-info/28 bg-card-background bg-linear-to-b from-info/10 to-info/3',
    fill: 'bg-info',
    rgb: '[--tone-rgb:var(--info-rgb)]',
  },
}

/**
 * El arco de un anillo según su tono ("R G B"): el que se lee, con 3:1 o más contra la tarjeta, el lienzo y la pista (`ring-language.test.tsx` lo mide sobre `index.css`).
 * Por eso `brand` dibuja en lila (el violeta de marca da 2,29:1 y queda para los rellenos y los botones), `danger` en el rojo claro (el `#DA0000` da 2,53:1 contra la pista)
 * y `neutral` en blanco: si el color no significa nada, blanco.
 */
export const RING_ARC: Record<Tone, string> = {
  neutral: 'var(--foreground-rgb)',
  brand: 'var(--primary-soft-rgb)',
  success: 'var(--success-rgb)',
  warning: 'var(--warning-rgb)',
  danger: 'var(--danger-soft-rgb)',
  info: 'var(--info-rgb)',
}

/*
 * Los cinco anillos de la app (un anillo dice una sola cosa y el número del centro es lo que dibuja el arco):
 * 1. Reparto (`SegmentedRing`): un total en tramos, verde / ámbar / rojo claro desde las 12; el centro es el tramo protagonista.
 * 2. Medida con juicio: `judgeTone` (verde si más es mejor, rojo claro si más es peor).
 * 3. Identidad: el color del rol (`color` de `ProgressRing`), sin juzgar: un 0 de Bricks no es malo.
 * 4. Progreso de una tarea: `progressTone` (ámbar a medio hacer, verde listo), con «9 de 17» al centro.
 * 5. Las dos builds de Comparar: `BUILD_TONE` (A lila, B ámbar); quién gana lo dice el borde de su tarjeta, no el anillo.
 * Y «sin medir» (`ProgressRing unmeasured`): la pista punteada y «?».
 */

/** Medida con juicio: verde si más es mejor (una salida, las manos buenas), rojo claro si más es peor (un problema). */
export const judgeTone = (higherIsBetter: boolean): Tone => (higherIsBetter ? 'success' : 'danger')

/** Progreso de una tarea (clasificar, importar): ámbar mientras falta, verde cuando está lista. */
export const progressTone = (done: number, total: number): Tone => (total > 0 && done >= total ? 'success' : 'warning')

/** Las builds de Comparar: A es lo tuyo (lila) y B la otra (ámbar), en todos sus anillos. */
export const BUILD_TONE = { A: 'brand', B: 'info' } as const satisfies Record<'A' | 'B', Tone>
