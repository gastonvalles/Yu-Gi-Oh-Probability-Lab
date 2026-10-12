import { t } from '../../i18n'
import type { CardOrigin, CardRole } from '../../types'

// Los textos son getters: se arman al leerlos (en el idioma de ese momento), no al evaluar el módulo.
export const ROLE_EDITOR_SECTIONS = [
  {
    get title() { return t('roles.section.plan.title') },
    get description() { return t('roles.section.plan.description') },
    roles: ['starter', 'extender', 'enabler', 'searcher', 'draw', 'payoff', 'recovery'] as const,
  },
  {
    get title() { return t('roles.section.interaction.title') },
    get description() { return t('roles.section.interaction.description') },
    roles: ['handtrap', 'disruption', 'boardbreaker', 'floodgate'] as const,
  },
  {
    get title() { return t('roles.section.utility.title') },
    get description() { return t('roles.section.utility.description') },
    roles: ['brick', 'garnet'] as const,
  },
] as const

export const ORIGIN_HELP_TEXT: Record<CardOrigin, string> = {
  get engine() { return t('roles.help.engine') },
  get non_engine() { return t('roles.help.nonEngine') },
}

export const ORIGIN_BLURB_TEXT: Record<CardOrigin, string> = {
  get engine() { return t('roles.blurb.engine') },
  get non_engine() { return t('roles.blurb.nonEngine') },
}

export const ROLE_HELP_TEXT: Record<CardRole, string> = {
  get starter() { return t('roles.help.starter') },
  get extender() { return t('roles.help.extender') },
  get enabler() { return t('roles.help.enabler') },
  get searcher() { return t('roles.help.searcher') },
  get draw() { return t('roles.help.draw') },
  get payoff() { return t('roles.help.payoff') },
  get recovery() { return t('roles.help.recovery') },
  get handtrap() { return t('roles.help.handtrap') },
  get disruption() { return t('roles.help.disruption') },
  get boardbreaker() { return t('roles.help.boardbreaker') },
  get floodgate() { return t('roles.help.floodgate') },
  get brick() { return t('roles.help.brick') },
  get garnet() { return t('roles.help.garnet') },
}
