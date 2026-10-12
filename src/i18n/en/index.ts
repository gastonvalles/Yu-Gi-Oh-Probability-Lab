import type { Messages } from '../types'
import { builder } from './builder'
import { common } from './common'
import { deck } from './deck'
import { lab } from './lab'
import { meta } from './meta'
import { practice } from './practice'
import { roles } from './roles'
import { rules } from './rules'
import { search } from './search'
import { shell } from './shell'

export const areas = { common, shell, deck, search, roles, rules, lab, builder, practice, meta }

export const en: Messages = { ...common, ...shell, ...deck, ...search, ...roles, ...rules, ...lab, ...builder, ...practice, ...meta }
