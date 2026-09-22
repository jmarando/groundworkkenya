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
      agent_stipends: {
        Row: {
          agent_name: string
          amount_kes: number
          created_at: string
          days: number
          id: string
          method: string
          paid_at: string | null
          phone: string | null
          rate_kes: number
          reference: string | null
          role: string
          station_id: string | null
          status: string
          updated_at: string
          ward_id: string | null
        }
        Insert: {
          agent_name: string
          amount_kes?: number
          created_at?: string
          days?: number
          id?: string
          method?: string
          paid_at?: string | null
          phone?: string | null
          rate_kes?: number
          reference?: string | null
          role?: string
          station_id?: string | null
          status?: string
          updated_at?: string
          ward_id?: string | null
        }
        Update: {
          agent_name?: string
          amount_kes?: number
          created_at?: string
          days?: number
          id?: string
          method?: string
          paid_at?: string | null
          phone?: string | null
          rate_kes?: number
          reference?: string | null
          role?: string
          station_id?: string | null
          status?: string
          updated_at?: string
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_stipends_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "polling_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_stipends_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          amount_kes: number
          created_at: string
          disclosed: boolean
          donor_name: string
          donor_type: string
          id: string
          method: string
          received_at: string
          reference: string | null
        }
        Insert: {
          amount_kes: number
          created_at?: string
          disclosed?: boolean
          donor_name: string
          donor_type?: string
          id?: string
          method?: string
          received_at?: string
          reference?: string | null
        }
        Update: {
          amount_kes?: number
          created_at?: string
          disclosed?: boolean
          donor_name?: string
          donor_type?: string
          id?: string
          method?: string
          received_at?: string
          reference?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          assigned_to: string | null
          channel: string
          created_at: string
          id: string
          last_message_at: string
          person_id: string | null
          snippet: string | null
          status: string
          subject: string | null
          tags: string[]
          unread: boolean
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string
          person_id?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          tags?: string[]
          unread?: boolean
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          created_at?: string
          id?: string
          last_message_at?: string
          person_id?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          tags?: string[]
          unread?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "conversations_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_leads: {
        Row: {
          county: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string
          seat: string | null
        }
        Insert: {
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone: string
          seat?: string | null
        }
        Update: {
          county?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string
          seat?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_kes: number
          category: string
          created_at: string
          description: string
          id: string
          incurred_at: string
          reference: string | null
          status: string
          statutory: boolean
          vendor: string | null
        }
        Insert: {
          amount_kes: number
          category?: string
          created_at?: string
          description: string
          id?: string
          incurred_at?: string
          reference?: string | null
          status?: string
          statutory?: boolean
          vendor?: string | null
        }
        Update: {
          amount_kes?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          incurred_at?: string
          reference?: string | null
          status?: string
          statutory?: boolean
          vendor?: string | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          occurred_at: string
          reported_by: string | null
          severity: string
          station_id: string | null
          status: string
          title: string
          ward_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          occurred_at?: string
          reported_by?: string | null
          severity?: string
          station_id?: string | null
          status?: string
          title: string
          ward_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          occurred_at?: string
          reported_by?: string | null
          severity?: string
          station_id?: string | null
          status?: string
          title?: string
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "polling_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: string
          cost_kes: number
          created_at: string
          direction: string
          error: string | null
          id: string
          person_id: string | null
          phone: string | null
          poll_id: string | null
          provider_ref: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          body: string
          channel?: string
          cost_kes?: number
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          person_id?: string | null
          phone?: string | null
          poll_id?: string | null
          provider_ref?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          body?: string
          channel?: string
          cost_kes?: number
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          person_id?: string | null
          phone?: string | null
          poll_id?: string | null
          provider_ref?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          consent_call: boolean
          consent_sms: boolean
          consent_whatsapp: boolean
          created_at: string
          full_name: string | null
          id: string
          language: string
          last_contacted_at: string | null
          notes: string | null
          opted_out: boolean
          phone: string
          segment: string | null
          source: string
          support_score: number
          tags: string[]
          updated_at: string
          ward_id: string | null
        }
        Insert: {
          consent_call?: boolean
          consent_sms?: boolean
          consent_whatsapp?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          language?: string
          last_contacted_at?: string | null
          notes?: string | null
          opted_out?: boolean
          phone: string
          segment?: string | null
          source?: string
          support_score?: number
          tags?: string[]
          updated_at?: string
          ward_id?: string | null
        }
        Update: {
          consent_call?: boolean
          consent_sms?: boolean
          consent_whatsapp?: boolean
          created_at?: string
          full_name?: string | null
          id?: string
          language?: string
          last_contacted_at?: string | null
          notes?: string | null
          opted_out?: boolean
          phone?: string
          segment?: string | null
          source?: string
          support_score?: number
          tags?: string[]
          updated_at?: string
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      person_events: {
        Row: {
          actor: string | null
          channel: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          person_id: string
        }
        Insert: {
          actor?: string | null
          channel?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          person_id: string
        }
        Update: {
          actor?: string | null
          channel?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_responses: {
        Row: {
          channel: string
          created_at: string
          free_text: string | null
          id: string
          option_key: string | null
          person_id: string | null
          poll_id: string
          ward_id: string | null
          weight: number
        }
        Insert: {
          channel?: string
          created_at?: string
          free_text?: string | null
          id?: string
          option_key?: string | null
          person_id?: string | null
          poll_id: string
          ward_id?: string | null
          weight?: number
        }
        Update: {
          channel?: string
          created_at?: string
          free_text?: string | null
          id?: string
          option_key?: string | null
          person_id?: string | null
          poll_id?: string
          ward_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "poll_responses_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_responses_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      polling_stations: {
        Row: {
          agent_name: string | null
          agent_phone: string | null
          code: string
          created_at: string
          id: string
          name: string
          registered_voters: number
          reported_at: string | null
          results: Json | null
          status: string
          streams: number
          turnout_reported: number | null
          ward_id: string | null
        }
        Insert: {
          agent_name?: string | null
          agent_phone?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          registered_voters?: number
          reported_at?: string | null
          results?: Json | null
          status?: string
          streams?: number
          turnout_reported?: number | null
          ward_id?: string | null
        }
        Update: {
          agent_name?: string | null
          agent_phone?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          registered_voters?: number
          reported_at?: string | null
          results?: Json | null
          status?: string
          streams?: number
          turnout_reported?: number | null
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "polling_stations_ward_id_fkey"
            columns: ["ward_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          audience: Json
          channels: string[]
          closes_at: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          opens_at: string | null
          options: Json
          question: string
          reward: string | null
          sample_target: number
          status: string
          updated_at: string
        }
        Insert: {
          audience?: Json
          channels?: string[]
          closes_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          opens_at?: string | null
          options?: Json
          question: string
          reward?: string | null
          sample_target?: number
          status?: string
          updated_at?: string
        }
        Update: {
          audience?: Json
          channels?: string[]
          closes_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          opens_at?: string | null
          options?: Json
          question?: string
          reward?: string | null
          sample_target?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          colour: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          colour?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          colour?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wards: {
        Row: {
          constituency: string
          created_at: string
          id: string
          map_x: number | null
          map_y: number | null
          name: string
          registered_voters: number
          slug: string
          supporters: number
          target_votes: number
        }
        Insert: {
          constituency: string
          created_at?: string
          id?: string
          map_x?: number | null
          map_y?: number | null
          name: string
          registered_voters?: number
          slug: string
          supporters?: number
          target_votes?: number
        }
        Update: {
          constituency?: string
          created_at?: string
          id?: string
          map_x?: number | null
          map_y?: number | null
          name?: string
          registered_voters?: number
          slug?: string
          supporters?: number
          target_votes?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "manager" | "organiser" | "agent" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "manager", "organiser", "agent", "viewer"],
    },
  },
} as const
