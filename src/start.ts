import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { attachSupabaseAuth } from '@/integrations/supabase/auth-attacher';
import { seedPreviewTestExpense } from '@/lib/dev-seed-test-expense';

function createCspNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

const securityHeadersMiddleware = createMiddleware().server(({ next }) => {
  const cspNonce = createCspNonce();
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'nonce-${cspNonce}' 'strict-dynamic' 'self'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://bllqvpnjfpcvujrbrbig.supabase.co wss://bllqvpnjfpcvujrbrbig.supabase.co",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "manifest-src 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  setResponseHeader('Content-Security-Policy', csp);

  return next({
    context: {
      cspNonce,
    },
  });
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === 'serverFn',
});

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
  requestMiddleware: [securityHeadersMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));
