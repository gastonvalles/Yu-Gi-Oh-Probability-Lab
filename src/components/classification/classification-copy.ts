import type { CardOrigin, CardRole } from '../../types'

export const ROLE_EDITOR_SECTIONS = [
  {
    title: 'Plan de Juego',
    description: 'Inicio, conversión y continuidad de tu línea.',
    roles: ['starter', 'extender', 'enabler', 'searcher', 'payoff', 'recovery'] as const,
  },
  {
    title: 'Interacción',
    description: 'Cómo frena, rompe o restringe al rival.',
    roles: ['disruption', 'boardbreaker'] as const,
  },
  {
    title: 'Utility',
    description: 'Cartas incómodas, dependientes o de metajuego.',
    roles: ['brick', 'tech'] as const,
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
  searcher: 'Busca piezas del deck, GY o zonas visibles, o te hace robar más cartas.',
  payoff: 'Convierte la línea en ventaja, presión o cierre.',
  recovery: 'Recupera recursos después de gastar piezas o recibir interacción.',
  disruption: 'Frena al rival desde la mano o en mesa: handtraps, trampas, negaciones y floodgates.',
  boardbreaker: 'Rompe campo o quita cartas del rival y abre espacio para jugar.',
  brick: 'Carta que preferís no robar: incómoda, o inútil en mano si no viene acompañada.',
  tech: 'Slot flexible para matchup o metajuego.',
}
