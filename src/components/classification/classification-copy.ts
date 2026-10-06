import type { CardOrigin, CardRole } from '../../types'

export const ROLE_EDITOR_SECTIONS = [
  {
    title: 'Plan de Juego',
    description: 'Inicio, conversión y continuidad de tu línea.',
    roles: ['starter', 'extender', 'enabler', 'searcher', 'draw', 'combo_piece', 'payoff', 'recovery'] as const,
  },
  {
    title: 'Interacción',
    description: 'Cómo frena, rompe o restringe al rival.',
    roles: ['handtrap', 'disruption', 'boardbreaker', 'floodgate', 'removal'] as const,
  },
  {
    title: 'Utility',
    description: 'Cartas incómodas, dependientes o de metajuego.',
    roles: ['brick', 'garnet', 'tech'] as const,
  },
] as const

export const ORIGIN_HELP_TEXT: Record<CardOrigin, string> = {
  engine: 'Parte del core del deck: cartas que querés ver para ejecutar el plan principal.',
  non_engine: 'Interacción o soporte que no pertenece al motor principal del deck.',
  hybrid: 'Cuenta para checks de Engine y Non-engine. Si querés que no afecte un check, elegí uno de los dos.',
}

export const ORIGIN_BLURB_TEXT: Record<CardOrigin, string> = {
  engine: 'Core y plan principal.',
  non_engine: 'Interacción y soporte externo.',
  hybrid: 'Cuenta para ambos lados en los checks.',
}

export const ROLE_HELP_TEXT: Record<CardRole, string> = {
  starter: 'Carta que por sí sola inicia la línea principal.',
  extender: 'Continúa la jugada una vez que la mano ya empezó.',
  enabler: 'Habilita la condición o ventana que otra carta necesita.',
  searcher: 'Encuentra piezas concretas del deck, GY o zonas visibles.',
  draw: 'Aumenta la mano o mejora mucho la calidad del robo.',
  combo_piece: 'Pieza necesaria dentro de una secuencia concreta.',
  payoff: 'Convierte la línea en ventaja, presión o cierre.',
  recovery: 'Recupera recursos después de gastar piezas o recibir interacción.',
  handtrap: 'Interacción que frena al rival desde la mano.',
  disruption: 'Interrumpe al rival durante su línea o una vez establecida la mesa.',
  boardbreaker: 'Ayuda a desarmar un campo rival y abrir espacio para jugar.',
  floodgate: 'Restringe líneas del rival de forma continua o persistente.',
  removal: 'Quita cartas rivales por destrucción, banish, bounce o un efecto similar.',
  brick: 'Carta incómoda de robar si no viene acompañada.',
  garnet: 'Pieza que preferís dejar en el deck porque en mano empeora la línea.',
  tech: 'Slot flexible para matchup o metajuego.',
}

