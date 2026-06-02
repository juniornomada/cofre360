import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { BottomNavBar } from './BottomNavBar';
import React from 'react';

// Mock TanStack Router hooks
vi.mock('@tanstack/react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
  useRouterState: (options: any) => {
    const state = { status: 'idle', location: { pathname: '/' } };
    return options?.select ? options.select(state) : state;
  },
}));

// Mock SmartLink component
vi.mock('../SmartLink', () => ({
  SmartLink: ({ children, className, ...props }: any) => (
    <a className={className} {...props}>
      {children}
    </a>
  ),
}));

describe('BottomNavBar Accessibility', () => {
  const renderWithTheme = (theme: 'light' | 'dark', iconSize = 24) => {
    return render(
      <div className={theme}>
        <BottomNavBar iconSize={iconSize} />
      </div>
    );
  };

  const scenarios = [
    { size: 30, theme: 'light' as const, description: '30px light' },
    { size: 30, theme: 'dark' as const, description: '30px dark' },
    { size: 45, theme: 'light' as const, description: '45px light' },
    { size: 45, theme: 'dark' as const, description: '45px dark' },
    { size: 60, theme: 'light' as const, description: '60px light' },
    { size: 60, theme: 'dark' as const, description: '60px dark' },
  ];

  it.each(scenarios)('should have sufficient contrast for $description (WC-001 to WC-006)', async ({ size, theme }) => {
    const { container } = renderWithTheme(theme, size);
    
    // Check if at least one icon link has the correct data-size
    const firstIcon = screen.getByTestId('nav-link-início');
    const iconSvg = firstIcon.querySelector('svg');
    expect(iconSvg).toHaveAttribute('data-size', String(size));

    // Run accessibility tests
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('focus outline is visible and meets focus standards (FE-001 to FE-003)', () => {
    renderWithTheme('light');
    const firstLink = screen.getAllByTestId('nav-link')[0];
    
    // Simulate focus
    firstLink.focus();
    
    // Check for focus styles (defined in className)
    expect(firstLink.className).toContain('focus-visible:ring-[#2684FF]');
    expect(firstLink.className).toContain('focus-visible:ring-2');
  });

  it('has correct ARIA attributes', () => {
    renderWithTheme('light');
    const links = screen.getAllByTestId('nav-link');
    
    expect(links[0]).toHaveAttribute('aria-current', 'page');
    expect(links[0]).toHaveAttribute('aria-label', 'Início');
    
    links.slice(1).forEach(link => {
      expect(link).not.toHaveAttribute('aria-current');
    });
  });
});
