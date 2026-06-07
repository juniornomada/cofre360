import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAlert } from "@/routes/__root";

export function useCardActions(onSuccess: () => void) {
  const { showAlert } = useAlert();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const toggleVisibility = useCallback(async (id: string, current: boolean | null) => {
    try {
      const { error } = await supabase.from("cards").update({ is_visible: !current }).eq("id", id);
      if (error) throw error;
      onSuccess();
      toast.success(current ? "Cartão ocultado" : "Cartão visível");
    } catch (error: any) {
      console.error("Error toggling visibility:", error);
      toast.error("Erro ao alterar visibilidade");
    }
  }, [onSuccess]);

  const deleteCard = useCallback(async (id: string) => {
    try {
      const { error } = await supabase.from("cards").delete().eq("id", id);
      if (error) throw error;
      onSuccess();
      toast.success("Cartão excluído");
    } catch (error: any) {
      console.error("Error deleting card:", error);
      toast.error("Erro ao excluir cartão");
    }
  }, [onSuccess]);

  return {
    toggleVisibility,
    deleteCard,
    deletingId,
    setDeletingId
  };
}
