import { DeckModeScreen } from './components/deck-mode/DeckModeScreen'
import { AppToaster } from './components/ui/AppToaster'

export default function App() {
  return (
    <main className="min-h-screen w-full bg-transparent p-0">
      <DeckModeScreen />
      <AppToaster />
    </main>
  )
}
