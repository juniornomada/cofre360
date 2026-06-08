 export type InstallmentMode = "divide" | "fixed";
 
 export interface InstallmentDetails {
   valorParcela: number;
   totalCalculado: number;
   diff: number;
   aviso: string;
   formattedSummary: string;
   count: number;
 }
 
 /**
  * Calcula detalhes de parcelamento garantindo arredondamento consistente com o banco de dados.
  */
 export function calculateInstallmentDetails(
   amount: number,
   count: number,
   mode: InstallmentMode,
   fixedValue: number = 0
 ): InstallmentDetails {
   const safeCount = Math.max(1, Math.floor(count || 1));
    const valorParcela = mode === "divide"
      ? Math.round(((amount || 0) / safeCount) * 100) / 100
      : Math.round((fixedValue || 0) * 100) / 100;
    
    const totalCalculado = Math.round(valorParcela * safeCount * 100) / 100;
    const referenceTotal = (amount || totalCalculado);
    const diff = Math.round((totalCalculado - referenceTotal) * 100) / 100;
   
   const aviso = mode === "divide" && diff !== 0
     ? ` (ajuste de R$ ${diff.toLocaleString("pt-BR", { minimumFractionDigits: 2, signDisplay: "always" })})`
     : "";
     
   const formattedSummary = `${safeCount}x de R$ ${valorParcela.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} — Total: R$ ${totalCalculado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}${aviso}`;
 
   return {
     valorParcela,
     totalCalculado,
     diff,
     aviso,
     formattedSummary,
     count: safeCount
   };
 }