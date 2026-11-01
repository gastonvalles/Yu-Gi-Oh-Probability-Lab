import type { MessageKey } from '../i18n'

/**
 * Las listas fijas de los mazos del bot (el rival «Bot» del duelo automático): sólo datos, sin imports de valores, para que el lobby las muestre («Ver mazo») sin cargar el núcleo
 * (`auto-isolation.test.ts` lo exige). `BOT_DECKS` (`auto/bot/decks`) les suma el ejecutor y `BOT_DECK_MENU` (`handtraps.ts`) sale de acá. Cada lista es FIJA: las reglas de su
 * ejecutor nombran sus cartas, así que no cambia con el meta. `testedWith`: el commit de CardScripts (`auto-data.lock.json`) con el que pasó su goldfish (`auto-bot-*.slow.test.ts`).
 * `ready`: pasó su goldfish y su fuzz (la interfaz ofrece sólo éstos).
 */
export interface BotDeckList {
  id: string
  name: string
  /** Una línea de lo que es, para la fila «Rival». */
  line: Extract<MessageKey, `auto.rival.deck.${string}`>
  ready: boolean
  main: readonly (readonly [number, number])[]
  extra: readonly (readonly [number, number])[]
  testedWith: string
}

/** Los passcodes del mazo de Sky Striker que nombran las reglas (verificados contra el `.cdb` del núcleo). */
export const SKY = {
  raye: 26077387,
  roze: 37351133,
  engage: 63166095,
  linkage: 9726840,
  hornet: 52340444,
  lemnisgate: 34433770,
  shark: 51227866,
  widow: 98338152,
  vision: 20508881,
  mst: 5318639,
  fallen: 30271097,
  crown: 98829635,
  desires: 35261759,
  talent: 25311006,
  called: 24224830,
  rota: 32807846,
  zero: 76072561,
  kagari: 63288573,
  shizuku: 90673288,
  hayate: 8491308,
  amatsu: 25072579,
  engageZero: 17217034,
  zeke: 75147529,
  camellia: 63013339,
  azalea: 98462037,
  token: 52340445,
} as const

/**
 * Sky Striker (`executors/sky-striker.ts`): la lista que ganó el WCQ Regional de Pittsboro (2026-09-13, 189 jugadores), la ganadora más reciente de la familia en
 * `src/data/meta-decks.json` (la de Buenos Aires, 2026-09-26, es R.B. con un solo Sky Striker).
 */
export const SKY_STRIKER_DECK: BotDeckList = {
  id: 'sky-striker',
  name: 'Sky Striker',
  line: 'auto.rival.deck.skyStriker',
  ready: true,
  main: [
    [SKY.raye, 3],
    [SKY.roze, 2],
    [14558127, 3], // Ash Blossom & Joyous Spring
    [59438930, 2], // Ghost Ogre & Snow Rabbit
    [73642296, 1], // Ghost Belle & Haunted Mansion
    [94145021, 2], // Droll & Lock Bird
    [SKY.engage, 3],
    [SKY.linkage, 3],
    [SKY.hornet, 1],
    [SKY.lemnisgate, 2],
    [SKY.shark, 1],
    [SKY.widow, 3],
    [SKY.vision, 3],
    [SKY.mst, 1],
    [SKY.fallen, 2],
    [SKY.crown, 2],
    [SKY.desires, 3],
    [SKY.talent, 1],
    [SKY.called, 1],
    [SKY.rota, 1],
  ],
  extra: [
    [SKY.zero, 3],
    [SKY.kagari, 3],
    [SKY.shizuku, 1],
    [SKY.hayate, 1],
    [SKY.amatsu, 1],
    [SKY.engageZero, 1],
    [SKY.zeke, 1],
    [SKY.camellia, 1],
    [SKY.azalea, 1],
    [87746184, 1], // Albion the Branded Dragon
    [78397661, 1], // Ecclesia and the Dark Dragon
  ],
  testedWith: 'bc5d82d66842f3c62d20747c530b164ce98004f3',
}

/**
 * Los passcodes del mazo de Angelechy que nombran las reglas (verificados contra el `.cdb` del núcleo, con su script; Strategy Score, Opposition, Endgame Problem, Verdict,
 * Castellan y Seneschal cargan el script de preestreno por el mapa `released` de `auto-data.lock.json`).
 */
export const ANGELECHY = {
  problem: 17782288,
  score: 13068112,
  opposition: 86457955,
  endgame: 12845564,
  bifrost: 32236916,
  desires: 35261759,
  burial: 35726888,
  terraforming: 73628505,
  purge: 97045737,
  impulse: 40366667,
  spark: 6325660,
  e4: 80565021,
  disturbance: 54171327,
  verdict: 48340269,
  fuwalos: 42141493,
  ash: 14558127,
  ogre: 59438930,
  droll: 94145021,
  shatranga: 42410161,
  enlisted: 81797573,
  castellan: 50284408,
  seneschal: 86673403,
  bastion: 28904860,
  destrier: 55393975,
  chaosAngel: 22850702,
  legatia: 15982593,
  hyperion: 63101468,
  kusanagi: 31114334,
  assaultDragon: 73218989,
} as const

const A = ANGELECHY

