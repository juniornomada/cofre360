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
      bank_account_balance_history: {
        Row: {
          bank_account_id: string
          created_at: string
          id: string
          new_balance: number
          previous_balance: number
          user_id: string | null
        }
        Insert: {
          bank_account_id: string
          created_at?: string
          id?: string
          new_balance: number
          previous_balance: number
          user_id?: string | null
        }
        Update: {
          bank_account_id?: string
          created_at?: string
          id?: string
          new_balance?: number
          previous_balance?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_account_balance_history_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          balance: number
          color: string
          created_at: string
          icon: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          color?: string
          created_at?: string
          icon?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      budget_categories: {
        Row: {
          budget_limit: number
          category: string
          color: string
          created_at: string
          icon: string
          id: string
          spent: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          budget_limit?: number
          category: string
          color?: string
          created_at?: string
          icon?: string
          id?: string
          spent?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          budget_limit?: number
          category?: string
          color?: string
          created_at?: string
          icon?: string
          id?: string
          spent?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      card_payments: {
        Row: {
          amount: number
          bank_account_id: string
          card_id: string
          created_at: string
          id: string
          paid_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          bank_account_id: string
          card_id: string
          created_at?: string
          id?: string
          paid_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string
          card_id?: string
          created_at?: string
          id?: string
          paid_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "card_payments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_payments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          brand: string
          card_limit: number
          closing_day: number
          color: string
          created_at: string
          due_day: number
          emoji: string
          id: string
          last_four: string
          name: string
          sort_order: number
          updated_at: string
          used: number
          user_id: string | null
        }
        Insert: {
          brand?: string
          card_limit?: number
          closing_day?: number
          color?: string
          created_at?: string
          due_day?: number
          emoji?: string
          id?: string
          last_four?: string
          name: string
          sort_order?: number
          updated_at?: string
          used?: number
          user_id?: string | null
        }
        Update: {
          brand?: string
          card_limit?: number
          closing_day?: number
          color?: string
          created_at?: string
          due_day?: number
          emoji?: string
          id?: string
          last_four?: string
          name?: string
          sort_order?: number
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
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      goals: {
        Row: {
          created_at: string
          current_amount: number
          deadline: string
          icon: string
          id: string
          name: string
          target_amount: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          current_amount?: number
          deadline?: string
          icon?: string
          id?: string
          name: string
          target_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          current_amount?: number
          deadline?: string
          icon?: string
          id?: string
          name?: string
          target_amount?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      performance_metrics: {
        Row: {
          created_at: string | null
          id: string
          name: string
          path: string | null
          rating: string | null
          user_agent: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          path?: string | null
          rating?: string | null
          user_agent?: string | null
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          path?: string | null
          rating?: string | null
          user_agent?: string | null
          value?: number
        }
        Relationships: []
      }
      reminders: {
        Row: {
          amount: number
          bank_account_id: string | null
          card_id: string | null
          category: string
          created_at: string
          due_date: string
          icon: string
          id: string
          is_completed: boolean
          is_recurring: boolean
          notes: string | null
          recurrence_day: number | null
          title: string
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          card_id?: string | null
          category?: string
          created_at?: string
          due_date: string
          icon?: string
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          notes?: string | null
          recurrence_day?: number | null
          title: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          card_id?: string | null
          category?: string
          created_at?: string
          due_date?: string
          icon?: string
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          notes?: string | null
          recurrence_day?: number | null
          title?: string
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reminders_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      subcategories: {
        Row: {
          category_id: string
          created_at: string
          icon: string
          id: string
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          icon?: string
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          icon?: string
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          card: string | null
          category: string
          created_at: string
          date: string
          icon: string
          id: string
          installment_group_id: string | null
          installment_number: number
          name: string
          total_installments: number
          type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          bank_account_id?: string | null
          card?: string | null
          category?: string
          created_at?: string
          date: string
          icon?: string
          id?: string
          installment_group_id?: string | null
          installment_number?: number
          name: string
          total_installments?: number
          type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          card?: string | null
          category?: string
          created_at?: string
          date?: string
          icon?: string
          id?: string
          installment_group_id?: string | null
          installment_number?: number
          name?: string
          total_installments?: number
          type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      normalize_transaction_dedup_text: {
        Args: { input: string }
        Returns: string
      }
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
