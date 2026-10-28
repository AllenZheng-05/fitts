import { useToasts } from '../../state/toasts';

/** Bottom-center confirmations, 4s each (SPEC §5.4). Mount once at the app root. */
export function ToastHost() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex flex-col items-center gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-in rounded-control border-[1.5px] border-ink bg-ink px-4 py-2.5 text-[14px] font-semibold text-card shadow-button motion-reduce:animate-none"
        >
          {toast.text}
        </div>
      ))}
    </div>
  );
}
