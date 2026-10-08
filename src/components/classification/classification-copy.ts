import type { CardOrigin, CardRole } from '../../types'

export const ROLE_EDITOR_SECTIONS = [
  {
    title: 'Plan de Juego',
    description: 'Inicio, conversión y continuidad de tu línea.',
    roles: ['starter', 'extender', 'enabler', 'searcher', 'draw', 'payoff', 'recovery'] as const,
  },
  {
    title: 'Interacción',
    description: 'Cómo frena o rompe al rival, por sí sola (no por una condición de tu línea).',
    roles: ['handtrap', 'disruption', 'boardbreaker', 'floodgate'] as const,
  },
  {
    title: 'Utilidad',
    description: 'Cartas incómodas o que preferís no robar.',
    roles: ['brick', 'garnet'] as const,
  },
] as const

export const ORIGIN_HELP_TEXT: Record<CardOrigin, string> = {
  engine: 'Parte del core del deck: cartas que querés ver para ejecutar el plan principal.',
  non_engine: 'Interacción o soporte que no pertenece al motor principal del deck.',
}

export const ORIGIN_BLURB_TEXT: Record<CardOrigin, string> = {
  engine: 'Core y plan principal.',
  non_engine: 'Interacción y soporte externo.',
}

export const ROLE_HELP_TEXT: Record<CardRole, string> = {
  starter: 'Carta que por sí sola inicia la línea principal.',
  extender: 'Continúa la jugada una vez que la mano ya empezó.',
  enabler: 'Habilita la línea: pieza o condición que otras cartas necesitan para funcionar.',
  searcher: 'Busca una pieza concreta del deck, GY o zonas visibles (por ejemplo, al invocarse o tributarse).',
  draw: 'Te hace robar cartas (Mulcharmy, Pot of Desires…); no busca una carta concreta.',
  payoff: 'Convierte la línea en ventaja, presión o cierre.',
  recovery: 'Recupera recursos después de gastar piezas o recibir interacción.',
  handtrap: 'Interacción que frena al rival desde la mano.',
  disruption: 'Frena al rival en mesa o en su turno (negaciones, trampas), por sí sola.',
  boardbreaker: 'Rompe campo o quita cartas del rival por sí sola. Si solo lo hace cuando se cumple una condición de tu línea, marcá su función principal.',
  floodgate: 'Restringe líneas del rival de forma continua o persistente.',
  brick: 'Carta incómoda de robar si no viene acompañada.',
  garnet: 'Pieza que preferís dejar en el deck porque en mano empeora la línea.',
}
