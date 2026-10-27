import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { useFocusTrap } from '../../app/use-focus-trap'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { RULE_COLOR } from './practice-styles'

/** Qué dice el Lab de la mano de apertura: cuántas salidas y problemas, si no es jugable y si el Lab todavía no puede decir nada (falta clasificar). */
export interface RulesSummary {
  openings: number
  problems: number
  unplayable: boolean
  blocked: boolean
}

/** Cuánto lugar pide el texto completo («3 salidas», «Mano no jugable», «2 salidas · 1 problema»); con menos, la píldora queda en su ícono y un número. */
type Fit = 'short' | 'mid' | 'long'

/** El texto de la píldora: el resumen completo, el corto (ícono + número) y su color. Sin nada que decir, nada. */
export function rulesPillText({ openings, problems, unplayable, blocked }: RulesSummary): { label: string; short: string; icon: IconName; tone: 'opening' | 'problem' | 'warning'; fit: Fit } | null {
  if (blocked) {
    return { label: t('practice.board.openings'), short: '', icon: 'alert', tone: 'warning', fit: 'short' }
  }

  const problemText = problems > 0 ? t('practice.board.pillProblems', { count: problems }) : null

  if (unplayable) {
    return { label: [t('practice.board.unplayable'), problemText].filter(Boolean).join(' · '), short: problems > 0 ? `${problems}` : '', icon: 'alert', tone: 'problem', fit: problems > 0 ? 'long' : 'mid' }
  }

  if (openings === 0 && problems === 0) {
    return null
  }

  const openingText = openings > 0 ? t('practice.board.pillOpenings', { count: openings }) : null

  return {
    label: [openingText, problemText].filter(Boolean).join(' · '),
    short: [openings > 0 ? `${openings}` : null, problems > 0 ? `${problems}` : null].filter(Boolean).join(' · '),
    icon: openings > 0 ? 'check' : 'alert',
    tone: openings > 0 ? 'opening' : 'problem',
    fit: openings > 0 && problems > 0 ? 'long' : 'short',
  }
}

const TONE = { ...RULE_COLOR, warning: '[--rule-color:rgb(var(--warning-rgb))]' } as const
// El texto completo entra desde este ancho libre (medido en la barra con el ícono y la flecha: «3 salidas» 111 px, «Mano no jugable» 159); con menos, ícono + número (el `aria-label` lleva todo).
const FULL_AT: Record<Fit, string> = { short: '@min-[8.5rem]:inline', mid: '@min-[10.5rem]:inline', long: '@min-[13rem]:inline' }
const SHORT_AT: Record<Fit, string> = { short: '@min-[8.5rem]:hidden', mid: '@min-[10.5rem]:hidden', long: '@min-[13rem]:hidden' }
/** El panel abierto: hasta 24 rem de ancho y 8 px de aire con los bordes de la pantalla. */
const PANEL_MAX = 384
const PANEL_EDGE = 8

/**
 * Las salidas y problemas de tu mano de apertura en el celular (hasta 1100 px): una píldora en la barra de arriba, en el lugar libre entre «Volver» y Deshacer, que dice el resumen
 * («3 salidas», «2 salidas · 1 problema», «Mano no jugable») y se achica a ícono + número si no entra. Tocarla abre debajo de la barra los chips y su explicación (`children`, el `PracticeBoard`):
 * tapan sólo mientras están abiertos y se cierran tocando afuera o con Escape (el foco vuelve a la píldora). No se abre sola: antes los chips flotaban sobre tus magias, trampas y pilas.
 * - Accesibilidad: `aria-haspopup="dialog"` y `aria-expanded`; el panel es un `dialog` con nombre, el foco entra al primer chip (nunca a un campo de texto: `useFocusTrap`).
 * - Usos: la barra de la práctica (`PracticeMat`) y la de «Jugar solo automático» (`AutoBar`), por `MatRulesContext`; la muestra del catálogo (`defaultOpen`).
 */
export function RulesPill({ summary, children, defaultOpen = false }: { summary: RulesSummary; children: ReactNode; /** Abierta de entrada (la muestra del catálogo). */ defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [place, setPlace] = useState<CSSProperties>({})
  const root = useRef<HTMLDivElement | null>(null)
  const panel = useRef<HTMLDivElement | null>(null)
  const text = rulesPillText(summary)

  useFocusTrap(panel, open && !defaultOpen)

  // El panel cuelga de la barra (debajo de ella, con su borde derecho en el de la píldora si hay lugar; en el celular, de lado a lado con 8 px de aire) y la sigue si algo se desplaza.
  useLayoutEffect(() => {
    if (!open) {
      return
    }

    const update = () => {
      const box = root.current?.getBoundingClientRect()

      if (!box) return
      const width = Math.min(PANEL_MAX, window.innerWidth - 2 * PANEL_EDGE)
      setPlace({ top: box.bottom + 4, width, left: Math.max(PANEL_EDGE, Math.min(box.right - width, window.innerWidth - width - PANEL_EDGE)) })
    }

    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)

    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node

      if (!root.current?.contains(target) && !panel.current?.contains(target)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector('button')?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  // La píldora ocupa el lugar libre de la barra (`flex-1`) y se mide contra él (`@container`): sin texto que decir, el lugar queda vacío.
  if (!text) {
    return <div className="flex-1" />
  }

  const name = t('practice.board.menu')

  return (
    <div ref={root} className="@container flex min-w-0 flex-1 justify-end">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${name}: ${text.label}`}
        title={`${name}: ${text.label}`}
        className={cx('group flex min-h-11 min-w-11 cursor-pointer items-center justify-center border-0 bg-transparent p-0 outline-none [-webkit-tap-highlight-color:transparent]', TONE[text.tone])}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex h-8 items-center gap-1 whitespace-nowrap rounded-full border border-[color-mix(in_srgb,var(--rule-color)_55%,transparent)] bg-[color-mix(in_srgb,var(--rule-color)_12%,transparent)] px-2.5 text-micro font-semibold text-foreground transition-[background,box-shadow] duration-150 group-hover:bg-[color-mix(in_srgb,var(--rule-color)_22%,transparent)] group-focus-visible:shadow-focus group-aria-expanded:bg-[color-mix(in_srgb,var(--rule-color)_32%,transparent)] motion-reduce:transition-none">
          <Icon name={text.icon} size={14} className="shrink-0 [color:var(--rule-color)]" />
          <span className={cx('hidden', FULL_AT[text.fit])}>{text.label}</span>
          {text.short ? <span className={cx('tabular-nums', SHORT_AT[text.fit])}>{text.short}</span> : null}
          <Icon name="chevron-down" size={14} className="shrink-0 transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none" />
        </span>
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              role="dialog"
              aria-label={name}
              tabIndex={-1}
              className="fixed z-70 animate-pop rounded-panel border border-border bg-card-background p-2 shadow-overlay focus-visible:outline-none motion-reduce:animate-none"
              style={place}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
