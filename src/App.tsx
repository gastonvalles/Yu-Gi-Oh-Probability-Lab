import { DeckModeScreen } from './components/deck-mode/DeckModeScreen'
import { Mascot } from './components/mascot/Mascot'
import { AppToaster } from './components/ui/AppToaster'

export default function App() {
  return (
    <main className="min-h-screen w-full bg-transparent p-0">
      <DeckModeScreen />
      <Mascot />
      <AppToaster />
    </main>
  )
}
