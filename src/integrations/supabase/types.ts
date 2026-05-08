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
      backup_logs: {
        Row: {
          action: string
          company_id: string | null
          created_at: string
          error_message: string | null
          format: string
          id: string
          metadata: Json | null
          performed_by: string
          performed_by_name: string | null
          scope: string
          size_bytes: number | null
          status: string
          tables_included: string[] | null
          total_records: number | null
        }
        Insert: {
          action?: string
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          format?: string
          id?: string
          metadata?: Json | null
          performed_by: string
          performed_by_name?: string | null
          scope?: string
          size_bytes?: number | null
          status?: string
          tables_included?: string[] | null
          total_records?: number | null
        }
        Update: {
          action?: string
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          format?: string
          id?: string
          metadata?: Json | null
          performed_by?: string
          performed_by_name?: string | null
          scope?: string
          size_bytes?: number | null
          status?: string
          tables_included?: string[] | null
          total_records?: number | null
        }
        Relationships: []
      }
      client_notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read_at: string | null
          responsible_id: string
          sent_by: string
          sent_by_name: string | null
          title: string
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          responsible_id: string
          sent_by: string
          sent_by_name?: string | null
          title: string
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          responsible_id?: string
          sent_by?: string
          sent_by_name?: string | null
          title?: string
          unit_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          asaas_api_key_master: string | null
          asaas_base_url_master: string | null
          asaas_webhook_token_master: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          dias_bloqueio: number | null
          email: string | null
          endereco: string | null
          estado: string | null
          id: string
          logo_url: string | null
          max_units: number
          max_users: number
          name: string
          numero: string | null
          phone: string | null
          plan: string
          primary_color: string | null
          secondary_color: string | null
          status: string
          system_name: string
          updated_at: string
          valor_mensalidade: number | null
          whatsapp_financeiro: string | null
          whatsapp_master: string | null
        }
        Insert: {
          asaas_api_key_master?: string | null
          asaas_base_url_master?: string | null
          asaas_webhook_token_master?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          dias_bloqueio?: number | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          max_units?: number
          max_users?: number
          name: string
          numero?: string | null
          phone?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          status?: string
          system_name?: string
          updated_at?: string
          valor_mensalidade?: number | null
          whatsapp_financeiro?: string | null
          whatsapp_master?: string | null
        }
        Update: {
          asaas_api_key_master?: string | null
          asaas_base_url_master?: string | null
          asaas_webhook_token_master?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          dias_bloqueio?: number | null
          email?: string | null
          endereco?: string | null
          estado?: string | null
          id?: string
          logo_url?: string | null
          max_units?: number
          max_users?: number
          name?: string
          numero?: string | null
          phone?: string | null
          plan?: string
          primary_color?: string | null
          secondary_color?: string | null
          status?: string
          system_name?: string
          updated_at?: string
          valor_mensalidade?: number | null
          whatsapp_financeiro?: string | null
          whatsapp_master?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          address: string | null
          address_number: string | null
          apostilas_enabled: boolean
          apostilas_interval_months: number | null
          apostilas_qty: number | null
          apostilas_start_date: string | null
          apostilas_total_value: number | null
          asaas_customer_id: string | null
          birth_date: string | null
          cancellation_base_value: number | null
          cancellation_date: string | null
          cancellation_installments_count: number | null
          cancellation_penalty_percent: number | null
          cancellation_penalty_value: number | null
          cancelled_at: string | null
          city: string | null
          complement: string | null
          contract_number: string | null
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
          apostilas_enabled?: boolean
          apostilas_interval_months?: number | null
          apostilas_qty?: number | null
          apostilas_start_date?: string | null
          apostilas_total_value?: number | null
          asaas_customer_id?: string | null
          birth_date?: string | null
          cancellation_base_value?: number | null
          cancellation_date?: string | null
          cancellation_installments_count?: number | null
          cancellation_penalty_percent?: number | null
          cancellation_penalty_value?: number | null
          cancelled_at?: string | null
          city?: string | null
          complement?: string | null
          contract_number?: string | null
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
          apostilas_enabled?: boolean
          apostilas_interval_months?: number | null
          apostilas_qty?: number | null
          apostilas_start_date?: string | null
          apostilas_total_value?: number | null
          asaas_customer_id?: string | null
          birth_date?: string | null
          cancellation_base_value?: number | null
          cancellation_date?: string | null
          cancellation_installments_count?: number | null
          cancellation_penalty_percent?: number | null
          cancellation_penalty_value?: number | null
          cancelled_at?: string | null
          city?: string | null
          complement?: string | null
          contract_number?: string | null
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
      course_apostilas: {
        Row: {
          course_id: string
          created_at: string
          display_order: number
          id: string
          stock_item_id: string
          unit_value: number
        }
        Insert: {
          course_id: string
          created_at?: string
          display_order?: number
          id?: string
          stock_item_id: string
          unit_value?: number
        }
        Update: {
          course_id?: string
          created_at?: string
          display_order?: number
          id?: string
          stock_item_id?: string
          unit_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_apostilas_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_apostilas_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          punctuality_discount: number
          suggested_installments: number
          suggested_value: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          punctuality_discount?: number
          suggested_installments?: number
          suggested_value?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          punctuality_discount?: number
          suggested_installments?: number
          suggested_value?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_notifications: {
        Row: {
          created_at: string
          delivered_at: string | null
          delivered_by: string | null
          enrollment_id: string | null
          id: string
          item_name: string
          payment_id: string
          quantity: number
          responsible_id: string
          responsible_name: string | null
          status: string
          stock_item_id: string | null
          student_id: string | null
          student_name: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          enrollment_id?: string | null
          id?: string
          item_name: string
          payment_id: string
          quantity?: number
          responsible_id: string
          responsible_name?: string | null
          status?: string
          stock_item_id?: string | null
          student_id?: string | null
          student_name?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          delivered_by?: string | null
          enrollment_id?: string | null
          id?: string
          item_name?: string
          payment_id?: string
          quantity?: number
          responsible_id?: string
          responsible_name?: string | null
          status?: string
          stock_item_id?: string | null
          student_id?: string | null
          student_name?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_notifications_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notifications_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notifications_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notifications_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_notifications_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_entries: {
        Row: {
          amount: number
          category: string | null
          company_id: string | null
          competence_date: string
          created_at: string
          created_by: string | null
          description: string
          direction: string
          due_date: string
          entry_type: string
          id: string
          notes: string | null
          paid_date: string | null
          reconciliation_status: string
          recurrence: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string | null
          company_id?: string | null
          competence_date?: string
          created_at?: string
          created_by?: string | null
          description: string
          direction?: string
          due_date?: string
          entry_type: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          reconciliation_status?: string
          recurrence?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string | null
          company_id?: string | null
          competence_date?: string
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: string
          due_date?: string
          entry_type?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          reconciliation_status?: string
          recurrence?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_inconsistencies: {
        Row: {
          asaas_due_date: string | null
          asaas_paid_at: string | null
          asaas_payment_id: string | null
          asaas_status: string | null
          asaas_value: number | null
          company_id: string | null
          created_at: string
          details: Json | null
          detection_count: number
          error_type: string
          id: string
          last_detected_at: string
          payment_id: string | null
          resolution_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          responsible_id: string | null
          responsible_name: string | null
          severity: string
          system_due_date: string | null
          system_paid_at: string | null
          system_status: string | null
          system_value: number | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          asaas_due_date?: string | null
          asaas_paid_at?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          asaas_value?: number | null
          company_id?: string | null
          created_at?: string
          details?: Json | null
          detection_count?: number
          error_type: string
          id?: string
          last_detected_at?: string
          payment_id?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_id?: string | null
          responsible_name?: string | null
          severity?: string
          system_due_date?: string | null
          system_paid_at?: string | null
          system_status?: string | null
          system_value?: number | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          asaas_due_date?: string | null
          asaas_paid_at?: string | null
          asaas_payment_id?: string | null
          asaas_status?: string | null
          asaas_value?: number | null
          company_id?: string | null
          created_at?: string
          details?: Json | null
          detection_count?: number
          error_type?: string
          id?: string
          last_detected_at?: string
          payment_id?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          responsible_id?: string | null
          responsible_name?: string | null
          severity?: string
          system_due_date?: string | null
          system_paid_at?: string | null
          system_status?: string | null
          system_value?: number | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          asaas_payment_id: string | null
          boleto_barcode: string | null
          boleto_url: string | null
          checkout_url: string | null
          contract_id: string | null
          cora_fee_amount: number | null
          cora_fee_source: string | null
          cora_invoice_id: string | null
          cora_status: string | null
          cora_synced_at: string | null
          created_at: string
          description: string
          due_date: string
          dunning_id: string | null
          dunning_manual: boolean
          dunning_status: string | null
          dunning_synced_at: string | null
          emission_attempts: number
          emission_error_code: string | null
          emission_error_message: string | null
          emission_last_attempt_at: string | null
          emission_payload: Json | null
          emission_response: Json | null
          emission_status: string
          final_value: number | null
          gateway: string | null
          id: string
          in_dunning: boolean
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
          stock_item_id: string | null
          stock_quantity: number | null
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
          cora_fee_amount?: number | null
          cora_fee_source?: string | null
          cora_invoice_id?: string | null
          cora_status?: string | null
          cora_synced_at?: string | null
          created_at?: string
          description?: string
          due_date: string
          dunning_id?: string | null
          dunning_manual?: boolean
          dunning_status?: string | null
          dunning_synced_at?: string | null
          emission_attempts?: number
          emission_error_code?: string | null
          emission_error_message?: string | null
          emission_last_attempt_at?: string | null
          emission_payload?: Json | null
          emission_response?: Json | null
          emission_status?: string
          final_value?: number | null
          gateway?: string | null
          id?: string
          in_dunning?: boolean
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
          stock_item_id?: string | null
          stock_quantity?: number | null
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
          cora_fee_amount?: number | null
          cora_fee_source?: string | null
          cora_invoice_id?: string | null
          cora_status?: string | null
          cora_synced_at?: string | null
          created_at?: string
          description?: string
          due_date?: string
          dunning_id?: string | null
          dunning_manual?: boolean
          dunning_status?: string | null
          dunning_synced_at?: string | null
          emission_attempts?: number
          emission_error_code?: string | null
          emission_error_message?: string | null
          emission_last_attempt_at?: string | null
          emission_payload?: Json | null
          emission_response?: Json | null
          emission_status?: string
          final_value?: number | null
          gateway?: string | null
          id?: string
          in_dunning?: boolean
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
          stock_item_id?: string | null
          stock_quantity?: number | null
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
            foreignKeyName: "payments_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
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
          address_number: string | null
          asaas_customer_id: string | null
          birth_date: string | null
          city: string | null
          complement: string | null
          cpf: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          neighborhood: string | null
          phone: string | null
          rg: string | null
          state: string | null
          unit_id: string | null
          updated_at: string
          zip_code: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          cpf: string
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          neighborhood?: string | null
          phone?: string | null
          rg?: string | null
          state?: string | null
          unit_id?: string | null
          updated_at?: string
          zip_code?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          address_number?: string | null
          asaas_customer_id?: string | null
          birth_date?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          neighborhood?: string | null
          phone?: string | null
          rg?: string | null
          state?: string | null
          unit_id?: string | null
          updated_at?: string
          zip_code?: string | null
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
      saas_invoices: {
        Row: {
          asaas_payment_id: string | null
          billing_type: string
          boleto_url: string | null
          company_id: string
          created_at: string
          description: string | null
          due_date: string
          id: string
          invoice_url: string | null
          original_value: number | null
          paid_at: string | null
          pix_copy_paste: string | null
          punctuality_discount: number
          status: string
          subscription_id: string | null
          unit_id: string | null
          value: number
        }
        Insert: {
          asaas_payment_id?: string | null
          billing_type?: string
          boleto_url?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          due_date: string
          id?: string
          invoice_url?: string | null
          original_value?: number | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          punctuality_discount?: number
          status?: string
          subscription_id?: string | null
          unit_id?: string | null
          value: number
        }
        Update: {
          asaas_payment_id?: string | null
          billing_type?: string
          boleto_url?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          due_date?: string
          id?: string
          invoice_url?: string | null
          original_value?: number | null
          paid_at?: string | null
          pix_copy_paste?: string | null
          punctuality_discount?: number
          status?: string
          subscription_id?: string | null
          unit_id?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "saas_invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "saas_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          ativo: boolean
          created_at: string
          desconto_percentual: number
          descricao: string | null
          duracao_meses: number
          id: string
          nome_plano: string
          updated_at: string
          valor_base: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          desconto_percentual?: number
          descricao?: string | null
          duracao_meses?: number
          id?: string
          nome_plano: string
          updated_at?: string
          valor_base?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          desconto_percentual?: number
          descricao?: string | null
          duracao_meses?: number
          id?: string
          nome_plano?: string
          updated_at?: string
          valor_base?: number
        }
        Relationships: []
      }
      saas_subscriptions: {
        Row: {
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          billing_type: string
          block_deadline: string | null
          company_id: string
          created_at: string
          due_day: number
          ends_at: string | null
          first_due_date: string | null
          id: string
          monthly_value: number
          next_billing_date: string | null
          plan: string
          plan_id: string | null
          punctuality_discount: number
          started_at: string
          status: string
          total_installments: number
          trial_days: number
          trial_ends_at: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_type?: string
          block_deadline?: string | null
          company_id: string
          created_at?: string
          due_day?: number
          ends_at?: string | null
          first_due_date?: string | null
          id?: string
          monthly_value?: number
          next_billing_date?: string | null
          plan?: string
          plan_id?: string | null
          punctuality_discount?: number
          started_at?: string
          status?: string
          total_installments?: number
          trial_days?: number
          trial_ends_at?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          billing_type?: string
          block_deadline?: string | null
          company_id?: string
          created_at?: string
          due_day?: number
          ends_at?: string | null
          first_due_date?: string | null
          id?: string
          monthly_value?: number
          next_billing_date?: string | null
          plan?: string
          plan_id?: string | null
          punctuality_discount?: number
          started_at?: string
          status?: string
          total_installments?: number
          trial_days?: number
          trial_ends_at?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_subscriptions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_subscriptions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: true
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          active: boolean
          category: string | null
          cost_price: number
          created_at: string
          description: string | null
          id: string
          min_quantity: number
          name: string
          quantity: number
          unit_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name: string
          quantity?: number
          unit_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          min_quantity?: number
          name?: string
          quantity?: number
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          item_id: string
          movement_type: string
          payment_id: string | null
          quantity: number
          reason: string | null
          responsible_id: string | null
          unit_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          movement_type?: string
          payment_id?: string | null
          quantity?: number
          reason?: string | null
          responsible_id?: string | null
          unit_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          movement_type?: string
          payment_id?: string | null
          quantity?: number
          reason?: string | null
          responsible_id?: string | null
          unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_unit_id_fkey"
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
      unit_financial_costs: {
        Row: {
          cost_per_student: number
          created_at: string
          fixed_monthly_cost: number
          id: string
          notes: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          cost_per_student?: number
          created_at?: string
          fixed_monthly_cost?: number
          id?: string
          notes?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          cost_per_student?: number
          created_at?: string
          fixed_monthly_cost?: number
          id?: string
          notes?: string | null
          unit_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          active: boolean
          address: string | null
          asaas_api_key: string | null
          asaas_base_url: string | null
          asaas_webhook_token: string | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string | null
          company_id: string | null
          cora_certificate: string | null
          cora_client_id: string | null
          cora_environment: string | null
          cora_fee_boleto: number
          cora_fee_pix: number
          cora_private_key: string | null
          cpf: string | null
          created_at: string
          email_acesso: string | null
          email_empresa: string | null
          estado: string | null
          id: string
          name: string
          partnership_plan: string
          phone: string | null
          preferred_bank: string
          razao_social: string | null
          rg_ie: string | null
          status: string
          tipo_cadastro: string | null
          updated_at: string
          uplay_balance: number
          uplay_fee_type: string
          uplay_fee_value: number
          usar_whatsapp_padrao: boolean
          whatsapp: string | null
          whatsapp_financeiro: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          asaas_api_key?: string | null
          asaas_base_url?: string | null
          asaas_webhook_token?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          company_id?: string | null
          cora_certificate?: string | null
          cora_client_id?: string | null
          cora_environment?: string | null
          cora_fee_boleto?: number
          cora_fee_pix?: number
          cora_private_key?: string | null
          cpf?: string | null
          created_at?: string
          email_acesso?: string | null
          email_empresa?: string | null
          estado?: string | null
          id?: string
          name: string
          partnership_plan?: string
          phone?: string | null
          preferred_bank?: string
          razao_social?: string | null
          rg_ie?: string | null
          status?: string
          tipo_cadastro?: string | null
          updated_at?: string
          uplay_balance?: number
          uplay_fee_type?: string
          uplay_fee_value?: number
          usar_whatsapp_padrao?: boolean
          whatsapp?: string | null
          whatsapp_financeiro?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          asaas_api_key?: string | null
          asaas_base_url?: string | null
          asaas_webhook_token?: string | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          company_id?: string | null
          cora_certificate?: string | null
          cora_client_id?: string | null
          cora_environment?: string | null
          cora_fee_boleto?: number
          cora_fee_pix?: number
          cora_private_key?: string | null
          cpf?: string | null
          created_at?: string
          email_acesso?: string | null
          email_empresa?: string | null
          estado?: string | null
          id?: string
          name?: string
          partnership_plan?: string
          phone?: string | null
          preferred_bank?: string
          razao_social?: string | null
          rg_ie?: string | null
          status?: string
          tipo_cadastro?: string | null
          updated_at?: string
          uplay_balance?: number
          uplay_fee_type?: string
          uplay_fee_value?: number
          usar_whatsapp_padrao?: boolean
          whatsapp?: string | null
          whatsapp_financeiro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      uplay_partner_transactions: {
        Row: {
          company_id: string | null
          created_at: string
          description: string | null
          fee_amount: number
          fee_type: string
          fee_value: number
          gross_value: number
          id: string
          net_value: number
          paid_at: string | null
          payment_id: string | null
          responsible_id: string | null
          responsible_name: string | null
          status: string
          transfer_notes: string | null
          transferred_at: string | null
          transferred_by: string | null
          unit_id: string
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          fee_amount?: number
          fee_type?: string
          fee_value?: number
          gross_value?: number
          id?: string
          net_value?: number
          paid_at?: string | null
          payment_id?: string | null
          responsible_id?: string | null
          responsible_name?: string | null
          status?: string
          transfer_notes?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          unit_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          description?: string | null
          fee_amount?: number
          fee_type?: string
          fee_value?: number
          gross_value?: number
          id?: string
          net_value?: number
          paid_at?: string | null
          payment_id?: string | null
          responsible_id?: string | null
          responsible_name?: string | null
          status?: string
          transfer_notes?: string | null
          transferred_at?: string | null
          transferred_by?: string | null
          unit_id?: string
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
      webhook_logs: {
        Row: {
          asaas_payment_id: string | null
          created_at: string
          error_message: string | null
          event: string
          id: string
          local_payment_id: string | null
          new_status: string | null
          old_status: string | null
          payload: Json | null
          processed: boolean
          unit_id: string | null
        }
        Insert: {
          asaas_payment_id?: string | null
          created_at?: string
          error_message?: string | null
          event: string
          id?: string
          local_payment_id?: string | null
          new_status?: string | null
          old_status?: string | null
          payload?: Json | null
          processed?: boolean
          unit_id?: string | null
        }
        Update: {
          asaas_payment_id?: string | null
          created_at?: string
          error_message?: string | null
          event?: string
          id?: string
          local_payment_id?: string | null
          new_status?: string | null
          old_status?: string | null
          payload?: Json | null
          processed?: boolean
          unit_id?: string | null
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
          company_id: string | null
          created_at: string | null
          id: string | null
          name: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          address?: string | null
          cnpj?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          address?: string | null
          cnpj?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string | null
          name?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      find_duplicate_cpf: {
        Args: { _cpf: string; _exclude_id?: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_company_secrets: { Args: { _company_id: string }; Returns: Json }
      get_email_by_cpf: { Args: { _cpf: string }; Returns: string }
      get_unit_secrets: { Args: { _unit_id: string }; Returns: Json }
      get_user_company_id: { Args: { _user_id: string }; Returns: string }
      get_user_unit_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      resolve_auth_email: { Args: { _login: string }; Returns: string }
      update_company_secrets: {
        Args: { _company_id: string; _secrets: Json }
        Returns: undefined
      }
      update_unit_secrets: {
        Args: { _secrets: Json; _unit_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "ADMIN_MASTER" | "ADMIN_UNIDADE" | "RESPONSAVEL" | "SUPER_ADMIN"
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
      app_role: ["ADMIN_MASTER", "ADMIN_UNIDADE", "RESPONSAVEL", "SUPER_ADMIN"],
    },
  },
} as const
