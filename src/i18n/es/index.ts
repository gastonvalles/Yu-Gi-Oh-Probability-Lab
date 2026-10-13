import { builder } from './builder'
import { catalog } from './catalog'
import { common } from './common'
import { deck } from './deck'
import { lab } from './lab'
import { meta } from './meta'
import { practice } from './practice'
import { roles } from './roles'
import { rules } from './rules'
import { search } from './search'
import { shell } from './shell'

/** Un área por archivo y por prefijo de clave (`shell.…`, `deck.…`): cada parte de la app edita sólo el suyo. */
export const areas = { common, shell, deck, search, roles, rules, lab, builder, practice, meta, catalog }

export const es = { ...common, ...shell, ...deck, ...search, ...roles, ...rules, ...lab, ...builder, ...practice, ...meta, ...catalog }
