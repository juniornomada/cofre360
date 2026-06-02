import { render, screen } from '@testing-library/react';
import { BottomNav } from './BottomNav';
import { describe, it, expect, vi } from 'vitest';

// Mock TanStack Router hooks
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
  useRouterState: () => ({ status: 'idle', location: { pathname: '/' } }),
}));

// Mock SmartLink component
vi.mock('./SmartLink', () => ({
  SmartLink: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

describe('BottomNav', () => {
  it('renders correctly with 5 navigation items', () => {
    render(<BottomNav />);
    
    const nav = screen.getByTestId('bottom-nav');
    expect(nav).toBeDefined();
    
    const icons = screen.getAllByTestId('nav-icon');
    expect(icons).toHaveLength(5);
  });

  it('has profile icon on the right', () => {
    render(<BottomNav />);
    const icons = screen.getAllByTestId('nav-icon');
    const lastIcon = icons[icons.length - 1];
    expect(lastIcon.getAttribute('aria-label')).toBe('Perfil');
  });

  it('marks current page as active', () => {
    render(<BottomNav />);
    const activeLink = screen.getByRole('link', { current: 'page' });
    expect(activeLink).toBeDefined();
    expect(activeLink.getAttribute('aria-label')).toBe('Início');
  });
});
