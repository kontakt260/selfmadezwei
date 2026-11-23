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
      chapters: {
        Row: {
          body: Json | null
          chapter_origin: Database["public"]["Enums"]["chapter_origin"]
          color_page_count: number
          content_version: number
          created_at: string
          hero_image_url: string | null
          id: string
          image_sections: Json
          page_count: number
          project_id: string
          sort_order: number
          source_impulse_id: string | null
          start_page: number
          title: string
          updated_at: string
          word_count: number | null
        }
        Insert: {
          body?: Json | null
          chapter_origin?: Database["public"]["Enums"]["chapter_origin"]
          color_page_count?: number
          content_version?: number
          created_at?: string
          hero_image_url?: string | null
          id?: string
          image_sections?: Json
          page_count?: number
          project_id: string
          sort_order: number
          source_impulse_id?: string | null
          start_page?: number
          title: string
          updated_at?: string
          word_count?: number | null
        }
        Update: {
          body?: Json | null
          chapter_origin?: Database["public"]["Enums"]["chapter_origin"]
          color_page_count?: number
          content_version?: number
          created_at?: string
          hero_image_url?: string | null
          id?: string
          image_sections?: Json
          page_count?: number
          project_id?: string
          sort_order?: number
          source_impulse_id?: string | null
          start_page?: number
          title?: string
          updated_at?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "chapters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_source_impulse_id_fkey"
            columns: ["source_impulse_id"]
            isOneToOne: false
            referencedRelation: "impulse_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      impulse_catalog: {
        Row: {
          category: string
          created_at: string
          id: string
          leading_questions: string[]
          sort_order: number
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          leading_questions: string[]
          sort_order: number
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          leading_questions?: string[]
          sort_order?: number
          title?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          is_gift: boolean
          project_id: string
          role: Database["public"]["Enums"]["member_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          is_gift?: boolean
          project_id: string
          role?: Database["public"]["Enums"]["member_role"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_gift?: boolean
          project_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      mail_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          mail_type: string
          project_id: string | null
          resend_message_id: string | null
          sent_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          mail_type: string
          project_id?: string | null
          resend_message_id?: string | null
          sent_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          mail_type?: string
          project_id?: string | null
          resend_message_id?: string | null
          sent_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mail_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chapter_contributors: {
        Row: {
          chapter_id: string
          first_contributed_at: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          first_contributed_at?: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          first_contributed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      storage_cleanup_queue: {
        Row: {
          attempts: number
          created_at: string
          last_error: string | null
          project_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          project_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          last_error?: string | null
          project_id?: string
        }
        Relationships: []
      }
      storage_chapter_cleanup_queue: {
        Row: {
          attempts: number
          chapter_id: string
          created_at: string
          last_error: string | null
          project_id: string
        }
        Insert: {
          attempts?: number
          chapter_id: string
          created_at?: string
          last_error?: string | null
          project_id: string
        }
        Update: {
          attempts?: number
          chapter_id?: string
          created_at?: string
          last_error?: string | null
          project_id?: string
        }
        Relationships: []
      }
      trash_chapter_people: {
        Row: {
          chapter_id: string
          first_contributed_at: string | null
          user_id: string
          was_member: boolean
        }
        Insert: {
          chapter_id: string
          first_contributed_at?: string | null
          user_id: string
          was_member?: boolean
        }
        Update: {
          chapter_id?: string
          first_contributed_at?: string | null
          user_id?: string
          was_member?: boolean
        }
        Relationships: []
      }
      trash_chapters: {
        Row: {
          chapter_id: string
          deleted_at: string
          deleted_by: string | null
          project_id: string
          purge_at: string
          snapshot: Json
          title: string
        }
        Insert: {
          chapter_id: string
          deleted_at?: string
          deleted_by?: string | null
          project_id: string
          purge_at?: string
          snapshot: Json
          title: string
        }
        Update: {
          chapter_id?: string
          deleted_at?: string
          deleted_by?: string | null
          project_id?: string
          purge_at?: string
          snapshot?: Json
          title?: string
        }
        Relationships: []
      }
      trash_project_members: {
        Row: {
          member_since: string
          project_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          member_since: string
          project_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          member_since?: string
          project_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: []
      }
      trash_projects: {
        Row: {
          deleted_at: string
          deleted_by: string | null
          project_id: string
          purge_at: string
          reason: string
        }
        Insert: {
          deleted_at?: string
          deleted_by?: string | null
          project_id: string
          purge_at?: string
          reason?: string
        }
        Update: {
          deleted_at?: string
          deleted_by?: string | null
          project_id?: string
          purge_at?: string
          reason?: string
        }
        Relationships: []
      }
      project_retention_holds: {
        Row: {
          created_at: string
          hold_until: string
          project_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          hold_until: string
          project_id: string
          reason: string
        }
        Update: {
          created_at?: string
          hold_until?: string
          project_id?: string
          reason?: string
        }
        Relationships: []
      }
      mail_retry_queue: {
        Row: {
          attempts: number
          created_at: string
          gave_up_at: string | null
          id: string
          kind: string
          last_error: string | null
          payload: Json
        }
        Insert: {
          attempts?: number
          created_at?: string
          gave_up_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          payload: Json
        }
        Update: {
          attempts?: number
          created_at?: string
          gave_up_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          payload?: Json
        }
        Relationships: []
      }
      narration_settings: {
        Row: {
          channel: string
          created_at: string
          email: string | null
          narrator_name: string
          phone: string | null
          project_id: string
          rhythm_weeks: number
          updated_at: string
          weekday: number
        }
        Insert: {
          channel: string
          created_at?: string
          email?: string | null
          narrator_name: string
          phone?: string | null
          project_id: string
          rhythm_weeks?: number
          updated_at?: string
          weekday?: number
        }
        Update: {
          channel?: string
          created_at?: string
          email?: string | null
          narrator_name?: string
          phone?: string | null
          project_id?: string
          rhythm_weeks?: number
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "narration_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          id: string
          project_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_session_id: string
          type: Database["public"]["Enums"]["payment_type"]
          user_id: string | null
        }
        Insert: {
          amount_cents: number
          created_at?: string
          currency?: string
          id?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_session_id: string
          type: Database["public"]["Enums"]["payment_type"]
          user_id?: string | null
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          id?: string
          project_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_session_id?: string
          type?: Database["public"]["Enums"]["payment_type"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_access: {
        Row: {
          expires_at: string | null
          project_id: string
          updated_at: string
        }
        Insert: {
          expires_at?: string | null
          project_id: string
          updated_at?: string
        }
        Update: {
          expires_at?: string | null
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_covers: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          metadata: Json | null
          project_id: string
          theme: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          metadata?: Json | null
          project_id: string
          theme?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          metadata?: Json | null
          project_id?: string
          theme?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_covers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          owner_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          owner_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          owner_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_counters: {
        Row: {
          hits: number
          identifier_hash: string
          scope: string
          window_ends_at: string
        }
        Insert: {
          hits?: number
          identifier_hash: string
          scope: string
          window_ends_at: string
        }
        Update: {
          hits?: number
          identifier_hash?: string
          scope?: string
          window_ends_at?: string
        }
        Relationships: []
      }
      purchase_claims: {
        Row: {
          amount_cents: number
          buyer_email: string | null
          claim_token_hash: string
          claimed_at: string | null
          claimed_by: string | null
          created_at: string
          currency: string
          id: string
          mail_token_hash: string | null
          metadata: Json
          paid_at: string
          project_id: string | null
          stripe_session_id: string
        }
        Insert: {
          amount_cents: number
          buyer_email?: string | null
          claim_token_hash: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          mail_token_hash?: string | null
          metadata?: Json
          paid_at?: string
          project_id?: string | null
          stripe_session_id: string
        }
        Update: {
          amount_cents?: number
          buyer_email?: string | null
          claim_token_hash?: string
          claimed_at?: string | null
          claimed_by?: string | null
          created_at?: string
          currency?: string
          id?: string
          mail_token_hash?: string | null
          metadata?: Json
          paid_at?: string
          project_id?: string | null
          stripe_session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_claims_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_claims_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_narration_drafts: {
        Row: {
          channel: string | null
          created_at: string
          email: string | null
          gift_recipient_email: string | null
          id: string
          narrator_name: string | null
          phone: string | null
          status: string
          status_changed_at: string
          uses_checkout_email: boolean
        }
        Insert: {
          channel?: string | null
          created_at?: string
          email?: string | null
          gift_recipient_email?: string | null
          id?: string
          narrator_name?: string | null
          phone?: string | null
          status?: string
          status_changed_at?: string
          uses_checkout_email?: boolean
        }
        Update: {
          channel?: string | null
          created_at?: string
          email?: string | null
          gift_recipient_email?: string | null
          id?: string
          narrator_name?: string | null
          phone?: string | null
          status?: string
          status_changed_at?: string
          uses_checkout_email?: boolean
        }
        Relationships: []
      }
      voice_sessions: {
        Row: {
          chapter_id: string | null
          chapter_origin: Database["public"]["Enums"]["chapter_origin"] | null
          created_at: string
          duration_seconds: number
          id: string
          project_id: string | null
          user_id: string | null
        }
        Insert: {
          chapter_id?: string | null
          chapter_origin?: Database["public"]["Enums"]["chapter_origin"] | null
          created_at?: string
          duration_seconds: number
          id?: string
          project_id?: string | null
          user_id?: string | null
        }
        Update: {
          chapter_id?: string | null
          chapter_origin?: Database["public"]["Enums"]["chapter_origin"] | null
          created_at?: string
          duration_seconds?: number
          id?: string
          project_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_sessions_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_deletion_overview: {
        Args: { p_email: string; p_user_id: string }
        Returns: Json
      }
      account_exists: { Args: { p_email: string }; Returns: boolean }
      leave_project: {
        Args: {
          p_project_id: string
          p_successor_user_id?: string | null
          p_user_id: string
        }
        Returns: Json
      }
      prepare_account_deletion: {
        Args: {
          p_confirmed_delete: string[]
          p_email: string
          p_successors: Json
          p_user_id: string
        }
        Returns: Json
      }
      retention_due: {
        Args: { p_project_id?: string | null }
        Returns: {
          delete_due_at: string
          expires_at: string
          project_id: string
        }[]
      }
      retention_move_due: { Args: { p_confirm_count?: number | null }; Returns: Json }
      retention_restore_paid: { Args: { p_project_id: string }; Returns: Json }
      trash_delete_chapter_now: { Args: { p_chapter_id: string }; Returns: Json }
      trash_delete_project_now: { Args: { p_project_id: string }; Returns: Json }
      trash_find: {
        Args: { p_search?: string | null }
        Returns: {
          contributor_emails: string | null
          delete_reason: string
          deleted_at: string
          deleted_by_email: string | null
          item_id: string
          item_type: string
          member_emails: string | null
          project_id: string
          project_title: string
          purge_at: string
          title: string
        }[]
      }
      trash_purge_due: { Args: { p_limit?: number }; Returns: Json }
      trash_restore_chapter: { Args: { p_chapter_id: string }; Returns: Json }
      trash_restore_project: {
        Args: { p_new_lead?: string | null; p_project_id: string }
        Returns: Json
      }
      am_i_pl_of: { Args: { p_project_id: string }; Returns: boolean }
      get_my_project_ids: { Args: never; Returns: string[] }
      rate_limit_hit: {
        Args: {
          p_identifier_hash: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: {
          current_hits: number
          is_allowed: boolean
          retry_after_seconds: number
        }[]
      }
      rate_limit_undo: {
        Args: { p_identifier_hash: string; p_scope: string }
        Returns: undefined
      }
      lookup_invitation_by_token: {
        Args: { p_token: string }
        Returns: {
          accepted_at: string
          email: string
          expires_at: string
          invitation_id: string
          inviter_full_name: string
          project_id: string
          project_title: string
          role: Database["public"]["Enums"]["member_role"]
        }[]
      }
      recalc_chapter_start_pages: {
        Args: { p_project_id: string }
        Returns: undefined
      }
    }
    Enums: {
      chapter_origin: "custom" | "catalog_impulse"
      member_role: "projektleiter" | "co_author"
      payment_status: "pending" | "completed" | "failed"
      payment_type:
        | "initial_portal_access"
        | "portal_access_renewal"
        | "vapi_voice_minutes_60"
        | "print_order"
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
      chapter_origin: ["custom", "catalog_impulse"],
      member_role: ["projektleiter", "co_author"],
      payment_status: ["pending", "completed", "failed"],
      payment_type: [
        "initial_portal_access",
        "portal_access_renewal",
        "vapi_voice_minutes_60",
        "print_order",
      ],
    },
  },
} as const
