// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatLine } from '../app/duel-games'
import { useChatSound } from '../app/use-chat-sound'

const { playChatSound } = vi.hoisted(() => ({ playChatSound: vi.fn() }))

vi.mock('../app/chat-sound', () => ({ playChatSound }))

const line = (id: number, from: ChatLine['from']): ChatLine => ({ id, from, text: `m${id}` })

beforeEach(() => {
  playChatSound.mockClear()
})

describe('un sonido por cada mensaje nuevo', () => {
  it('no suena lo que ya estaba escrito, y después suena uno por mensaje, distinto si es tuyo o del rival', () => {
    const { rerender } = renderHook(({ chat }) => useChatSound(chat, 0), { initialProps: { chat: [line(1, 0), line(2, 1)] as readonly ChatLine[] | undefined } })

    expect(playChatSound).not.toHaveBeenCalled()

    rerender({ chat: [line(1, 0), line(2, 1), line(3, 1)] })
    expect(playChatSound.mock.calls).toEqual([['theirs']])

    rerender({ chat: [line(1, 0), line(2, 1), line(3, 1), line(4, 0), line(5, 1)] })
    expect(playChatSound.mock.calls.slice(1)).toEqual([['mine'], ['theirs']])
  })

  it('no repite el sonido si el chat se vuelve a pintar igual, ni suena sin chat (quien mira)', () => {
    const chat = [line(1, 1)]
    const { rerender } = renderHook(({ lines }) => useChatSound(lines, 0), { initialProps: { lines: chat as readonly ChatLine[] | undefined } })

    rerender({ lines: [...chat] })
    rerender({ lines: undefined })
    rerender({ lines: [...chat] })

    expect(playChatSound).not.toHaveBeenCalled()
  })
})
