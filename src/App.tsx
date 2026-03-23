import { PlaceholderPanel } from './components/PlaceholderPanel'
import { DeckModeScreen } from './components/deck-mode/DeckModeScreen'
import { AppToaster } from './components/ui/AppToaster'
import { setMode } from './app/settings-slice'
import type { RootState } from './app/store'
import { useAppDispatch, useAppSelector } from './app/store-hooks'

export default function App() {
  const dispatch = useAppDispatch()
  const mode = useAppSelector((state: RootState) => state.settings.mode)

  return (
    <main className="mx-auto min-h-screen w-[min(1760px,100vw)] bg-transparent px-2 py-2 overflow-x-hidden">
      {mode === 'manual' ? (
        <PlaceholderPanel
          mode={mode}
          onModeChange={(nextMode) => {
            dispatch(setMode(nextMode))
          }}
          title="Calculadora Manual"
          description="Este modo va a usar parámetros totalmente manipulables y grupos manuales, sin depender del deck builder."
        />
      ) : null}

      {mode === 'gambling' ? (
        <PlaceholderPanel
          mode={mode}
          onModeChange={(nextMode) => {
            dispatch(setMode(nextMode))
          }}
          title="Calculadora Gambling"
          description="Este modo va aparte porque necesita reglas y resoluciones especiales que no salen directo del armado visual del deck."
        />
      ) : null}

      {mode === 'deck' ? <DeckModeScreen /> : null}
      <AppToaster />
    </main>
  )
}
