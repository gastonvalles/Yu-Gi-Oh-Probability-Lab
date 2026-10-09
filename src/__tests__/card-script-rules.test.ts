import { describe, expect, it } from 'vitest'

import { CARD_RULE, cardRuleFlags, isHandtrapScript, readCardScript } from '../app/card-script-rules'

const script = (body: string, rest = '') => `--Carta\nlocal s,id=GetID()\nfunction s.initial_effect(c)\n${body}\nend\n${rest}`
const effect = (name: string, lines: string[]) => [`\tlocal ${name}=Effect.CreateEffect(c)`, ...lines.map((line) => `\t${name}:${line}`), `\tc:RegisterEffect(${name})`].join('\n')
const has = (flags: number, flag: keyof typeof CARD_RULE) => (flags & CARD_RULE[flag]) !== 0
const names = (flags: number) => (Object.keys(CARD_RULE) as Array<keyof typeof CARD_RULE>).filter((flag) => has(flags, flag))

describe('hand traps según los scripts de EDOPro', () => {
  it('un efecto rápido o disparador desde la mano es hand trap; uno de ignición, no', () => {
    const quick = script(effect('e1', ['SetType(EFFECT_TYPE_QUICK_O)', 'SetCode(EVENT_CHAINING)', 'SetRange(LOCATION_HAND|LOCATION_MZONE)']))
    const trigger = script(effect('e1', ['SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O)', 'SetRange(LOCATION_HAND)']))
    const ignition = script(effect('e2', ['SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_HAND)']))
    const field = script(effect('e2', ['SetType(EFFECT_TYPE_QUICK_O)', 'SetCode(EVENT_SPSUMMON)', 'SetRange(LOCATION_MZONE)']))

    expect(isHandtrapScript(quick)).toBe(true)
    expect(isHandtrapScript(trigger)).toBe(true)
    expect(isHandtrapScript(ignition)).toBe(false)
    expect(isHandtrapScript(field)).toBe(false)
  })

  it('una trampa activable desde la mano es hand trap', () => {
    const trap = script(
      `${effect('e1', ['SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_FREE_CHAIN)'])}\n${effect('e2', ['SetType(EFFECT_TYPE_SINGLE)', 'SetCode(EFFECT_TRAP_ACT_IN_HAND)'])}`,
    )
    const setTrap = script(effect('e1', ['SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_FREE_CHAIN)']))

    expect(isHandtrapScript(trap)).toBe(true)
    expect(isHandtrapScript(setTrap)).toBe(false)
  })

  it('un clon hereda el efecto y puede cambiar el rango; los comentarios no cuentan', () => {
    const cloned = script(
      `${effect('e1', ['SetType(EFFECT_TYPE_QUICK_O)', 'SetRange(LOCATION_MZONE)'])}\n\tlocal e2=e1:Clone()\n\te2:SetRange(LOCATION_HAND)\n\tc:RegisterEffect(e2)`,
    )
    const commented = script(effect('e1', ['SetType(EFFECT_TYPE_QUICK_O)', '--SetRange(LOCATION_HAND)']).replace('\te1:--SetRange', '\t--e1:SetRange'))

    expect(readCardScript(cloned).effects.map((entry) => entry.range)).toEqual(['LOCATION_MZONE', 'LOCATION_HAND'])
    expect(isHandtrapScript(cloned)).toBe(true)
    expect(isHandtrapScript(commented)).toBe(false)
  })

  it('sólo cuentan los efectos que initial_effect registra sobre la carta, no los de sus operaciones', () => {
    const tokenEffect = script(
      effect('e1', ['SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)']),
      `function s.operation(e,tp,eg,ep,ev,re,r,rp)\n${effect('e1', ['SetType(EFFECT_TYPE_QUICK_O)', 'SetRange(LOCATION_HAND)'])}\nend`,
    )
    const global = script('\tlocal ge1=Effect.CreateEffect(c)\n\tge1:SetType(EFFECT_TYPE_QUICK_O)\n\tge1:SetRange(LOCATION_HAND)\n\tDuel.RegisterEffect(ge1,0)')

    expect(isHandtrapScript(tokenEffect)).toBe(false)
    expect(isHandtrapScript(global)).toBe(false)
    expect(readCardScript('').effects).toEqual([])
  })
})

