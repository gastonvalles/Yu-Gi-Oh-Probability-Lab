import type { PracticeVerdict } from './practice'

/** Color del veredicto de la mano: lo heredan el chip, el brillo de la bandeja y sus hijos. */
export const VERDICT_COLOR: Record<PracticeVerdict, string> = {
  clean: '[--verdict-color:rgb(var(--success-rgb))]',
  'with-problem': '[--verdict-color:rgb(var(--warning-rgb))]',
  'no-opening': '[--verdict-color:rgb(var(--danger-rgb))]',
}

/** Color de una salida (verde) o de un problema (rojo): lo heredan los botones y la explicación. */
export const RULE_COLOR = {
  opening: '[--rule-color:rgb(var(--success-rgb))]',
  problem: '[--rule-color:rgb(var(--danger-rgb))]',
} as const

/** Dorso de carta: lo comparten el mazo y las cartas que se están repartiendo. */
export const CARD_BACK =
  'absolute inset-0 z-1 overflow-hidden rounded-tag border-2 border-primary/75 [background:radial-gradient(ellipse_at_50%_50%,rgb(var(--primary-rgb)/0.55),transparent_62%),repeating-linear-gradient(45deg,rgb(var(--primary-rgb)/0.2)_0_4px,transparent_4px_9px),linear-gradient(160deg,#1d1033,#0b0614)] after:absolute after:inset-[24%_20%] after:rounded-full after:border-2 after:border-accent/75 after:bg-[radial-gradient(circle,rgb(var(--accent-rgb)/0.35),transparent_70%)]'

/** Aviso dentro de la mesa (falta de cartas, mano bloqueada). */
export const PRACTICE_NOTICE = 'rounded-control border border-border px-3 py-[0.6rem] text-small text-muted'
