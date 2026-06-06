import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import SealVerifier from './SealVerifier';

// Mock do TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useLocation: vi.fn(() => ({ pathname: '/test' }))
}));

describe('SealVerifier', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('deve emitir aviso no console se um seletor de selo for encontrado', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Simula a presença de um selo antes da renderização
    const div = document.createElement('div');
    div.className = 'seal';
    div.innerText = 'selinho';
    document.body.appendChild(div);

    render(<SealVerifier />);
    
    // O useEffect roda após o render
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  test('não deve emitir aviso se nenhum selo for encontrado', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    render(<SealVerifier />);
    
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  test('deve detectar selos adicionados dinamicamente via MutationObserver', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    render(<SealVerifier />);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    // Adiciona dinamicamente
    const badge = document.createElement('div');
    badge.id = 'lovable-badge';
    document.body.appendChild(badge);

    // Aguarda o MutationObserver disparar
    await vi.waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });
});
