import { useCallback } from 'react'
import { toast } from 'react-hot-toast'

export type ToastTone = 'default' | 'success' | 'error'

export function useToastMessage(): {
  showToast: (message: string, tone?: ToastTone) => void
} {
  const showToast = useCallback((message: string, tone: ToastTone = 'default') => {
    if (tone === 'success') {
      toast.success(message)
      return
    }

    if (tone === 'error') {
      toast.error(message)
      return
    }

    toast(message)
  }, [])

  return {
    showToast,
  }
}
