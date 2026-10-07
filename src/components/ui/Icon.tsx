import type { ReactNode, SVGProps } from 'react'

/**
 * Íconos de la app: todos en la misma grilla de 24 px, trazo de 1.75, puntas redondeadas.
 * Se usan siempre con <Icon name="..." />: nada de SVG suelto en los componentes.
 */
const PATHS = {
  // — Pasos de la app —
  cards: (
    <>
      <rect x="7.5" y="3.5" width="12" height="16" rx="2.2" />
      <path d="M4.5 7.5v11a2.2 2.2 0 0 0 2.2 2.2h9.3" />
      <ellipse cx="13.5" cy="11.5" rx="2.1" ry="3.1" />
    </>
  ),
  tag: (
    <>
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3h6.2a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0L3.6 12.9A2 2 0 0 1 3 11.5z" />
      <circle cx="7.6" cy="7.6" r="1.3" />
    </>
  ),
  flask: (
    <>
      <path d="M10 2.5v7a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5l-5.1-10.1a2 2 0 0 1-.2-.9v-7" />
      <path d="M8.5 2.5h7" />
      <path d="M7.2 16h9.6" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="4" width="7.5" height="16" rx="2.2" />
      <rect x="13.5" y="4" width="7.5" height="16" rx="2.2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11.5" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4.5 20h15" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15.5V4" />
      <path d="m7.5 8.5 4.5-4.5 4.5 4.5" />
      <path d="M4.5 20h15" />
    </>
  ),

  hand: (
    <>
      <rect x="8.5" y="2" width="7" height="11" rx="1.2" />
      <rect x="2.5" y="4" width="7" height="11" rx="1.2" transform="rotate(-12 6 9.5)" />
      <rect x="14.5" y="4" width="7" height="11" rx="1.2" transform="rotate(12 18 9.5)" />
    </>
  ),

  // — Estado y avisos —
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.2" />
      <path d="M12 7.7h.01" />
    </>
  ),
  alert: (
    <>
      <path d="M10.3 3.9 2.5 17.6A2 2 0 0 0 4.2 20.6h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.2" />
      <path d="M12 17.2h.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.4 2.7 2.7L16 9.7" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sparkles: (
    <>
      <path d="m10 3.5 1.7 4.8 4.8 1.7-4.8 1.7L10 16.5l-1.7-4.8L3.5 10l4.8-1.7z" />
      <path d="m18 14.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  bolt: <path d="M13 3 5 13.5h6L10 21l9-11h-6z" />,
  percent: (
    <>
      <path d="M19 5 5 19" />
      <circle cx="6.8" cy="6.8" r="2.3" />
      <circle cx="17.2" cy="17.2" r="2.3" />
    </>
  ),
  chart: <path d="M5 20v-8M12 20V5M19 20v-5" />,

  // — Acciones —
  x: <path d="M6 6l12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m20 20-4.9-4.9" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h8M16 7h4" />
      <circle cx="14" cy="7" r="2" />
      <path d="M4 17h3M11 17h9" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  pencil: (
    <>
      <path d="m4 20 1.2-4.4L16.4 4.4a2.1 2.1 0 0 1 3 3L8.2 18.8z" />
      <path d="m14.5 6.3 3 3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M10 4h4" />
      <path d="m6 7 1 12a2 2 0 0 0 2 1.8h6a2 2 0 0 0 2-1.8l1-12" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9.5" rx="2.2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.5-5.8" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  save: <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1z" />,
  swap: (
    <>
      <path d="M8 3.5 4 7.5l4 4" />
      <path d="M4 7.5h16" />
      <path d="m16 20.5 4-4-4-4" />
      <path d="M20 16.5H4" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  'chevron-left': <path d="m15 6-6 6 6 6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,

  // — Contenido —
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 12.5 9 5 9-5" />
      <path d="m3 16.5 9 5 9-5" />
    </>
  ),
  list: (
    <>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17.5 5-4.5 3.5 3 3.5-3.5 4.5 4.5" />
    </>
  ),
  file: (
    <>
      <path d="M7 3.5h7l4.5 4.5v11a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M14 3.5V8h4.5" />
    </>
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

export const ICON_NAMES = Object.keys(PATHS) as IconName[]

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: IconName
  /** Lado en px (por defecto 18). */
  size?: number
  strokeWidth?: number
}

export function Icon({ name, size = 18, strokeWidth = 1.75, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {PATHS[name]}
    </svg>
  )
}
