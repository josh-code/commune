export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      hospitality_categories: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          { foreignKeyName: "hospitality_categories_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      hospitality_items: {
        Row: {
          category_id: string
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          { foreignKeyName: "hospitality_items_category_id_fkey"; columns: ["category_id"]; referencedRelation: "hospitality_categories"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_items_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      hospitality_needs: {
        Row: {
          created_at: string
          created_by: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          item_id: string
          notes: string | null
          quantity: string
          requested_at: string | null
          service_id: string
          status: Database["public"]["Enums"]["hospitality_need_status"]
        }
        Insert: {
          created_at?: string
          created_by: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          item_id: string
          notes?: string | null
          quantity: string
          requested_at?: string | null
          service_id: string
          status?: Database["public"]["Enums"]["hospitality_need_status"]
        }
        Update: {
          created_at?: string
          created_by?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: string
          requested_at?: string | null
          service_id?: string
          status?: Database["public"]["Enums"]["hospitality_need_status"]
        }
        Relationships: [
          { foreignKeyName: "hospitality_needs_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_needs_fulfilled_by_fkey"; columns: ["fulfilled_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_needs_item_id_fkey"; columns: ["item_id"]; referencedRelation: "hospitality_items"; referencedColumns: ["id"] },
          { foreignKeyName: "hospitality_needs_service_id_fkey"; columns: ["service_id"]; referencedRelation: "services"; referencedColumns: ["id"] }
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          payload: Json
          read_at: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          { foreignKeyName: "notifications_recipient_id_fkey"; columns: ["recipient_id"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
      inventory_categories: {
        Row: {
          color: string
          created_at: string
          icon: string | null
          id: string
          is_public: boolean
          name: string
          order: number
        }
        Insert: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_public?: boolean
          name: string
          order?: number
        }
        Update: {
          color?: string
          created_at?: string
          icon?: string | null
          id?: string
          is_public?: boolean
          name?: string
          order?: number
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          approval_required: boolean
          category_id: string
          condition: Database["public"]["Enums"]["inventory_condition"]
          condition_notes: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_public: boolean
          location: string | null
          name: string
          photo_url: string | null
          serial_number: string | null
          total_quantity: number
          tracked_individually: boolean
        }
        Insert: {
          approval_required?: boolean
          category_id: string
          condition?: Database["public"]["Enums"]["inventory_condition"]
          condition_notes?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          name: string
          photo_url?: string | null
          serial_number?: string | null
          total_quantity?: number
          tracked_individually?: boolean
        }
        Update: {
          approval_required?: boolean
          category_id?: string
          condition?: Database["public"]["Enums"]["inventory_condition"]
          condition_notes?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_public?: boolean
          location?: string | null
          name?: string
          photo_url?: string | null
          serial_number?: string | null
          total_quantity?: number
          tracked_individually?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "inventory_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          checked_out_at: string | null
          created_at: string
          created_by: string
          end_date: string
          id: string
          item_id: string
          notes: string | null
          profile_id: string
          quantity: number
          rejection_reason: string | null
          return_condition:
            | Database["public"]["Enums"]["inventory_condition"]
            | null
          return_notes: string | null
          returned_at: string | null
          start_date: string
          status: Database["public"]["Enums"]["reservation_status"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          checked_out_at?: string | null
          created_at?: string
          created_by: string
          end_date: string
          id?: string
          item_id: string
          notes?: string | null
          profile_id: string
          quantity?: number
          rejection_reason?: string | null
          return_condition?:
            | Database["public"]["Enums"]["inventory_condition"]
            | null
          return_notes?: string | null
          returned_at?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["reservation_status"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          checked_out_at?: string | null
          created_at?: string
          created_by?: string
          end_date?: string
          id?: string
          item_id?: string
          notes?: string | null
          profile_id?: string
          quantity?: number
          rejection_reason?: string | null
          return_condition?:
            | Database["public"]["Enums"]["inventory_condition"]
            | null
          return_notes?: string | null
          returned_at?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["reservation_status"]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          bio: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          invite_expires_at: string | null
          invite_token: string | null
          last_name: string
          phone: string | null
          role: Database["public"]["Enums"]["profile_role"]
          status: Database["public"]["Enums"]["profile_status"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          bio?: string | null
          created_at?: string
          email: string
          first_name: string
          id: string
          invite_expires_at?: string | null
          invite_token?: string | null
          last_name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          bio?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          invite_expires_at?: string | null
          invite_token?: string | null
          last_name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["profile_role"]
          status?: Database["public"]["Enums"]["profile_status"]
          updated_at?: string
        }
        Relationships: []
      }
      roster_slots: {
        Row: {
          id: string
          notified_at: string | null
          position_id: string
          profile_id: string | null
          responded_at: string | null
          service_id: string
          status: string
          team_id: string
        }
        Insert: {
          id?: string
          notified_at?: string | null
          position_id: string
          profile_id?: string | null
          responded_at?: string | null
          service_id: string
          status?: string
          team_id: string
        }
        Update: {
          id?: string
          notified_at?: string | null
          position_id?: string
          profile_id?: string | null
          responded_at?: string | null
          service_id?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roster_slots_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "team_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_slots_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_slots_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roster_slots_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      service_templates: {
        Row: {
          created_at: string
          created_by: string
          day_of_month: number | null
          day_of_week: number | null
          frequency: string
          id: string
          month_of_year: number | null
          name: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency: string
          id?: string
          month_of_year?: number | null
          name: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          day_of_month?: number | null
          day_of_week?: number | null
          frequency?: string
          id?: string
          month_of_year?: number | null
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_unavailability: {
        Row: {
          created_at: string
          profile_id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          service_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          service_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_unavailability_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_unavailability_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          created_by: string
          date: string
          id: string
          name: string
          status: string
          template_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          date: string
          id?: string
          name: string
          status?: string
          template_id?: string | null
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          name?: string
          status?: string
          template_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "service_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      swap_requests: {
        Row: {
          created_at: string
          id: string
          proposed_replacement_id: string | null
          requester_id: string
          roster_slot_id: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          proposed_replacement_id?: string | null
          requester_id: string
          roster_slot_id: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          proposed_replacement_id?: string | null
          requester_id?: string
          roster_slot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "swap_requests_proposed_replacement_id_fkey"
            columns: ["proposed_replacement_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "swap_requests_roster_slot_id_fkey"
            columns: ["roster_slot_id"]
            isOneToOne: false
            referencedRelation: "roster_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      team_member_positions: {
        Row: {
          assigned_at: string
          position_id: string
          profile_id: string
          team_id: string
          team_role: string
        }
        Insert: {
          assigned_at?: string
          position_id: string
          profile_id: string
          team_id: string
          team_role?: string
        }
        Update: {
          assigned_at?: string
          position_id?: string
          profile_id?: string
          team_id?: string
          team_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_member_positions_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "team_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_positions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_member_positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_positions: {
        Row: {
          created_at: string
          id: string
          name: string
          order: number
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          order?: number
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          order?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_positions_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      unavailability_ranges: {
        Row: {
          created_at: string
          end_date: string
          id: string
          profile_id: string
          reason: string | null
          start_date: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          profile_id: string
          reason?: string | null
          start_date: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          profile_id?: string
          reason?: string | null
          start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "unavailability_ranges_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_songs: {
        Row: {
          added_by: string
          id: string
          notes: string | null
          played_key: string
          position: number
          setlist_id: string
          song_version_id: string
        }
        Insert: {
          added_by: string
          id?: string
          notes?: string | null
          played_key: string
          position: number
          setlist_id: string
          song_version_id: string
        }
        Update: {
          added_by?: string
          id?: string
          notes?: string | null
          played_key?: string
          position?: number
          setlist_id?: string
          song_version_id?: string
        }
        Relationships: [
          { foreignKeyName: "setlist_songs_added_by_fkey"; columns: ["added_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "setlist_songs_setlist_id_fkey"; columns: ["setlist_id"]; referencedRelation: "setlists"; referencedColumns: ["id"] },
          { foreignKeyName: "setlist_songs_song_version_id_fkey"; columns: ["song_version_id"]; referencedRelation: "song_versions"; referencedColumns: ["id"] }
        ]
      }
      setlists: {
        Row: {
          created_at: string
          id: string
          service_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: string
        }
        Relationships: [
          { foreignKeyName: "setlists_service_id_fkey"; columns: ["service_id"]; referencedRelation: "services"; referencedColumns: ["id"] }
        ]
      }
      song_versions: {
        Row: {
          artist: string | null
          chord_sheet_url: string | null
          created_at: string
          created_by: string
          id: string
          is_original: boolean
          label: string
          song_id: string
          tempo: number | null
          written_key: string
        }
        Insert: {
          artist?: string | null
          chord_sheet_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          is_original?: boolean
          label: string
          song_id: string
          tempo?: number | null
          written_key: string
        }
        Update: {
          artist?: string | null
          chord_sheet_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          is_original?: boolean
          label?: string
          song_id?: string
          tempo?: number | null
          written_key?: string
        }
        Relationships: [
          { foreignKeyName: "song_versions_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "song_versions_song_id_fkey"; columns: ["song_id"]; referencedRelation: "songs"; referencedColumns: ["id"] }
        ]
      }
      songs: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          { foreignKeyName: "songs_created_by_fkey"; columns: ["created_by"]; referencedRelation: "profiles"; referencedColumns: ["id"] }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_admin: { Args: never; Returns: boolean }
      is_hospitality_or_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_logistics_or_admin: { Args: never; Returns: boolean }
      is_worship_write_allowed: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_setlist_viewer: { Args: { sid: string }; Returns: boolean }
      is_service_worship_leader: { Args: { sid: string }; Returns: boolean }
      get_worship_leader_service_ids: { Args: Record<PropertyKey, never>; Returns: string[] }
      request_hospitality_order: {
        Args: { p_service_id: string }
        Returns: number
      }
    }
    Enums: {
      hospitality_need_status: "needed" | "requested" | "fulfilled"
      inventory_condition: "good" | "needs_repair" | "out_of_service"
      profile_role: "admin" | "member" | "logistics" | "librarian" | "roster_maker"
      profile_status: "invited" | "active" | "on_leave" | "left"
      reservation_status:
        | "pending"
        | "approved"
        | "rejected"
        | "checked_out"
        | "returned"
        | "cancelled"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      inventory_condition: ["good", "needs_repair", "out_of_service"],
      profile_role: ["admin", "member", "logistics", "librarian", "roster_maker"],
      profile_status: ["invited", "active", "on_leave", "left"],
      reservation_status: [
        "pending",
        "approved",
        "rejected",
        "checked_out",
        "returned",
        "cancelled",
      ],
    },
  },
} as const

