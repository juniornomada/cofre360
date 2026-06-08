import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InvoiceInconsistencyAlertProps {
  hasInconsistency: boolean;
  onClose?: () => void;
}

export function InvoiceInconsistencyAlert({ hasInconsistency, onClose }: InvoiceInconsistencyAlertProps) {
  const [show, setShow] = useState(true); // Temporarily force show for testing across all pages

  useEffect(() => {
    if (hasInconsistency) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 8000); // 8 seconds for better visibility
      return () => clearTimeout(timer);
    }
  }, [hasInconsistency]);

  if (!show) return null;

  return (
    <div 
      className={cn(
        "fixed top-4 left-1/2 -translate-x-1/2 z-[1050] w-[calc(100%-2rem)] max-w-[600px]",
        "animate-in fade-in slide-in-from-top-4 duration-300"
      )}
      role="alert"
    >
      <div className="bg-[#fff3cd] border border-[#ffeeba] text-[#856404] px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 relative">
        <div className="bg-[#856404]/10 p-2 rounded-full">
          <AlertTriangle className="h-5 w-5 text-[#856404]" />
        </div>
        <div className="flex-1 pr-6">
          <p className="font-bold text-sm">Inconsistência detectada</p>
          <p className="text-xs opacity-90">Verifique a consistência dos valores da fatura. Por favor, recarregue a página.</p>
        </div>
        <button 
          onClick={() => {
            setShow(false);
            onClose?.();
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 hover:bg-black/5 rounded-full transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
