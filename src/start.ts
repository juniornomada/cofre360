import { createStart } from '@tanstack/react-start';
import { attachSupabaseAuth } from '@/integrations/supabase/auth-attacher';
import { seedPreviewTestExpense } from '@/lib/dev-seed-test-expense';

// Parcelamento deve ser uma escolha explícita para cada nova transação.
// A versão anterior persistia enabled/count/mode no localStorage e podia fazer
// uma compra nova herdar, por exemplo, 6x da compra anterior.
if (typeof window !== 'undefined') {
  const key = 'quickadd:card-installment-prefs:v1';
  try {
    window.localStorage.removeItem(key);
    const storage = window.localStorage;
    const originalSetItem = storage.setItem.bind(storage);
    storage.setItem = (name: string, value: string) => {
      if (name === key) return;
      originalSetItem(name, value);
    };
  } catch {
    // Navegadores com storage bloqueado continuam funcionando normalmente.
  }
}

// Preview/dev only: creates at most one clearly marked test expense per day.
void seedPreviewTestExpense();

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));