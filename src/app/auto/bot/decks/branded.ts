import type { BotDeckList } from './sky-striker'

/**
 * El mazo del ejecutor de Branded (`executors/branded.ts`): la lista Despia Branded que salió segunda en el WCQ Regional de Richmond (2026-10-24, 123 jugadores), la mejor ubicada
 * de las Despia Branded «puras» (sin el Ritual de Luz y Oscuridad) más recientes de `src/data/meta-decklists.json`; las del 2026-10-25 son Top 8 y la ganadora de Río (2026-09-27)
 * lleva el Ritual. Tiene 41 cartas en el Main, como se jugó. Es FIJA: las reglas del ejecutor nombran sus cartas. `testedWith`: el commit de CardScripts (`auto-data.lock.json`) con
 * el que pasó su goldfish (`auto-bot-branded.slow.test.ts`).
 */

/** Los passcodes del mazo que nombran las reglas (verificados contra el `.cdb` del núcleo, con su script). */
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

export const BRANDED_DECK: BotDeckList = {
  id: 'branded',
  name: 'Despia Branded',
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
