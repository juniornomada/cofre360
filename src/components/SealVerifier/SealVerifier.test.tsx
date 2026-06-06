import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { createRootRoute, createRouter, RouterProvider, createRoute } from '@tanstack/react-router';
import SealVerifier from './SealVerifier';

describe('SealVerifier', () => {
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <SealVerifier />
        <div id="outlet" />
      </>
    ),
  });

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <div className="seal">selinho</div>,
  });

  const safeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/safe',
    component: () => <div>Safe route</div>,
  });

  const routeTree = rootRoute.addChildren([indexRoute, safeRoute]);
  const router = createRouter({ routeTree });

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('deve emitir aviso no console se um seletor de selo for encontrado', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    render(<RouterProvider router={router} />);
    
    // O MutationObserver e o useEffect podem levar um ciclo de microtask
    await vi.waitFor(() => {
      expect(consoleWarnSpy).toHaveBeenCalled();
    });
  });

  test('não deve emitir aviso em rotas sem selos', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    
    const routerSafe = createRouter({ routeTree, initialEntries: ['/safe'] });
    render(<RouterProvider router={routerSafe} />);
    
    // Aguarda um pouco para garantir que não houve chamada
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });
});
