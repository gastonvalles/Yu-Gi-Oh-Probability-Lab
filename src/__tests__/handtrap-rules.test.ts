import { describe, expect, it } from 'vitest'

import { isHandtrapScript, readCardEffects } from '../app/handtrap-rules'

const script = (body: string, rest = '') => `--Carta\nlocal s,id=GetID()\nfunction s.initial_effect(c)\n${body}\nend\n${rest}`

describe('hand traps según los scripts de EDOPro', () => {
  it('un efecto rápido o disparador desde la mano es hand trap; uno de ignición, no', () => {
    const quick = script('\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_QUICK_O)\n\te1:SetCode(EVENT_CHAINING)\n\te1:SetRange(LOCATION_HAND|LOCATION_MZONE)\n\tc:RegisterEffect(e1)')
    const trigger = script('\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_FIELD+EFFECT_TYPE_TRIGGER_O)\n\te1:SetRange(LOCATION_HAND)\n\tc:RegisterEffect(e1)')
    const ignition = script('\tlocal e2=Effect.CreateEffect(c)\n\te2:SetType(EFFECT_TYPE_IGNITION)\n\te2:SetRange(LOCATION_HAND)\n\tc:RegisterEffect(e2)')
    const field = script('\tlocal e2=Effect.CreateEffect(c)\n\te2:SetType(EFFECT_TYPE_QUICK_O)\n\te2:SetCode(EVENT_SPSUMMON)\n\te2:SetRange(LOCATION_MZONE)\n\tc:RegisterEffect(e2)')

    expect(isHandtrapScript(quick)).toBe(true)
    expect(isHandtrapScript(trigger)).toBe(true)
    expect(isHandtrapScript(ignition)).toBe(false)
    expect(isHandtrapScript(field)).toBe(false)
  })

  it('una trampa activable desde la mano es hand trap', () => {
    const trap = script(
      '\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_ACTIVATE)\n\te1:SetCode(EVENT_FREE_CHAIN)\n\tc:RegisterEffect(e1)\n\tlocal e2=Effect.CreateEffect(c)\n\te2:SetType(EFFECT_TYPE_SINGLE)\n\te2:SetCode(EFFECT_TRAP_ACT_IN_HAND)\n\tc:RegisterEffect(e2)',
    )
    const setTrap = script('\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_ACTIVATE)\n\te1:SetCode(EVENT_FREE_CHAIN)\n\tc:RegisterEffect(e1)')

    expect(isHandtrapScript(trap)).toBe(true)
    expect(isHandtrapScript(setTrap)).toBe(false)
  })

  it('un clon hereda el efecto y puede cambiar el rango; los comentarios no cuentan', () => {
    const cloned = script(
      '\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_QUICK_O)\n\te1:SetRange(LOCATION_MZONE)\n\tc:RegisterEffect(e1)\n\tlocal e2=e1:Clone()\n\te2:SetRange(LOCATION_HAND)\n\tc:RegisterEffect(e2)',
    )
    const commented = script('\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_QUICK_O)\n\t--e1:SetRange(LOCATION_HAND)\n\tc:RegisterEffect(e1)')

    expect(readCardEffects(cloned)).toEqual([
      { type: 'EFFECT_TYPE_QUICK_O', range: 'LOCATION_MZONE', code: '' },
      { type: 'EFFECT_TYPE_QUICK_O', range: 'LOCATION_HAND', code: '' },
    ])
    expect(isHandtrapScript(cloned)).toBe(true)
    expect(isHandtrapScript(commented)).toBe(false)
  })

  it('sólo cuentan los efectos que initial_effect registra sobre la carta, no los de sus operaciones', () => {
    const tokenEffect = script(
      '\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_IGNITION)\n\te1:SetRange(LOCATION_MZONE)\n\tc:RegisterEffect(e1)',
      'function s.operation(e,tp,eg,ep,ev,re,r,rp)\n\tlocal e1=Effect.CreateEffect(c)\n\te1:SetType(EFFECT_TYPE_QUICK_O)\n\te1:SetRange(LOCATION_HAND)\n\tc:RegisterEffect(e1)\nend',
    )
    const global = script('\tlocal ge1=Effect.CreateEffect(c)\n\tge1:SetType(EFFECT_TYPE_QUICK_O)\n\tge1:SetRange(LOCATION_HAND)\n\tDuel.RegisterEffect(ge1,0)')

    expect(isHandtrapScript(tokenEffect)).toBe(false)
    expect(isHandtrapScript(global)).toBe(false)
    expect(readCardEffects('')).toEqual([])
  })
})
