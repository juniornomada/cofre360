export type Json =
  | string
  | number
  | boolean
 
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
          user_id: string
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
          user_id?: string
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
          user_id?: string
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
          user_id: string
        }
        Insert: {
          budget_limit?: number
          category?: string
          color?: string
          created_at?: string
          icon?: string
          id?: string
          spent?: number
          updated_at?: string
          user_id?: string
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
          user_id?: string
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
          user_id: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string
          card_id?: string
          created_at?: string
          id?: string
          paid_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          card_id?: string
          created_at?: string
          id?: string
          paid_at?: string
          user_id?: string
        }
        Relationships: []
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
          last_four: number
          name: string
          sort_order: number
          updated_at: string
          used: number
          user_id: string
        }
        Insert: {
          brand: string
          card_limit?: number
          closing_day?: number
          color?: string
          created_at?: string
          due_day?: number
          emoji?: string
          id?: string
          last_four?: number
          name: string
          sort_order?: number
          updated_at?: string
          used?: number
          user_id?: string
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
          last_four?: number
          name?: string
          sort_order?: number
          updated_at?: string
          used?: number
          user_id?: string
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
          icon: string
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
          user_id: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          deadline?: string
          icon?: string
          id?: string
          name?: string
          target_amount?: number
          updated_at?: string
          user_id?: string
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
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          amount: number
          bank_account_id: string
          card_id: string
          category: string
          created_at: string
          due_date: string
          icon: string
          id: string
          is_completed: boolean
          is_recurring: boolean
          notes: string
          recurrence_day: number
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string
          card_id?: string
          category?: string
          created_at?: string
          due_date?: string
          icon?: string
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          notes?: string
          recurrence_day?: number
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          card_id?: string
          category?: string
          created_at?: string
          due_date?: string
          icon?: string
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          notes?: string
          recurrence_day?: number
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
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
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          icon: string
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
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          bank_account_id: string
          card: string
          category: string
          created_at: string
          date: string
          icon: string
          id: string
          installment_group_id: string
          installment_number: number
          name: string
          total_installments: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          bank_account_id?: string
          card?: string
          category?: string
          created_at?: string
          date: string
          icon?: string
          id?: string
          installment_group_id?: string
          installment_number?: number
          name: string
          total_installments?: number
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          card?: string
          category?: string
          created_at?: string
          date?: string
          icon?: string
          id?: string
          installment_group_id?: string
          installment_number?: number
          name?: string
          total_installments?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
