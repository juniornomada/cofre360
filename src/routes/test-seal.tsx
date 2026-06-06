import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/test-seal' as any)({
  component: TestSealPage,
});

function TestSealPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Teste de Ocultação de Selo</h1>
      <p className="mb-4">Esta página contém elementos que devem ser ocultados automaticamente.</p>
      
      <div className="space-y-4 border p-4 rounded bg-muted/50">
        <div>
          <p className="text-sm font-medium mb-1">Badge Simulado (Classe):</p>
          <div className="lovable-badge p-2 bg-blue-500 text-white rounded">
            Este selo deve desaparecer
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-1">Badge Simulado (ID):</p>
          <div id="lovable-badge" className="p-2 bg-red-500 text-white rounded">
            Este selo também deve desaparecer
          </div>
        </div>

        <div>
          <p className="text-sm font-medium mb-1">Link Lovable:</p>
          <a href="https://lovable.dev" className="text-blue-500 underline">
            Link para Lovable
          </a>
        </div>
      </div>

      <div className="mt-8">
        <p className="text-sm text-muted-foreground">
          Se o componente SealVerifier e as regras CSS estiverem funcionando, 
          os elementos acima não devem ser visíveis.
        </p>
      </div>
    </div>
  );
}
