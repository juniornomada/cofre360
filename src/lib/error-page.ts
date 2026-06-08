export function renderErrorPage(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Erro inesperado — Cofre 360</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen,Ubuntu,sans-serif;
    background:#0f0f14;color:#f3f4f6}
  .card{max-width:480px;width:100%;text-align:center;background:#17171f;border:1px solid rgba(255,255,255,0.05);
    border-radius:24px;padding:40px 28px;box-shadow:0 20px 50px rgba(0,0,0,0.4)}
  .icon{width:64px;height:64px;border-radius:50%;background:rgba(239,68,68,0.12);color:#ef4444;
    display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 20px;font-weight:700}
  h1{font-size:24px;margin:0 0 12px;font-weight:800;letter-spacing:-0.02em}
  p{font-size:15px;line-height:1.6;color:#9ca3af;margin:0 0 28px}
  .actions{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
  button,a{font:inherit;padding:12px 24px;border-radius:14px;border:none;cursor:pointer;
    font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;text-decoration:none;
    transition:transform 0.15s}
  button:active,a:active{transform:scale(0.97)}
  .primary{background:#6366f1;color:#fff}
  .secondary{background:rgba(255,255,255,0.05);color:#f3f4f6;border:1px solid rgba(255,255,255,0.08)}
</style>
</head>
<body>
  <div class="card" role="alert">
    <div class="icon">!</div>
    <h1>Algo deu errado</h1>
    <p>Ocorreu um erro inesperado ao carregar a página. Por favor, tente novamente em alguns instantes.</p>
    <div class="actions">
      <button class="primary" onclick="window.location.reload()">Tentar novamente</button>
      <a class="secondary" href="/">Voltar ao início</a>
    </div>
  </div>
</body>
</html>`;
}
