import type { Messages } from '../types'
import { auto } from './auto'
import { builder } from './builder'
import { catalog } from './catalog'
import { common } from './common'
import { deck } from './deck'
import { duel } from './duel'
import { handtraps } from './handtraps'
import { lab } from './lab'
import { meta } from './meta'
import { practice } from './practice'
import { roles } from './roles'
import { rules } from './rules'
import { search } from './search'
import { shell } from './shell'
import { solo } from './solo'

export const areas = { common, shell, deck, search, roles, rules, lab, builder, practice, meta, catalog, duel, handtraps, auto, solo }

export const en: Messages = { ...common, ...shell, ...deck, ...search, ...roles, ...rules, ...lab, ...builder, ...practice, ...meta, ...catalog, ...duel, ...handtraps, ...auto, ...solo }
