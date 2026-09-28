import { useState, type ReactNode } from 'react'

interface SearchFilterSectionProps {
  title: string
  summary: string
  defaultOpen: boolean
  children: ReactNode
}

export function SearchFilterSection({ title, summary, defaultOpen, children }: SearchFilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <details
      className="details-toggle surface-panel-soft self-start grid min-w-0 gap-1 border border-(--border-subtle) p-1.5"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex min-h-10 cursor-pointer items-center justify-between gap-2 border border-(--border-subtle) bg-[linear-gradient(180deg,rgb(var(--secondary-rgb)/0.96),rgb(var(--background-rgb)/0.98))] px-2 py-1.5 transition-colors duration-150 hover:border-[rgb(var(--primary-rgb)/0.34)]">
        <span className="min-w-0 grid gap-[0.1rem]">
          <strong className="text-[0.78rem] text-(--text-main)">{title}</strong>
          <span className="truncate text-[0.68rem] leading-[1.14] text-(--text-muted)">{summary}</span>
        </span>
        <span className="details-arrow grid h-5 w-5 shrink-0 place-items-center border border-[rgb(var(--primary-rgb)/0.3)] bg-[linear-gradient(180deg,rgb(var(--primary-rgb)/0.16),rgb(var(--secondary-rgb)/0.96))] text-[0.68rem] text-(--text-soft)">
          ▶
        </span>
      </summary>
      <div className="grid min-w-0 gap-1.5 pt-0.5">{children}</div>
    </details>
  )
}
