import { auto } from './auto'
import { builder } from './builder'
import { catalog } from './catalog'
import { common } from './common'
import { deck } from './deck'
import { duel } from './duel'
import { handtraps } from './handtraps'
import { lab } from './lab'
import { landing } from './landing'
import { meta } from './meta'
import { novedades } from './novedades'
import { practice } from './practice'
import { reportar } from './reportar'
import { roles } from './roles'
import { rules } from './rules'
import { search } from './search'
import { shell } from './shell'
import { solo } from './solo'

/** Un área por archivo y por prefijo de clave (`shell.…`, `deck.…`): cada parte de la app edita sólo el suyo. */
export const areas = { common, shell, deck, search, roles, rules, lab, builder, practice, meta, catalog, duel, handtraps, auto, solo, novedades, landing, reportar }

export const es = { ...common, ...shell, ...deck, ...search, ...roles, ...rules, ...lab, ...builder, ...practice, ...meta, ...catalog, ...duel, ...handtraps, ...auto, ...solo, ...novedades, ...landing, ...reportar }
