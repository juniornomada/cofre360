# Cofre 360 - Dashboard Financeiro Inteligente

Este projeto é um dashboard financeiro inteligente que permite importar faturas de cartão, gerenciar orçamentos e visualizar métricas financeiras.

## 🛡️ Ocultação de Selo (Seal Hiding)

Para garantir uma interface limpa e focada, implementamos um sistema de ocultação automática de selos e badges de terceiros (como o badge do Lovable).

### Como funciona:
- **CSS Global**: Regras em `src/styles.css` garantem que seletores específicos sejam ocultados com `!important`.
- **SealVerifier Component**: Um componente React que monitora o DOM e mudanças de rota para ocultar proativamente qualquer elemento que corresponda aos seletores definidos.

### Testes E2E (End-to-End)
Utilizamos Playwright para garantir que o selo permaneça oculto em todos os ambientes.

#### Executando localmente:
```bash
# Instalar navegadores do Playwright
bunx playwright install chromium

# Executar teste de ocultação de selo
bunx playwright test e2e/seal-hidden.spec.ts
```

### CI/CD Pipeline
O pipeline do GitHub Actions (`.github/workflows/e2e-seal.yml`) executa automaticamente os testes de E2E em cada Pull Request para os ambientes de:
1. **Development**: Simula o comportamento no ambiente de desenvolvimento.
2. **Production**: Verifica o comportamento no build de produção.

## 🚀 Desenvolvimento

```bash
# Instalar dependências
bun install

# Iniciar servidor de desenvolvimento
bun run dev

# Gerar build de produção
bun run build
```

## 🧪 Estrutura de Testes
- `src/components/SealVerifier/*.test.tsx`: Testes unitários (Vitest).
- `e2e/*.spec.ts`: Testes de integração e interface (Playwright).
- `src/routes/test-seal.tsx`: Rota utilitária para validar a detecção de selos.
