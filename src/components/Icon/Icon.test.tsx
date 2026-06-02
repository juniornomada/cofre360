import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icon } from './Icon';
import { Home } from 'lucide-react';

describe('Icon component', () => {
  it('renders the icon with correct size', () => {
    render(<Icon icon={Home} size={30} data-testid="test-icon" />);
    const icon = screen.getByTestId('test-icon');
    expect(icon).toBeDefined();
    expect(icon.getAttribute('width')).toBe('30');
    expect(icon.getAttribute('height')).toBe('30');
  });

  it('applies custom className', () => {
    render(<Icon icon={Home} className="custom-class" data-testid="test-icon" />);
    const icon = screen.getByTestId('test-icon');
    expect(icon.classList.contains('custom-class')).toBe(true);
  });
});
