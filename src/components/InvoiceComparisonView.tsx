import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertCircle, HelpCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComparisonItem = {
  date: string;
  name: string;
  amount: number;
  status: "match" | "pdf_only" | "system_only" | "mismatch";
  systemAmount?: number;
};

interface InvoiceComparisonViewProps {
  items: ComparisonItem[];
  pdfTotal: number;
  systemTotal: number;
}

export function InvoiceComparisonView({ items, pdfTotal, systemTotal }: InvoiceComparisonViewProps) {
  const diff = pdfTotal - systemTotal;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="p-3 rounded-xl bg-muted/50 border">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total no PDF</p>
          <p className="text-lg font-bold">R$ {pdfTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="p-3 rounded-xl bg-muted/50 border">
          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total no Sistema</p>
          <p className="text-lg font-bold">R$ {systemTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className={cn("p-3 rounded-xl border", Math.abs(diff) > 0.01 ? "bg-destructive/10 border-destructive/20 text-destructive" : "bg-primary/10 border-primary/20 text-primary")}>
          <p className="text-[10px] uppercase font-bold tracking-wider opacity-70">Diferença</p>
          <p className="text-lg font-bold">R$ {diff.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <div className="max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="bg-muted/50 sticky top-0 z-10">
              <TableRow>
                <TableHead className="w-[100px]">Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor (PDF)</TableHead>
                <TableHead className="text-right">Valor (Sistema)</TableHead>
                <TableHead className="w-[120px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, idx) => (
                <TableRow key={idx} className={cn(
                  item.status === 'pdf_only' && "bg-blue-50/30",
                  item.status === 'system_only' && "bg-orange-50/30",
                  item.status === 'mismatch' && "bg-destructive/5"
                )}>
                  <TableCell className="text-[11px] py-2">{item.date}</TableCell>
                  <TableCell className="text-[11px] py-2 font-medium">{item.name}</TableCell>
                  <TableCell className="text-right text-[11px] py-2">
                    {item.status !== 'system_only' ? `R$ ${item.amount.toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell className="text-right text-[11px] py-2">
                    {item.systemAmount !== undefined ? `R$ ${item.systemAmount.toFixed(2)}` : "-"}
                  </TableCell>
                  <TableCell className="py-2">
                    {item.status === 'match' && (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 gap-1 text-[9px] h-5">
                        <CheckCircle2 className="h-2.5 w-2.5" /> Ok
                      </Badge>
                    )}
                    {item.status === 'pdf_only' && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1 text-[9px] h-5">
                        <ArrowRight className="h-2.5 w-2.5" /> Novo
                      </Badge>
                    )}
                    {item.status === 'system_only' && (
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 gap-1 text-[9px] h-5">
                        <HelpCircle className="h-2.5 w-2.5" /> Extra
                      </Badge>
                    )}
                    {item.status === 'mismatch' && (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1 text-[9px] h-5">
                        <AlertCircle className="h-2.5 w-2.5" /> Divergente
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <span>No PDF, mas não no sistema (será importado)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-orange-500" />
          <span>No sistema, mas não no PDF (possível duplicidade ou erro)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span>Diferença de valor na mesma transação</span>
        </div>
      </div>
    </div>
  );
}
