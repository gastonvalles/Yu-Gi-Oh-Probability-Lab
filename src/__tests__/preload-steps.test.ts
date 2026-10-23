import { preloadOneByOne } from '../components/deck-mode/lazy-steps'

// Las pantallas que se precargan de fondo bajan de a una: todas juntas le sacaban la red, en el celular, a lo que la pantalla muestra.
describe('preloadOneByOne', () => {
  it('nunca tiene dos cargas a la vez, sigue aunque una falle y termina todas', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const done: number[] = []
    const loads = [0, 1, 2, 3].map((index) => async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      done.push(index)

      if (index === 1) throw new Error('sin red')
    })

    preloadOneByOne(loads, (callback) => setTimeout(callback, 0))
    await vi.waitFor(() => expect(done).toEqual([0, 1, 2, 3]))
    expect(maxInFlight).toBe(1)
  })
})
