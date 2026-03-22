import { Toaster } from 'react-hot-toast'

export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      gutter={10}
      containerStyle={{
        bottom: 16,
        right: 16,
      }}
      toastOptions={{
        duration: 2200,
        style: {
          background: 'linear-gradient(180deg, rgb(var(--card-background-rgb) / 0.96), rgb(var(--background-rgb) / 0.98))',
          color: 'var(--text-main)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '0px',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 28px rgba(0,0,0,0.34), 0 0 0 1px rgba(0,0,0,0.14)',
          fontSize: '0.82rem',
          lineHeight: '1.2',
          padding: '12px 14px',
        },
        success: {
          style: {
            borderColor: 'rgb(var(--success-rgb) / 0.42)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 28px rgba(0,0,0,0.34), 0 0 0 1px rgb(var(--success-rgb) / 0.12)',
          },
          iconTheme: {
            primary: 'var(--accent)',
            secondary: 'var(--background)',
          },
        },
        error: {
          style: {
            borderColor: 'rgb(var(--danger-rgb) / 0.48)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.03), 0 12px 28px rgba(0,0,0,0.34), 0 0 0 1px rgb(var(--danger-rgb) / 0.12)',
          },
          iconTheme: {
            primary: 'var(--destructive)',
            secondary: 'var(--background)',
          },
        },
      }}
    />
  )
}
