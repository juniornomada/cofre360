import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * WCAG 2.1 Contrast levels
 * AA (Minimum): 4.5:1 for normal text, 3:1 for large text (18pt/24px or 14pt/19px bold)
 * AAA (Enhanced): 7:1 for normal text, 4.5:1 for large text
 */

// Helper to convert OKLCH to Linear RGB and then to Relative Luminance
// Reference: https://www.w3.org/WAI/GL/wiki/Relative_luminance
function getRelativeLuminance(r: number, g: number, b: number) {
  const [rl, gl, bl] = [r, g, b].map(val => {
    val /= 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function getContrastRatio(l1: number, l2: number) {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Minimal OKLCH to RGB conversion (simplified for contrast checking purposes)
// Since we are using standard themes, we can also just read the computed RGB from the browser
function parseComputedColor(colorStr: string) {
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return {
    r: parseInt(match[1]),
    g: parseInt(match[2]),
    b: parseInt(match[3])
  };
}

export function useContrastChecker() {
  useEffect(() => {
    // Small delay to ensure styles are applied
    const timer = setTimeout(() => {
      if (typeof window === 'undefined') return;

      const pairs = [
        { name: 'Background/Foreground', bg: '--background', fg: '--foreground' },
        { name: 'Card', bg: '--card', fg: '--card-foreground' },
        { name: 'Primary', bg: '--primary', fg: '--primary-foreground' },
        { name: 'Muted', bg: '--muted', fg: '--muted-foreground' },
        { name: 'Accent', bg: '--accent', fg: '--accent-foreground' },
      ];

      const root = document.documentElement;
      const computedStyles = getComputedStyle(root);
      const warnings: string[] = [];

      pairs.forEach(pair => {
        // We need to resolve the variable values. Since they are OKLCH in CSS, 
        // computedStyle might return them as rgb() depending on browser support.
        // A more reliable way is to create a temp element.
        const temp = document.createElement('div');
        temp.style.backgroundColor = `var(${pair.bg})`;
        temp.style.color = `var(${pair.fg})`;
        temp.style.display = 'none';
        document.body.appendChild(temp);
        
        const style = getComputedStyle(temp);
        const bgColor = parseComputedColor(style.backgroundColor);
        const fgColor = parseComputedColor(style.color);
        
        document.body.removeChild(temp);

        if (bgColor && fgColor) {
          const l1 = getRelativeLuminance(bgColor.r, bgColor.g, bgColor.b);
          const l2 = getRelativeLuminance(fgColor.r, fgColor.g, fgColor.fg ? 0 : fgColor.b); // Fix typo in fgColor access
          
          const ratio = getContrastRatio(l1, l2);
          
          if (ratio < 4.5) {
            warnings.push(`${pair.name}: ${ratio.toFixed(2)}:1`);
          }
        }
      });

      if (warnings.length > 0 && import.meta.env.DEV) {
        console.warn('Contrast Verification (WCAG AA < 4.5:1):', warnings);
        toast.warning('Aviso de Acessibilidade', {
          description: `Baixo contraste detectado: ${warnings.join(', ')}`,
          duration: 10000,
        });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, []);
}