/**
 * Angelechy (`executors/angelechy.ts`): la lista que salió segunda en el Dutch Open de Ede (2026-10-31, 188 jugadores), la Angelechy «pura» mejor ubicada de
 * `src/data/meta-decklists.json`: sin Elfnote, Branded, el Ritual ni Tenpai. Un Main de Mágicas y Trampas (sin monstruos, salvo las handtraps) y un Extra de Sincronías.
 */
export const ANGELECHY_DECK: BotDeckList = {
  id: 'angelechy',
  name: 'Angelechy',
  line: 'auto.rival.deck.angelechy',
  ready: true,
  main: [
    [A.fuwalos, 3],
    [A.ash, 3],
    [A.ogre, 3],
    [A.droll, 1],
    [A.problem, 3],
    [A.score, 3],
    [A.opposition, 3],
    [A.endgame, 1],
    [A.bifrost, 1],
    [A.desires, 1],
    [A.burial, 3],
    [A.terraforming, 1],
    [A.purge, 3],
    [A.impulse, 3],
    [A.spark, 2],
    [A.e4, 3],
    [A.disturbance, 1],
    [A.verdict, 2],
  ],
  extra: [
    [A.shatranga, 2],
    [A.enlisted, 2],
    [A.castellan, 1],
    [A.seneschal, 1],
    [A.bastion, 2],
    [A.destrier, 2],
    [A.chaosAngel, 1],
    [A.legatia, 1],
    [A.hyperion, 1],
    [A.kusanagi, 1],
    [A.assaultDragon, 1],
  ],
  testedWith: 'bc5d82d66842f3c62d20747c530b164ce98004f3',
}

/** Los passcodes del mazo de Elfnote que nombran las reglas (verificados contra el `.cdb` del núcleo, con su script). */
export const ELFNOTE = {
  lucina: 13597785,
  regina: 56651978,
  fortuna: 85976588,
  patron: 12375297,
  medius: 97556336,
  theoMedius: 90875418,
  infinity: 36270527,
  unification: 99753860,
  purification: 62368221,
  vidolium: 70488851,
  nervedo: 17473466,
  junoldo: 10266279,
  skull: 67750322,
  fuwalos: 42141493,
  ash: 14558127,
  ogre: 59438930,
  veiler: 97268402,
  theorealize: 48739627,
  pastLull: 36709484,
  citrinitas: 37279096,
  terminus: 25661743,
  treasure: 26237713,
  rhapsodia: 24092792,
  junePride: 5559570,
  strelitzia: 42302563,
  punisher: 60465049,
  riser: 68431965,
  zalen: 4891376,
  archethys: 87188910,
  pluto: 37706769,
  diabell: 14307929,
  n90: 8165596,
  lars: 35103106,
  diactorus: 27184601,
  purifier: 31822037,
  medicurius: 4063756,
  dharc: 8264361,
  knight: 29301450,
} as const

const E = ELFNOTE

/**
 * Elfnote (`executors/elfnote.ts`): la lista Ars Magna Elfnote que ganó el WCQ Regional de Santo Domingo (2026-10-25, 58 jugadores), la ganadora más reciente de la familia en
 * `src/data/meta-decklists.json` (las del mismo día en San Pedro Sula son Top 4). Es la Elfnote «pura»: sin Angelechy, Kewl Tune ni el Ritual de Luz y Oscuridad; el motor de
 * Power Patron (Medius, Vidolium, Junoldo) lo llevan todas las Elfnote del meta. Tiene 42 cartas en el Main, como se jugó.
 */
export const ELFNOTE_DECK: BotDeckList = {
  id: 'elfnote',
  name: 'Elfnote',
  line: 'auto.rival.deck.elfnote',
  ready: true,
  main: [
    [E.lucina, 3],
    [E.regina, 3],
    [E.fortuna, 1],
    [E.patron, 2],
    [E.medius, 2],
    [E.theoMedius, 1],
    [E.infinity, 2],
    [E.unification, 1],
    [E.purification, 1],
    [E.vidolium, 2],
    [E.nervedo, 1],
    [E.junoldo, 1],
    [E.skull, 2],
    [E.fuwalos, 3],
    [E.ash, 3],
    [E.ogre, 3],
    [E.veiler, 3],
    [E.theorealize, 1],
    [E.pastLull, 1],
    [E.citrinitas, 2],
    [E.terminus, 1],
    [E.treasure, 2],
    [E.rhapsodia, 1],
  ],
  extra: [
    [E.junePride, 1],
    [E.strelitzia, 1],
    [E.punisher, 1],
    [E.riser, 1],
    [E.zalen, 1],
    [E.archethys, 1],
    [E.pluto, 1],
    [E.diabell, 1],
    [E.n90, 1],
    [E.lars, 1],
    [E.diactorus, 1],
    [E.purifier, 1],
    [E.medicurius, 1],
    [E.dharc, 1],
    [E.knight, 1],
  ],
  testedWith: 'bc5d82d66842f3c62d20747c530b164ce98004f3',
}

/** Todos, en el orden en que se ofrecen. */
export const BOT_DECK_LISTS: readonly BotDeckList[] = [SKY_STRIKER_DECK, ANGELECHY_DECK, ELFNOTE_DECK]

/** La lista con ese `id` (para «Ver mazo»); `null` si no hay. */
export const botDeckList = (id: string | undefined): BotDeckList | null => BOT_DECK_LISTS.find((deck) => deck.id === id) ?? null
