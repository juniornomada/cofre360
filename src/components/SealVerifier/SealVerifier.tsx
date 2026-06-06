import React, { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';

const SEAL_SELECTORS = [
  'a[href*="lovable.dev"]',
  'iframe[src*="lovable.dev"]',
  'div[style*="Edit with Lovable"]',
  '.lovable-badge',
  '#lovable-badge',
  '.seal',            // Selector genérico solicitado originalmente
  '.seal__logo',      // Elemento de logo no selo
  '#seal-banner',     // ID de um banner de selo
];

/**
 * SealVerifier Component
 * 
 * Garante que nenhum elemento relacionado ao selo (badge) esteja visível ou ativo.
 * Monitora mudanças de rota e mutações no DOM para agir proativamente.
 */
const SealVerifier: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const checkForSeals = () => {
      const erroneousElements = SEAL_SELECTORS
        .map((sel) => Array.from(document.querySelectorAll(sel)))
        .flat()
        .filter((el): el is HTMLElement => el !== null);

      if (erroneousElements.length) {
        // Filtra elementos que não estão "escondidos" pelo CSS (se por acaso o CSS falhar)
        const visibleElements = erroneousElements.filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
        });

        if (visibleElements.length) {
          console.warn(
            `[SealVerifier] ${visibleElements.length} elemento(s) de selo ativo(s) encontrado(s) em ${location.pathname}:`,
            visibleElements
          );

          visibleElements.forEach((el) => {
            // Desativar interatividade e garantir ocultação forçada via JS
            el.style.setProperty('display', 'none', 'important');
            el.style.setProperty('opacity', '0', 'important');
            el.style.setProperty('pointer-events', 'none', 'important');
            
            const stopPropagation = (e: Event) => {
              e.preventDefault();
              e.stopPropagation();
            };
            el.addEventListener('click', stopPropagation, true);
            el.addEventListener('mousedown', stopPropagation, true);
          });
        }
      }
    };

    // Verifica imediatamente na montagem e em mudanças de rota
    checkForSeals();

    // Observador de mutação para capturar elementos injetados dinamicamente
    const observer = new MutationObserver(() => checkForSeals());

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => observer.disconnect();
  }, [location.pathname]);

  return null;
};

export default SealVerifier;
