import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AITestHistory } from './AITestHistory';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock Supabase
import { vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      }))
    }))
  }
}));

const queryClient = new QueryClient();

describe('AITestHistory Component', () => {
  it('deve renderizar o título corretamente', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AITestHistory />
      </QueryClientProvider>
    );
    expect(screen.getByText(/Insights AI: Acurácia e Consistência/i)).toBeDefined();
  });

  it('deve mostrar o botão de rodar agora', () => {
    render(
      <QueryClientProvider client={queryClient}>
        <AITestHistory />
      </QueryClientProvider>
    );
    expect(screen.getByText(/Rodar agora/i)).toBeDefined();
  });
});
