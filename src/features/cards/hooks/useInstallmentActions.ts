import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CardTransaction } from "@/lib/invoice-utils";
import { CardData } from "../types";
import { useAlert } from "@/routes/__root";

export function useInstallmentActions(onSuccess: () => void) {
  const { showAlert } = useAlert();
  const [saving, setSaving] = useState(false);

  const addMonthsIso = (isoDate: string, months: number): string => {
    let base: Date;
    if (/^\d{4}-\d{2}-\d{2}/.test(isoDate)) {
      const [y, m, d] = isoDate.split("T")[0].split("-").map(Number);
      base = new Date(Date.UTC(y, (m || 1) - 1 + months, 1));
      const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
      const day = Math.min(d || 1, lastDay);
      const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(day).padStart(2, "0");
      return `${base.getUTCFullYear()}-${mm}-${dd}`;
    }
    // Fallback for non-ISO
    return isoDate; 
  };

  const saveInstallment = useCallback(async ({
    installmentTx,
    invoiceCard,
    total,
    current
  }: {
    installmentTx: CardTransaction;
    invoiceCard: CardData;
    total: number;
    current: number;
  }) => {
    if (!installmentTx || !invoiceCard) return;
    setSaving(true);
    try {
      const baseName = installmentTx.name.replace(/\s*\(\s*\d{1,2}\s*\/\s*\d{1,2}\s*\)\s*$/, "").trim();
      
      if (total === 1) {
        const { error } = await supabase
          .from("transactions")
          .update({
            name: baseName,
            installment_number: 1,
            total_installments: 1,
            installment_group_id: null,
          })
          .eq("id", installmentTx.id);
        if (error) throw error;
        showAlert("Parcelamento removido", "error");
      } else {
        const groupId = installmentTx.installment_group_id || crypto.randomUUID();

        const { error: updErr } = await supabase
          .from("transactions")
          .update({
            name: `${baseName} (${current}/${total})`,
            installment_number: current,
            total_installments: total,
            installment_group_id: groupId,
          })
          .eq("id", installmentTx.id);
        if (updErr) throw updErr;

        const { data: siblings } = await supabase
          .from("transactions")
          .select("installment_number")
          .eq("installment_group_id", groupId);
        const present = new Set<number>((siblings || []).map((s) => s.installment_number));
        present.add(current);

        const toInsert = [];
        for (let n = current + 1; n <= total; n++) {
          if (present.has(n)) continue;
          toInsert.push({
            name: `${baseName} (${n}/${total})`,
            icon: installmentTx.icon,
            category: installmentTx.category,
            date: addMonthsIso(installmentTx.date, n - current),
            amount: installmentTx.amount,
            type: installmentTx.type,
            card: invoiceCard.name,
            installment_number: n,
            total_installments: total,
            installment_group_id: groupId,
            user_id: (await supabase.auth.getUser()).data.user?.id
          });
        }

        if (toInsert.length > 0) {
          const { error: insErr } = await supabase.from("transactions").insert(toInsert);
          if (insErr) throw insErr;
        }
        showAlert("Parcelamento atualizado");
      }
      onSuccess();
    } catch (e) {
      console.error(e);
      showAlert("Erro ao salvar parcelamento", "error");
    } finally {
      setSaving(false);
    }
  }, [showAlert, onSuccess]);

  return { saveInstallment, saving };
}
