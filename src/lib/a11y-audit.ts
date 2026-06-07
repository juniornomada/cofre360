/**
 * Auditoria de Acessibilidade em Tempo de Execução (Modo Dev)
 * Esta rotina verifica problemas comuns de acessibilidade no DOM.
 */
export function runA11yAudit() {
  if (process.env.NODE_ENV !== 'development') return;

  console.group('🚀 Cofre 360: A11y Audit');
  
  // 1. Checar botões sem label ou texto
  const buttons = document.querySelectorAll('button');
  buttons.forEach((btn, i) => {
    if (!btn.innerText.trim() && !btn.getAttribute('aria-label') && !btn.getAttribute('title')) {
      console.warn(`⚠️ Botão [${i}] sem descrição acessível:`, btn);
    }
  });

  // 2. Checar inputs sem label associada
  const inputs = document.querySelectorAll('input, select, textarea');
  inputs.forEach((input, i) => {
    const id = input.getAttribute('id');
    const label = id ? document.querySelector(`label[for="${id}"]`) : null;
    if (!label && !input.getAttribute('aria-label') && input.getAttribute('type') !== 'hidden') {
      console.warn(`⚠️ Campo [${i}] sem label associada:`, input);
    }
  });

  // 3. Checar imagens sem alt
  const images = document.querySelectorAll('img');
  images.forEach((img, i) => {
    if (!img.getAttribute('alt')) {
      console.warn(`⚠️ Imagem [${i}] sem atributo 'alt':`, img);
    }
  });

  // 4. Checar ordem de cabeçalhos (H1, H2, etc)
  const headers = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  let lastLevel = 0;
  headers.forEach((h) => {
    const level = parseInt(h.tagName[1]);
    if (level > lastLevel + 1 && lastLevel !== 0) {
      console.warn(`⚠️ Salto na hierarquia de cabeçalhos: ${h.tagName} após H${lastLevel}`, h);
    }
    lastLevel = level;
  });

  console.groupEnd();
}
