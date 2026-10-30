/**
 * El mazo del ejecutor de Sky Striker (`executors/sky-striker.ts`): la lista que ganó el WCQ Regional de Pittsboro (2026-09-13, 189 jugadores), la ganadora más reciente de la
 * familia en `src/data/meta-decks.json` (la de Buenos Aires, 2026-09-26, es R.B. con un solo Sky Striker). Es FIJA: las reglas del ejecutor nombran sus cartas, así que no cambia con
 * el meta. `testedWith`: el commit de CardScripts (`auto-data.lock.json`) con el que pasó su goldfish (`auto-bot-sky.slow.test.ts`).
 */
export interface BotDeckList {
  id: string
  name: string
  main: readonly (readonly [number, number])[]
  extra: readonly (readonly [number, number])[]
  testedWith: string
}

/** Los passcodes del mazo que nombran las reglas (verificados contra el `.cdb` del núcleo). */
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

export const SKY_STRIKER_DECK: BotDeckList = {
  id: 'sky-striker',
  name: 'Sky Striker',
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
