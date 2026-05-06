interface ConfirmDialogProps {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  confirmColor?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmColor = 'primary',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmButtonClass = confirmColor === 'danger'
    ? 'bg-red-500 hover:bg-red-600'
    : 'bg-gradient-to-b from-[#E0FF04] to-[#4FFFE3] text-neutral-800 hover:opacity-90'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />

      <div className="relative bg-[#3a3a3a] rounded-2xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
        <h3 className="text-white text-2xl font-bold font-ubuntu mb-4">{title}</h3>
        <p className="text-white/70 font-ubuntu mb-6 text-lg">{message}</p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-full bg-[#4a4a4a] text-white font-ubuntu font-bold hover:bg-[#555555] transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-6 py-3 rounded-full ${confirmButtonClass} font-ubuntu font-bold transition-all`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
