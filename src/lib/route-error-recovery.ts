/**
 * Importações de chunks podem falhar após um novo deploy quando o navegador
 * ainda está com o shell da versão anterior. Nesse caso invalidate/reset
 * sozinho não resolve: é necessário recarregar a página inteira.
 *
 * Não inclui URLs de chunks, dados do usuário ou mensagens de exceção na UI.
 */
export function isStaleAppChunkError(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current != null; depth++) {
    if (typeof current !== "object") {
      if (depth === 0 && typeof current === "string") {
        return /(?:ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk .+ failed|Failed to load module script)/i.test(current);
      }
      return false;
    }
    const value = current as { name?: unknown; message?: unknown; cause?: unknown };
    const name = typeof value.name === "string" ? value.name : "";
    const message = typeof value.message === "string" ? value.message : "";
    if (/(?:ChunkLoadError|CSS_CHUNK_LOAD_FAILED)/i.test(name) ||
      /(?:Failed to fetch dynamically imported module|Importing a module script failed|Loading (?:CSS )?chunk .+ failed|Failed to load module script)/i.test(message)) {
      return true;
    }
    current = value.cause;
  }
  return false;
}
