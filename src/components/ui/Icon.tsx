import type { ReactNode, SVGProps } from 'react'

import { cx } from './cx'

/**
 * Íconos de la app: todos en la misma grilla de 24 px, trazo de 1.75, puntas redondeadas.
 * Se usan siempre con <Icon name="..." />: nada de SVG suelto en los componentes.
 */
const PATHS = {
  // — Pasos de la app —
  cards: (
    <>
      <rect data-fill x="7.5" y="3.5" width="12" height="16" rx="2.2" />
      <path d="M4.5 7.5v11a2.2 2.2 0 0 0 2.2 2.2h9.3" />
      <ellipse data-cut cx="13.5" cy="11.5" rx="2.1" ry="3.1" />
    </>
  ),
  tag: (
    <>
      <path data-fill d="M3 5.5A2.5 2.5 0 0 1 5.5 3h6.2a2 2 0 0 1 1.4.6l7.3 7.3a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0L3.6 12.9A2 2 0 0 1 3 11.5z" />
      <circle data-cut cx="7.6" cy="7.6" r="1.3" />
    </>
  ),
  flask: (
    <>
      <path data-fill d="M10 2.5v7a2 2 0 0 1-.2.9L4.7 20.5a1 1 0 0 0 .9 1.5h12.8a1 1 0 0 0 .9-1.5l-5.1-10.1a2 2 0 0 1-.2-.9v-7" />
      <path d="M8.5 2.5h7" />
      <path data-cut d="M7.2 16h9.6" />
    </>
  ),
  flag: (
    <>
      <path d="M5.5 21V3.5" />
      <path data-fill d="M5.5 4.5h12.2a.8.8 0 0 1 .6 1.3L15.6 9l2.7 3.2a.8.8 0 0 1-.6 1.3H5.5z" />
    </>
  ),
  heart: (
    <path data-fill d="M12 20.3s-7.6-4.7-7.6-10.2A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.6 2.5c0 5.5-7.6 10.2-7.6 10.2z" />
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  /** La vista 3D de la mesa: un cubo. */
  cube: (
    <>
      <path data-fill d="M12 3 4 7.5v9L12 21l8-4.5v-9z" />
      <path data-cut d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  /** La vista superior de la mesa: dos planos uno sobre otro. */
  'view-top': (
    <>
      <rect data-fill x="3.5" y="7" width="12" height="13" rx="2" />
      <path d="M8 3.5h10.5a2 2 0 0 1 2 2V16" />
    </>
  ),
  /** Borrar (la tecla del teclado de LP): una etiqueta con una cruz. */
  backspace: (
    <>
      <path data-fill d="M20 6H8l-5 6 5 6h12z" />
      <path data-cut d="M12 9l6 6M18 9l-6 6" />
    </>
  ),
  /** Pegar desde el portapapeles. */
  clipboard: (
    <>
      <rect data-fill x="6" y="5" width="12" height="16" rx="2" />
      <path d="M9 5V3.5h6V5" />
    </>
  ),
  /** Un enlace que ya no funciona: el enlace tachado. */
  'link-off': (
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
      <path d="M4 4l16 16" />
    </>
  ),
  play: <path data-fill d="M7 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 7 4.8z" />,
  pause: (
    <>
      <rect data-fill x="5" y="4" width="5" height="16" rx="1.2" />
      <rect data-fill x="14" y="4" width="5" height="16" rx="1.2" />
    </>
  ),
  /** Avance rápido: dos triángulos, como en un replay. */
  'fast-forward': <path data-fill d="M3.5 6.1v11.8a1 1 0 0 0 1.56.83L12 13.3v4.6a1 1 0 0 0 1.56.83l8-5.9a1 1 0 0 0 0-1.66l-8-5.9A1 1 0 0 0 12 6.1v4.6L5.06 5.27A1 1 0 0 0 3.5 6.1z" />,
  /** Volver al principio (de un replay): una barra y un triángulo hacia la izquierda. */
  'skip-back': (
    <>
      <path data-fill d="M18.2 5.6v12.8a.8.8 0 0 1-1.22.68l-9.6-6.4a.8.8 0 0 1 0-1.36l9.6-6.4a.8.8 0 0 1 1.22.68z" />
      <path d="M5 5.5v13" />
    </>
  ),
  dice: (
    <>
      <rect data-fill x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle data-cut cx="8.5" cy="8.5" r="1" />
      <circle data-cut cx="15.5" cy="8.5" r="1" />
      <circle data-cut cx="12" cy="12" r="1" />
      <circle data-cut cx="8.5" cy="15.5" r="1" />
      <circle data-cut cx="15.5" cy="15.5" r="1" />
    </>
  ),
  send: (
    <>
      <path data-fill d="M20.4 4.2 3.9 10.6a.8.8 0 0 0 .05 1.5l6.2 2.1 2.1 6.2a.8.8 0 0 0 1.5.05z" />
      <path data-cut d="m10.2 14.1 5.4-5.4" />
    </>
  ),
  eye: (
    <>
      <path data-fill d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle data-cut cx="12" cy="12" r="2.8" />
    </>
  ),
  chat: (
    <>
      <path data-fill d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11.4l-4 3.4a.6.6 0 0 1-1-.46V16h-.1A2.5 2.5 0 0 1 4 13.5z" />
      <path data-cut d="M8.5 9.2h7M8.5 12.2h4" />
    </>
  ),
  timer: (
    <>
      <circle data-fill cx="12" cy="13.5" r="7.5" />
      <path data-cut d="M12 10.5v3.2l2.2 1.4" />
      <path d="M9.5 2.5h5" />
      <path d="M12 2.5v3.5" />
    </>
  ),
  columns: (
    <>
      <rect data-fill x="3" y="4" width="7.5" height="16" rx="2.2" />
      <rect data-fill x="13.5" y="4" width="7.5" height="16" rx="2.2" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11.5" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path data-fill d="M4.5 16.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2.5" />
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

  // La patita de las mascotas: una almohadilla y cuatro deditos.
  paw: (
    <>
      <path data-fill d="M12 11.3c-2.7 0-5.2 2.4-5.2 4.9 0 1.6 1.1 2.6 2.5 2.6 1 0 1.7-.4 2.7-.4s1.7.4 2.7.4c1.4 0 2.5-1 2.5-2.6 0-2.5-2.5-4.9-5.2-4.9z" />
      <ellipse data-fill cx="5.1" cy="10.5" rx="1.8" ry="2.4" transform="rotate(-20 5.1 10.5)" />
      <ellipse data-fill cx="9.2" cy="5.9" rx="1.8" ry="2.6" transform="rotate(-8 9.2 5.9)" />
      <ellipse data-fill cx="14.8" cy="5.9" rx="1.8" ry="2.6" transform="rotate(8 14.8 5.9)" />
      <ellipse data-fill cx="18.9" cy="10.5" rx="1.8" ry="2.4" transform="rotate(20 18.9 10.5)" />
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
  sort: <path d="M4 6.5h16M4 12h11M4 17.5h6" />,
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
  /** Contraer el menú lateral: dos flechas hacia la izquierda. */
  'chevrons-left': (
    <>
      <path d="m11 17-5-5 5-5" />
      <path d="m18 17-5-5 5-5" />
    </>
  ),
  /** Botón de hamburguesa: abre el menú en el celular. */
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,

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

  /** Expansiones: una caja de sobres vista en perspectiva. */
  package: (
    <>
      <path data-fill d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z" />
      <path d="m3.5 8 8.5 4.5L20.5 8M12 12.5v8" />
    </>
  ),
  /** Banlists: un círculo tachado. */
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </>
  ),
  /** Precios: una moneda con el signo de dólar. */
  dollar: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M14.8 9.3c-.4-.9-1.4-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2 0 1.1 1.1 1.7 2.8 2.1 1.8.4 2.9.9 2.9 2.2 0 1.3-1.3 2.1-2.9 2.1-1.5 0-2.6-.6-3-1.6" />
      <path d="M12 6.2v1.7M12 16.1v1.7" />
    </>
  ),

  // — Torneos (tarjetas del meta) —
  trophy: (
    <>
      <path data-fill d="M8 4h8v5.5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5.5v1a3 3 0 0 0 3 3M16 6h2.5v1a3 3 0 0 1-3 3" />
      <path d="M12 13.5V17M9 20h6M12 17v3" />
    </>
  ),
  calendar: (
    <>
      <rect data-fill x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  user: (
    <>
      <circle data-fill cx="12" cy="8" r="4" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4.2 4.2 0 0 0 5.9 0l3-3a4.2 4.2 0 0 0-5.9-5.9l-1.4 1.4" />
      <path d="M14 10a4.2 4.2 0 0 0-5.9 0l-3 3a4.2 4.2 0 0 0 5.9 5.9l1.4-1.4" />
    </>
  ),

  // — Marcas (logos oficiales, de Simple Icons, dominio público): van rellenas, no con trazo —
  github: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"
    />
  ),
  instagram: (
    <path
      fill="currentColor"
      stroke="none"
      d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"
    />
  ),
  linkedin: (
    <path
      fill="currentColor"
      stroke="none"
      d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
    />
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof PATHS

/** Todos los íconos, en el orden del set: el catálogo de /playground los muestra sin que nadie tenga que anotarlos. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[]

/** linear: sólo trazo (por defecto) · bulk: trazo + relleno suave en las formas cerradas · bold: relleno sólido (la pestaña activa). */
type IconVariant = 'linear' | 'bulk' | 'bold'

interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'width' | 'height'> {
  name: IconName
  /** Lado en px (por defecto 18). */
  size?: number
  strokeWidth?: number
  variant?: IconVariant
}

const VARIANT_CLASS: Record<IconVariant, string> = {
  linear: '',
  bulk: '[&_[data-fill]]:fill-current/30',
  // Los detalles recortados (ojos, puntos, líneas) toman el color del fondo del ícono: `--icon-cut`.
  bold: '[&_[data-fill]]:fill-current [&_[data-cut]]:stroke-(--icon-cut,var(--card-background))',
}

export function Icon({ name, size = 18, strokeWidth = 1.75, variant = 'linear', className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={variant === 'bold' ? strokeWidth + 0.35 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cx(VARIANT_CLASS[variant], className)}
      {...props}
    >
      {PATHS[name]}
    </svg>
  )
}
