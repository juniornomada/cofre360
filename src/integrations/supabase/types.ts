export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_test_runs: {
        Row: {
          avg_accuracy: number
          avg_consistency: number
          avg_duration_ms: number
          created_at: string
          failed: number
          id: string
          passed: number
          results: Json
          run_at: string
          total_tests: number
          trigger: string
        }
        Insert: {
          avg_accuracy: number
          avg_consistency: number
          avg_duration_ms: number
          created_at?: string
          failed: number
          id?: string
          passed: number
          results: Json
          run_at?: string
          total_tests: number
          trigger?: string
        }
        Update: {
          avg_accuracy?: number
          avg_consistency?: number
          avg_duration_ms?: number
          created_at?: string
          failed?: number
          id?: string
          passed?: number
          results?: Json
          run_at?: string
          total_tests?: number
          trigger?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          balance: number
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_visible: boolean | null
          name: string
          sort_order: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          color?: string | null
          created_at?: string
          icon?: string | null
          id: string
          is_visible?: boolean | null
          name: string
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_visible?: boolean | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      budget_categories: {
        Row: {
          budget_limit: number | null
          category: string | null
          color: string | null
          created_at: string | null
          icon: string | null
          id: string | null
          spent: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          budget_limit?: number | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string | null
          spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          budget_limit?: number | null
          category?: string | null
          color?: string | null
          created_at?: string | null
          icon?: string | null
          id?: string | null
          spent?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      card_payments: {
        Row: {
          amount: number | null
          bank_account_id: string | null
          card_id: string | null
          created_at: string | null
          id: string | null
          paid_at: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          bank_account_id?: string | null
          card_id?: string | null
          created_at?: string | null
          id?: string | null
          paid_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          bank_account_id?: string | null
          card_id?: string | null
          created_at?: string | null
          id?: string | null
          paid_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          brand: string
          card_limit: number
          closing_day: number | null
          color: string | null
          created_at: string
          due_day: number | null
          emoji: string | null
          id: string
          is_visible: boolean | null
          last_four: number | null
          name: string
          sort_order: number | null
          updated_at: string
          used: number
          user_id: string | null
        }
        Insert: {
          brand: string
          card_limit?: number
          closing_day?: number | null
          color?: string | null
          created_at?: string
          due_day?: number | null
          emoji?: string | null
          id: string
          is_visible?: boolean | null
          last_four?: number | null
          name: string
          sort_order?: number | null
          updated_at?: string
          used?: number
          user_id?: string | null
        }
        Update: {
          brand?: string
          card_limit?: number
          closing_day?: number | null
          color?: string | null
          created_at?: string
          due_day?: number | null
          emoji?: string | null
          id?: string
          is_visible?: boolean | null
          last_four?: number | null
          name?: string
          sort_order?: number | null
          updated_at?: string
          used?: number
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon: string
          id: string
          label: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string | null
          current_amount: number | null
          deadline: string | null
          icon: string | null
          id: string | null
          name: string | null
          target_amount: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          current_amount?: number | null
          deadline?: string | null
          icon?: string | null
          id?: string | null
          name?: string | null
          target_amount?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          current_amount?: number | null
          deadline?: string | null
          icon?: string | null
          id?: string | null
          name?: string | null
          target_amount?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance_visible: boolean | null
          created_at: string
          hide_zero_balances: boolean | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_visible?: boolean | null
          created_at?: string
          hide_zero_balances?: boolean | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_visible?: boolean | null
          created_at?: string
          hide_zero_balances?: boolean | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          amount: number | null
          bank_account_id: string | null
          card_id: string | null
          category: string | null
          completion_date: string | null
          created_at: string | null
          due_date: string | null
          icon: string | null
          id: string
          is_completed: boolean | null
          is_recurring: boolean | null
          notes: string | null
          recurrence_day: number | null
          title: string | null
          type: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          bank_account_id?: string | null
          card_id?: string | null
          category?: string | null
          completion_date?: string | null
          created_at?: string | null
          due_date?: string | null
          icon?: string | null
          id: string
          is_completed?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          recurrence_day?: number | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          bank_account_id?: string | null
          card_id?: string | null
          category?: string | null
          completion_date?: string | null
          created_at?: string | null
          due_date?: string | null
          icon?: string | null
          id?: string
          is_completed?: boolean | null
          is_recurring?: boolean | null
          notes?: string | null
          recurrence_day?: number | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          icon: string
          id: string
          label: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          card: string | null
          category: string | null
          created_at: string
          date: string
          icon: string | null
          id: string
          installment_group_id: string | null
          installment_number: number | null
          is_visible: boolean | null
          name: string
          total_installments: number | null
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          card?: string | null
          category?: string | null
          created_at?: string
          date: string
          icon?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          is_visible?: boolean | null
          name: string
          total_installments?: number | null
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          card?: string | null
          category?: string | null
          created_at?: string
          date?: string
          icon?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          is_visible?: boolean | null
          name?: string
          total_installments?: number | null
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      safe_transfer_user_email: {
        Args: { new_email: string; old_email: string }
        Returns: string
      }
      test_safe_transfer_validation: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