describe('qué puede hacer una carta según su script', () => {
  it('buscar, robar, reclutar del Deck e invocarse sola desde la mano', () => {
    const searcher = script(effect('e1', ['SetCategory(CATEGORY_TOHAND+CATEGORY_SEARCH)', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_HAND)']))
    const draw = script(effect('e1', ['SetCategory(CATEGORY_DRAW)', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_FREE_CHAIN)']))
    const recruiter = script(
      effect('e1', ['SetCategory(CATEGORY_SPECIAL_SUMMON)', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetTarget(s.sptg)']),
      'function s.sptg(e,tp,eg,ep,ev,re,r,rp,chk)\n\tif chk==0 then return Duel.IsExistingMatchingCard(s.spfilter,tp,LOCATION_DECK,0,1,nil,e,tp) end\nend',
    )
    const procedure = script(effect('e1', ['SetType(EFFECT_TYPE_FIELD)', 'SetCode(EFFECT_SPSUMMON_PROC)', 'SetRange(LOCATION_HAND)']))
    const fromHand = script(effect('e1', ['SetCategory(CATEGORY_SPECIAL_SUMMON)', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_HAND)']))

    expect(names(cardRuleFlags(searcher))).toEqual(['search', 'usesHand'])
    expect(names(cardRuleFlags(draw))).toEqual(['draw'])
    expect(names(cardRuleFlags(recruiter))).toEqual(['recruit', 'starts'])
    expect(names(cardRuleFlags(procedure))).toEqual(['selfFromHand', 'usesHand'])
    expect(names(cardRuleFlags(fromHand))).toEqual(['selfFromHand', 'usesHand'])
  })

  it('a quién le pega: sólo al rival, a cualquiera, o a nadie en el campo', () => {
    const raigeki = script(
      effect('e1', ['SetCategory(CATEGORY_DESTROY)', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_FREE_CHAIN)', 'SetTarget(s.target)']),
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)\n\tif chk==0 then return Duel.IsExistingMatchingCard(aux.TRUE,tp,0,LOCATION_MZONE,1,nil) end\nend',
    )
    const bookOfMoon = script(
      effect('e1', ['SetCategory(CATEGORY_POSITION)', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetTarget(s.target)']),
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)\n\tlocal g=Duel.SelectTarget(tp,Card.IsCanTurnSet,tp,LOCATION_MZONE,LOCATION_MZONE,1,1,nil)\nend',
    )
    const swapped = script(
      effect('e1', ['SetCategory(CATEGORY_REMOVE)', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetTarget(s.target)']),
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)\n\tlocal g=Duel.GetFieldGroup(1-tp,LOCATION_ONFIELD,0)\nend',
    )
    const ownGrave = script(
      effect('e1', ['SetCategory(CATEGORY_TOHAND)', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetTarget(s.target)']),
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk)\n\tif chk==0 then return Duel.IsExistingTarget(aux.TRUE,tp,LOCATION_GRAVE,0,1,nil) end\nend',
    )
    const negateTrap = script(effect('e1', ['SetCategory(CATEGORY_NEGATE+CATEGORY_DESTROY)', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetCode(EVENT_CHAINING)']))

    expect(names(cardRuleFlags(raigeki))).toEqual(['hitsOpponent'])
    expect(names(cardRuleFlags(bookOfMoon))).toEqual(['hitsEither'])
    expect(names(cardRuleFlags(swapped))).toEqual(['hitsOpponent'])
    expect(names(cardRuleFlags(ownGrave))).toEqual(['recovery'])
    expect(names(cardRuleFlags(negateTrap))).toEqual(['negate'])
  })

  it('un efecto rápido desde el campo que niega es interacción; un continuo que restringe al rival es floodgate', () => {
    const boss = script(effect('e1', ['SetCategory(CATEGORY_NEGATE)', 'SetType(EFFECT_TYPE_QUICK_O)', 'SetCode(EVENT_CHAINING)', 'SetRange(LOCATION_MZONE)']))
    const skillDrain = script(effect('e2', ['SetType(EFFECT_TYPE_FIELD)', 'SetRange(LOCATION_SZONE)', 'SetTargetRange(LOCATION_MZONE,LOCATION_MZONE)', 'SetCode(EFFECT_DISABLE)']))
    const bothPlayers = script(`${effect('e3', ['SetType(EFFECT_TYPE_FIELD)', 'SetRange(LOCATION_SZONE)', 'SetCode(EFFECT_CANNOT_SUMMON)', 'SetTargetRange(1,1)'])}\n\tlocal e4=e3:Clone()\n\te4:SetCode(EFFECT_CANNOT_SPECIAL_SUMMON)\n\tc:RegisterEffect(e4)`)
    const selfOnly = script(effect('e1', ['SetType(EFFECT_TYPE_FIELD)', 'SetCode(EFFECT_CANNOT_DRAW)', 'SetTargetRange(1,0)']))

    expect(names(cardRuleFlags(boss))).toEqual(['negate', 'quickFromField'])
    expect(names(cardRuleFlags(skillDrain))).toEqual(['floodgate'])
    expect(names(cardRuleFlags(bothPlayers))).toEqual(['floodgate'])
    expect(names(cardRuleFlags(selfOnly))).toEqual([])
  })

  it('empieza la jugada: al invocarse busca, desde el campo recluta, o una magia fusiona o invoca del Deck', () => {
    const onSummon = script(
      effect('e1', ['SetCategory(CATEGORY_SEARCH+CATEGORY_TOHAND)', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_SUMMON_SUCCESS)', 'SetTarget(s.thtg)']),
      'function s.thtg(e,tp,eg,ep,ev,re,r,rp,chk)\n\tif chk==0 then return Duel.IsExistingMatchingCard(s.thfilter,tp,LOCATION_DECK,0,1,nil) end\nend',
    )
    const fieldRecruit = script(
      effect('e1', ['SetCategory(CATEGORY_SPECIAL_SUMMON)', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_MZONE)', 'SetTarget(s.sptg)']),
      'function s.sptg(e,tp,eg,ep,ev,re,r,rp,chk)\n\tif chk==0 then return Duel.IsExistingMatchingCard(s.spfilter,tp,LOCATION_DECK,0,1,nil,e,tp) end\nend',
    )
    const fusionSpell = script('\tlocal e1=Fusion.CreateSummonEff({handler=c,fusfilter=s.ffilter})\n\te1:SetCountLimit(1,id)\n\tc:RegisterEffect(e1)')
    const onDestroy = script(
      effect('e1', ['SetCategory(CATEGORY_SEARCH+CATEGORY_TOHAND)', 'SetType(EFFECT_TYPE_SINGLE+EFFECT_TYPE_TRIGGER_O)', 'SetCode(EVENT_DESTROYED)', 'SetTarget(s.thtg)']),
      'function s.thtg(e,tp,eg,ep,ev,re,r,rp,chk)\n\tif chk==0 then return Duel.IsExistingMatchingCard(s.thfilter,tp,LOCATION_DECK,0,1,nil) end\nend',
    )

    expect(names(cardRuleFlags(onSummon))).toEqual(['search', 'starts'])
    expect(names(cardRuleFlags(fieldRecruit))).toEqual(['recruit', 'starts'])
    expect(names(cardRuleFlags(fusionSpell))).toEqual(['starts'])
    expect(names(cardRuleFlags(onDestroy))).toEqual(['search'])
  })

  it('recupera del cementerio: una carta propia, o ella misma; y usar la mano se nota', () => {
    const reborn = script(
      effect('e1', ['SetCategory(CATEGORY_SPECIAL_SUMMON)', 'SetType(EFFECT_TYPE_ACTIVATE)', 'SetTarget(s.target)']),
      'function s.target(e,tp,eg,ep,ev,re,r,rp,chk,chkc)\n\tif chk==0 then return Duel.IsExistingTarget(s.filter,tp,LOCATION_GRAVE,LOCATION_GRAVE,1,nil,e,tp) end\nend',
    )
    const selfRevive = script(effect('e3', ['SetCategory(CATEGORY_SPECIAL_SUMMON)', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_GRAVE)']))
    const handSearch = script(effect('e1', ['SetCategory(CATEGORY_TOHAND+CATEGORY_SEARCH)', 'SetType(EFFECT_TYPE_IGNITION)', 'SetRange(LOCATION_HAND)']))

    expect(names(cardRuleFlags(reborn))).toEqual(['recovery'])
    expect(names(cardRuleFlags(selfRevive))).toEqual(['recovery'])
    expect(names(cardRuleFlags(handSearch))).toEqual(['search', 'usesHand'])
    expect(readCardScript(script('', 's.listed_names={CARD_ALBAZ,id,12345678}')).listedNames).toEqual(['CARD_ALBAZ', '12345678'])
  })

  it('se invoca al campo del rival, por procedimiento de utilidad o en la operación; y menciona arquetipos', () => {
    const kaiju = script('\tlocal e1,e2=aux.AddKaijuProcedure(c)', 's.listed_series={SET_KAIJU}')
    const lava = script(
      effect('e1', ['SetType(EFFECT_TYPE_FIELD)', 'SetCode(EFFECT_SPSUMMON_PROC)', 'SetRange(LOCATION_HAND)', 'SetOperation(s.spop)']),
      'function s.spop(e,tp,eg,ep,ev,re,r,rp,c)\n\tDuel.SpecialSummon(c,0,tp,1-tp,false,false,POS_FACEUP_DEFENSE)\nend\ns.listed_names={id}',
    )

    expect(names(cardRuleFlags(kaiju))).toEqual(['givesToOpponent', 'mentions'])
    expect(names(cardRuleFlags(lava))).toEqual(['selfFromHand', 'givesToOpponent', 'usesHand'])
  })
})
