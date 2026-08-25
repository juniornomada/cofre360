import { createStart } from '@tanstack/react-start';
import { attachSupabaseAuth } from '@/integrations/supabase/auth-attacher';
import { seedPreviewTestExpense } from '@/lib/dev-seed-test-expense';

// Preview/dev only: creates at most one clearly marked test expense per day.
void seedPreviewTestExpense();

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
}));
