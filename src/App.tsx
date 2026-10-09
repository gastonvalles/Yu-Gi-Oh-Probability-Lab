import { useEffect } from 'react'

import { loadCardRules } from './app/card-rules'
import { DeckModeScreen } from './components/deck-mode/DeckModeScreen'
import { Mascot } from './components/mascot/Mascot'
import { AppToaster } from './components/ui/AppToaster'

export default function App() {
  // Las reglas de las cartas se bajan de fondo: el clasificador las usa en cuanto están.
  useEffect(() => {
    void loadCardRules()
  }, [])

  return (
    <main className="min-h-screen w-full bg-transparent p-0">
      <DeckModeScreen />
      <Mascot />
      <AppToaster />
    </main>
  )
}
