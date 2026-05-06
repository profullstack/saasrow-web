import { useEffect } from 'react'

interface AlertProps {
  type: 'success' | 'error' | 'info' | 'warning'
  message: string
  onClose: () => void
  autoClose?: boolean
  duration?: number
}

export function Alert({ type, message, onClose, autoClose = true, duration = 5000 }: AlertProps) {
  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(onClose, duration)
      return () => clearTimeout(timer)
    }
  }, [autoClose, duration, onClose])

  const colors = {
    success: {
      bg: 'bg-[#1a4d45]',
      border: 'border-[#4FFFE3]',
      text: 'text-[#4FFFE3]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    error: {
      bg: 'bg-[#4d1a1a]',
      border: 'border-red-400',
      text: 'text-red-400',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ),
    },
    warning: {
      bg: 'bg-[#4d4d1a]',
      border: 'border-[#E0FF04]',
      text: 'text-[#E0FF04]',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
    info: {
      bg: 'bg-[#1a3a4d]',
      border: 'border-blue-400',
      text: 'text-blue-400',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  }

  const color = colors[type]

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
      <div className={`${color.bg} ${color.border} border-2 rounded-xl p-4 max-w-md shadow-xl`}>
        <div className="flex items-start gap-3">
          <div className={color.text}>{color.icon}</div>
          <div className="flex-1">
            <p className={`${color.text} font-ubuntu font-medium`}>{message}</p>
          </div>
          <button
            onClick={onClose}
            className={`${color.text} hover:opacity-70 transition-opacity`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
