import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useUserPreferences() {
  const [balanceVisible, setBalanceVisible] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("balanceVisible");
      return stored !== "false";
    }
    return true;
  });


  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        let { data, error } = await supabase
          .from("profiles")
          .select("balance_visible")
          .eq("user_id", user.id)
          .single();

        if (error && error.code === "PGRST116") {
          // Profile doesn't exist, create it (backfill for existing users)
          const { data: newProfile, error: createError } = await supabase
            .from("profiles")
            .insert([{ user_id: user.id }])
            .select()
            .single();
          
          if (createError) throw createError;
          data = newProfile;
        } else if (error) {
          throw error;
        }

        if (data) {
          setBalanceVisible(data.balance_visible ?? true);
          
          // Sync to localStorage as a cache/fallback
          localStorage.setItem("balanceVisible", String(data.balance_visible));
        }
      } catch (error) {
        console.error("Error fetching preferences:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchPreferences();
  }, []);

  const updateBalanceVisible = async (visible: boolean) => {
    setBalanceVisible(visible);
    localStorage.setItem("balanceVisible", String(visible));

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ balance_visible: visible })
        .eq("user_id", user.id);

      if (error) throw error;
    } catch (error) {
      console.error("Error updating balance visibility:", error);
      toast.error("Erro ao salvar preferência");
    }
  };


  return {
    balanceVisible,
    loading,
    updateBalanceVisible,
  };
}
