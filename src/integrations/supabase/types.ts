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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          performed_by: string
          target_id: string
          target_table: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by: string
          target_id: string
          target_table: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          performed_by?: string
          target_id?: string
          target_table?: string
        }
        Relationships: []
      }
      contracts: {
        Row: {
          address: string | null
          address_number: string | null
          asaas_customer_id: string | null
          birth_date: string | null
          city: string | null
          complement: string | null
          course_real_value: number | null
          cpf: string | null
          created_at: string
          description: string
          due_day: number | null
          email: string | null
          end_date: string | null
          final_value_with_discount: number | null
          first_due_date: string | null
          id: string
          installments: number
          neighborhood: string | null
          notes: string | null
          payment_method: string | null
          phone: string | null
          proof_of_address_url: string | null
          punctuality_discount: number | null
          responsible_id: string
          responsible_name: string | null
          rg: string | null
          start_date: string
          state: string | null
          status: string
          student_id: string
          total_value: number
          unit_id: string
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          course_real_value?: number | null
          cpf?: string | null
          created_at?: string
          description: string
          due_day?: number | null
          email?: string | null
          end_date?: string | null
          final_value_with_discount?: number | null
          first_due_date?: string | null
          id?: string
          installments?: number
          neighborhood?: string | null
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          proof_of_address_url?: string | null
          punctuality_discount?: number | null
          responsible_id: string
          responsible_name?: string | null
          rg?: string | null
          start_date: string
          state?: string | null
          status?: string
          student_id: string
          total_value: number
          unit_id: string
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          course_real_value?: number | null
          cpf?: string | null
          created_at?: string
          description?: string
          due_day?: number | null
          email?: string | null
          end_date?: string | null
          final_value_with_discount?: number | null
          first_due_date?: string | null
          id?: string
          installments?: number
          neighborhood?: string | null
          notes?: string | null
          payment_method?: string | null
          phone?: string | null
          proof_of_address_url?: string | null
          punctuality_discount?: number | null
          responsible_id?: string
          responsible_name?: string | null
          rg?: string | null
          start_date?: string
          state?: string | null
          status?: string
          student_id?: string
          total_value?: number
          unit_id?: string
          updated_at?: string
          zip_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          asaas_payment_id: string | null
          boleto_barcode: string | null
          boleto_url: string | null
          checkout_url: string | null
          contract_id: string | null
          created_at: string
          description: string
          due_date: string
          final_value: number | null
          id: string
          installment_number: number
          invoice_url: string | null
          original_value: number | null
          paid_at: string | null
          payment_method: string | null
          payment_type: string
          pix_copy_paste: string | null
          pix_qr_code: string | null
          punctuality_discount: number | null
          raw_response: Json | null
          responsible_id: string
          status: string
          student_id: string | null
          unit_id: string
          updated_at: string
          value: number
        }
        Insert: {
          asaas_payment_id?: string | null
          boleto_barcode?: string | null
          boleto_url?: string | null
          checkout_url?: string | null
          contract_id?: string | null
          created_at?: string
          description?: string
          due_date: string
          final_value?: number | null
          id?: string
          installment_number?: number
          invoice_url?: string | null
          original_value?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          punctuality_discount?: number | null
          raw_response?: Json | null
          responsible_id: string
          status?: string
          student_id?: string | null
          unit_id: string
          updated_at?: string
          value: number
        }
        Update: {
          asaas_payment_id?: string | null
          boleto_barcode?: string | null
          boleto_url?: string | null
          checkout_url?: string | null
          contract_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          final_value?: number | null
          id?: string
          installment_number?: number
          invoice_url?: string | null
          original_value?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payment_type?: string
          pix_copy_paste?: string | null
          pix_qr_code?: string | null
          punctuality_discount?: number | null
          raw_response?: Json | null
          responsible_id?: string
          status?: string
          student_id?: string | null
          unit_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          address: string | null
          asaas_customer_id: string | null
          cpf: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          asaas_customer_id?: string | null
          cpf: string
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          asaas_customer_id?: string | null
          cpf?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          active: boolean
          birth_date: string | null
          created_at: string
          enrollment_id: string | null
          full_name: string
          id: string
          responsible_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          birth_date?: string | null
          created_at?: string
          enrollment_id?: string | null
          full_name: string
          id?: string
          responsible_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          birth_date?: string | null
          created_at?: string
          enrollment_id?: string | null
          full_name?: string
          id?: string
          responsible_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          active: boolean
          address: string | null
          asaas_api_key: string | null
          asaas_base_url: string | null
          asaas_webhook_token: string | null
          cnpj: string | null
          created_at: string
          id: string
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          asaas_api_key?: string | null
          asaas_base_url?: string | null
          asaas_webhook_token?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          asaas_api_key?: string | null
          asaas_base_url?: string | null
          asaas_webhook_token?: string | null
          cnpj?: string | null
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      whatsapp_message_logs: {
        Row: {
          channel: string
          id: string
          message_text: string
          payment_id: string | null
          phone: string | null
          responsible_id: string
          sent_at: string
          sent_by: string
          status: string
        }
        Insert: {
          channel?: string
          id?: string
          message_text: string
          payment_id?: string | null
          phone?: string | null
          responsible_id: string
          sent_at?: string
          sent_by: string
          status?: string
        }
        Update: {
          channel?: string
          id?: string
          message_text?: string
          payment_id?: string | null
          phone?: string | null
          responsible_id?: string
          sent_at?: string
          sent_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_message_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      units_public: {
        Row: {
          active: boolean | null
          address: string | null
          cnpj: string | null
          created_at: string | null
          id: string | null
          name: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          cnpj?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_user_unit_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "ADMIN_MASTER" | "ADMIN_UNIDADE" | "RESPONSAVEL"
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
    Enums: {
      app_role: ["ADMIN_MASTER", "ADMIN_UNIDADE", "RESPONSAVEL"],
    },
  },
} as const
