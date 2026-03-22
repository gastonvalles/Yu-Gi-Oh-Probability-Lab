export function DeckModeNavigation() {
  return (
    <nav className="surface-panel mx-auto w-full max-w-[1240px] p-2 max-[760px]:sticky max-[760px]:top-0 max-[760px]:z-40 min-[761px]:hidden">
      <div className="grid grid-cols-4 gap-1">
        <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step1">
          Paso 1
        </a>
        <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step2">
          Paso 2
        </a>
        <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step3">
          Paso 3
        </a>
        <a className="app-button px-2 py-1 text-center text-[0.76rem]" href="#step4">
          Cierre
        </a>
      </div>
    </nav>
  )
}
