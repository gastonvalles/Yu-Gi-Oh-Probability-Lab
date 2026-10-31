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

/** Los passcodes del mazo de Despia Branded que nombran las reglas (verificados contra el `.cdb` del núcleo, con su script). */
export const BRANDED = {
  aluber: 62962630,
  albion: 25451383,
  whiteDragon: 73819701,
  albaz: 68468459,
  cartesia: 95515789,
  quem: 45883110,
  incredible: 55273560,
  dogmatika: 60303688,
  kitt: 19304410,
  mercourier: 19096726,
  cocatorium: 94395649,
  saronir: 60242223,
  fuwalos: 42141493,
  ash: 14558127,
  ogre: 59438930,
  droll: 94145021,
  fusion: 44362883,
  spirits: 29948294,
  opening: 36637374,
  nadir: 1984618,
  virtuous: 30271097,
  superPoly: 48130397,
  sarcophagus: 75500286,
  retribution: 17751597,
  champions: 74405783,
  darkDragon: 78397661,
  mirrorjade: 44146295,
  lubellion: 70534340,
  granguignol: 24915933,
  titaniklad: 41373230,
  rindbrumm: 51409648,
  dogma: 76666602,
  quaeritis: 72272462,
  mixousia: 80843006,
  wingman: 87758525,
  aeon: 33166263,
  secreterion: 89851827,
} as const

const B = BRANDED

/**
 * Despia Branded (`executors/branded.ts`): la lista que salió segunda en el WCQ Regional de Richmond (2026-10-24, 123 jugadores), la mejor ubicada de las Despia Branded «puras»
 * (sin el Ritual de Luz y Oscuridad) más recientes de `src/data/meta-decklists.json`; las del 2026-10-25 son Top 8 y la ganadora de Río (2026-09-27) lleva el Ritual. Tiene 41
 * cartas en el Main, como se jugó.
 */
export const BRANDED_DECK: BotDeckList = {
  id: 'branded',
  name: 'Despia Branded',
  line: 'auto.rival.deck.branded',
  ready: true,
  main: [
    [B.aluber, 3],
    [B.albion, 1],
    [B.whiteDragon, 2],
    [B.albaz, 1],
    [B.cartesia, 2],
    [B.quem, 1],
    [B.incredible, 2],
    [B.dogmatika, 1],
    [B.kitt, 1],
    [B.mercourier, 1],
    [B.cocatorium, 1],
    [B.saronir, 1],
    [B.fuwalos, 3],
    [B.ash, 3],
    [B.ogre, 3],
    [B.droll, 1],
    [B.fusion, 1],
    [B.spirits, 1],
    [B.opening, 1],
    [B.nadir, 3],
    [B.virtuous, 3],
    [B.superPoly, 3],
    [B.sarcophagus, 1],
    [B.retribution, 1],
  ],
  extra: [
    [B.champions, 1],
    [B.darkDragon, 1],
    [B.mirrorjade, 1],
    [B.lubellion, 1],
    [B.granguignol, 2],
    [B.titaniklad, 1],
    [B.rindbrumm, 1],
    [B.dogma, 2],
    [B.quaeritis, 1],
    [B.mixousia, 1],
    [B.wingman, 1],
    [B.aeon, 1],
    [B.secreterion, 1],
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
export const BOT_DECK_LISTS: readonly BotDeckList[] = [SKY_STRIKER_DECK, BRANDED_DECK, ELFNOTE_DECK]

/** La lista con ese `id` (para «Ver mazo»); `null` si no hay. */
export const botDeckList = (id: string | undefined): BotDeckList | null => BOT_DECK_LISTS.find((deck) => deck.id === id) ?? null
