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
      admin_focus: {
        Row: {
          campaign_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_focus_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_stipends: {
        Row: {
          agent_name: string
          amount_kes: number
          campaign_id: string
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
          campaign_id?: string
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
          campaign_id?: string
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
            foreignKeyName: "agent_stipends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
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
      area_notes: {
        Row: {
          area_key: string
          body: string
          campaign_id: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          area_key: string
          body: string
          campaign_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          area_key?: string
          body?: string
          campaign_id?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "area_notes_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "area_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_areas: {
        Row: {
          iebc_code: string | null
          key: string
          level: string
          name: string
          parent: string | null
        }
        Insert: {
          iebc_code?: string | null
          key: string
          level: string
          name: string
          parent?: string | null
        }
        Update: {
          iebc_code?: string | null
          key?: string
          level?: string
          name?: string
          parent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_areas_parent_fkey"
            columns: ["parent"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
        ]
      }
      atlas_candidates: {
        Row: {
          bloc: string
          election_id: string
          id: string
          name: string
          party: string | null
          seat: string
        }
        Insert: {
          bloc: string
          election_id: string
          id: string
          name: string
          party?: string | null
          seat: string
        }
        Update: {
          bloc?: string
          election_id?: string
          id?: string
          name?: string
          party?: string | null
          seat?: string
        }
        Relationships: [
          {
            foreignKeyName: "atlas_candidates_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "atlas_elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_candidates_seat_fkey"
            columns: ["seat"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
        ]
      }
      atlas_elections: {
        Row: {
          held_on: string
          id: string
          note: string | null
          race: string
          year: number
        }
        Insert: {
          held_on: string
          id: string
          note?: string | null
          race: string
          year: number
        }
        Update: {
          held_on?: string
          id?: string
          note?: string | null
          race?: string
          year?: number
        }
        Relationships: []
      }
      atlas_population: {
        Row: {
          adults: number
          area_key: string
          source_id: string
          total: number
          year: number
          young_adults: number
        }
        Insert: {
          adults: number
          area_key: string
          source_id: string
          total: number
          year: number
          young_adults: number
        }
        Update: {
          adults?: number
          area_key?: string
          source_id?: string
          total?: number
          year?: number
          young_adults?: number
        }
        Relationships: [
          {
            foreignKeyName: "atlas_population_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "atlas_population_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_register: {
        Row: {
          area_key: string
          registered: number
          source_id: string
          year: number
        }
        Insert: {
          area_key: string
          registered: number
          source_id: string
          year: number
        }
        Update: {
          area_key?: string
          registered?: number
          source_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "atlas_register_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "atlas_register_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_results: {
        Row: {
          area_key: string
          candidate_id: string
          source_id: string
          votes: number
        }
        Insert: {
          area_key: string
          candidate_id: string
          source_id: string
          votes: number
        }
        Update: {
          area_key?: string
          candidate_id?: string
          source_id?: string
          votes?: number
        }
        Relationships: [
          {
            foreignKeyName: "atlas_results_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "atlas_results_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "atlas_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_results_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_settings: {
        Row: {
          campaign_id: string
          home_area: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campaign_id?: string
          home_area: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string
          home_area?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_settings_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_settings_home_area_fkey"
            columns: ["home_area"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
        ]
      }
      atlas_sides: {
        Row: {
          bloc: string
          campaign_id: string
          election_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bloc: string
          campaign_id?: string
          election_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bloc?: string
          campaign_id?: string
          election_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_sides_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_sides_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "atlas_elections"
            referencedColumns: ["id"]
          },
        ]
      }
      atlas_sources: {
        Row: {
          id: string
          note: string | null
          publisher: string
          title: string
          url: string | null
        }
        Insert: {
          id: string
          note?: string | null
          publisher: string
          title: string
          url?: string | null
        }
        Update: {
          id?: string
          note?: string | null
          publisher?: string
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      atlas_turnout: {
        Row: {
          area_key: string
          cast_votes: number | null
          election_id: string
          registered: number | null
          rejected: number | null
          source_id: string
          valid: number | null
        }
        Insert: {
          area_key: string
          cast_votes?: number | null
          election_id: string
          registered?: number | null
          rejected?: number | null
          source_id: string
          valid?: number | null
        }
        Update: {
          area_key?: string
          cast_votes?: number | null
          election_id?: string
          registered?: number | null
          rejected?: number | null
          source_id?: string
          valid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "atlas_turnout_area_key_fkey"
            columns: ["area_key"]
            isOneToOne: false
            referencedRelation: "atlas_areas"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "atlas_turnout_election_id_fkey"
            columns: ["election_id"]
            isOneToOne: false
            referencedRelation: "atlas_elections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atlas_turnout_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "atlas_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      ballot_candidates: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          name: string
          ours: boolean
          party: string | null
          position: number
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          id?: string
          name: string
          ours?: boolean
          party?: string | null
          position: number
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          name?: string
          ours?: boolean
          party?: string | null
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "ballot_candidates_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience: Json
          body: string
          campaign_id: string
          channel: string
          client_key: string
          created_at: string
          created_by: string | null
          id: string
          matched: number
          recipients: number
        }
        Insert: {
          audience?: Json
          body: string
          campaign_id?: string
          channel?: string
          client_key: string
          created_at?: string
          created_by?: string | null
          id?: string
          matched?: number
          recipients?: number
        }
        Update: {
          audience?: Json
          body?: string
          campaign_id?: string
          channel?: string
          client_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          matched?: number
          recipients?: number
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_channels: {
        Row: {
          campaign_id: string
          created_at: string
          display: string | null
          id: string
          identifier: string | null
          kind: string
          note: string | null
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          display?: string | null
          id?: string
          identifier?: string | null
          kind: string
          note?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          display?: string | null
          id?: string
          identifier?: string | null
          kind?: string
          note?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_channels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_invites: {
        Row: {
          campaign_id: string
          created_at: string
          email: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["campaign_role"]
        }
        Insert: {
          campaign_id: string
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["campaign_role"]
        }
        Update: {
          campaign_id?: string
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["campaign_role"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_members: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["campaign_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["campaign_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["campaign_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sites: {
        Row: {
          campaign_id: string
          created_at: string
          draft: Json
          draft_rev: number
          id: string
          published: Json | null
          published_at: string | null
          published_by: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          draft?: Json
          draft_rev?: number
          id?: string
          published?: Json | null
          published_at?: string | null
          published_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          draft?: Json
          draft_rev?: number
          id?: string
          published?: Json | null
          published_at?: string | null
          published_by?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          candidate: string | null
          created_at: string
          host: string | null
          id: string
          level: string
          name: string
          owns_channels: boolean
          seat: string
          slug: string
          updated_at: string
        }
        Insert: {
          candidate?: string | null
          created_at?: string
          host?: string | null
          id?: string
          level?: string
          name: string
          owns_channels?: boolean
          seat: string
          slug: string
          updated_at?: string
        }
        Update: {
          candidate?: string | null
          created_at?: string
          host?: string | null
          id?: string
          level?: string
          name?: string
          owns_channels?: boolean
          seat?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      canvass_streets: {
        Row: {
          agent_name: string | null
          agent_phone: string | null
          campaign_id: string
          created_at: string
          id: string
          name: string
          sort: number
          updated_at: string
          ward_id: string
        }
        Insert: {
          agent_name?: string | null
          agent_phone?: string | null
          campaign_id?: string
          created_at?: string
          id?: string
          name: string
          sort?: number
          updated_at?: string
          ward_id: string
        }
        Update: {
          agent_name?: string | null
          agent_phone?: string | null
          campaign_id?: string
          created_at?: string
          id?: string
          name?: string
          sort?: number
          updated_at?: string
          ward_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvass_streets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvass_streets_ward_id_fkey"
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
          campaign_id: string
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
          campaign_id?: string
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
          campaign_id?: string
          created_at?: string
          disclosed?: boolean
          donor_name?: string
          donor_type?: string
          id?: string
          method?: string
          received_at?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_to: string | null
          author_handle: string | null
          author_name: string | null
          campaign_id: string
          channel: string
          created_at: string
          external_thread_id: string | null
          id: string
          issue: string | null
          last_message_at: string
          person_id: string | null
          platform: string
          sentiment: string | null
          sentiment_score: number | null
          snippet: string | null
          status: string
          subject: string | null
          tags: string[]
          unread: boolean
        }
        Insert: {
          assigned_to?: string | null
          author_handle?: string | null
          author_name?: string | null
          campaign_id?: string
          channel?: string
          created_at?: string
          external_thread_id?: string | null
          id?: string
          issue?: string | null
          last_message_at?: string
          person_id?: string | null
          platform?: string
          sentiment?: string | null
          sentiment_score?: number | null
          snippet?: string | null
          status?: string
          subject?: string | null
          tags?: string[]
          unread?: boolean
        }
        Update: {
          assigned_to?: string | null
          author_handle?: string | null
          author_name?: string | null
          campaign_id?: string
          channel?: string
          created_at?: string
          external_thread_id?: string | null
          id?: string
          issue?: string | null
          last_message_at?: string
          person_id?: string | null
          platform?: string
          sentiment?: string | null
          sentiment_score?: number | null
          snippet?: string | null
          status?: string
          subject?: string | null
          tags?: string[]
          unread?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
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
      diary_entries: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string | null
          day: string
          id: string
          kind: string
          note: string | null
          starts_at: string | null
          title: string
          updated_at: string
          ward_id: string | null
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          day: string
          id?: string
          kind?: string
          note?: string | null
          starts_at?: string | null
          title: string
          updated_at?: string
          ward_id?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          day?: string
          id?: string
          kind?: string
          note?: string | null
          starts_at?: string | null
          title?: string
          updated_at?: string
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diary_entries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diary_entries_ward_fkey"
            columns: ["ward_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "wards"
            referencedColumns: ["id", "campaign_id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_kes: number
          approved_at: string | null
          approved_by: string | null
          campaign_id: string
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
          approved_at?: string | null
          approved_by?: string | null
          campaign_id?: string
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
          approved_at?: string | null
          approved_by?: string | null
          campaign_id?: string
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
        Relationships: [
          {
            foreignKeyName: "expenses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      form_photos: {
        Row: {
          campaign_id: string
          caption: string | null
          from_phone: string
          id: string
          received_at: string
          station_id: string
          stream: number | null
          wa_media_id: string | null
          wa_message_id: string
        }
        Insert: {
          campaign_id?: string
          caption?: string | null
          from_phone: string
          id?: string
          received_at?: string
          station_id: string
          stream?: number | null
          wa_media_id?: string | null
          wa_message_id: string
        }
        Update: {
          campaign_id?: string
          caption?: string | null
          from_phone?: string
          id?: string
          received_at?: string
          station_id?: string
          stream?: number | null
          wa_media_id?: string | null
          wa_message_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_photos_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_photos_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "polling_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          campaign_id: string
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
          campaign_id?: string
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
          campaign_id?: string
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
            foreignKeyName: "incidents_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
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
      listening_alert_events: {
        Row: {
          alert_id: string | null
          body: string | null
          campaign_id: string
          channel: string
          created_at: string
          destination: string
          detail: string | null
          id: string
          mention_id: string | null
          status: string
          subject: string | null
        }
        Insert: {
          alert_id?: string | null
          body?: string | null
          campaign_id?: string
          channel: string
          created_at?: string
          destination: string
          detail?: string | null
          id?: string
          mention_id?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          alert_id?: string | null
          body?: string | null
          campaign_id?: string
          channel?: string
          created_at?: string
          destination?: string
          detail?: string | null
          id?: string
          mention_id?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listening_alert_events_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "listening_alerts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listening_alert_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listening_alert_events_mention_id_fkey"
            columns: ["mention_id"]
            isOneToOne: false
            referencedRelation: "listening_mentions"
            referencedColumns: ["id"]
          },
        ]
      }
      listening_alerts: {
        Row: {
          active: boolean
          campaign_id: string
          channel: string
          created_at: string
          destination: string
          frequency: string
          id: string
          keywords: string[]
          last_fired_at: string | null
          min_matches: number
          name: string
          sentiments: string[]
          topic_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_id?: string
          channel?: string
          created_at?: string
          destination: string
          frequency?: string
          id?: string
          keywords?: string[]
          last_fired_at?: string | null
          min_matches?: number
          name: string
          sentiments?: string[]
          topic_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          channel?: string
          created_at?: string
          destination?: string
          frequency?: string
          id?: string
          keywords?: string[]
          last_fired_at?: string | null
          min_matches?: number
          name?: string
          sentiments?: string[]
          topic_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listening_alerts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listening_alerts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "listening_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      listening_jobs: {
        Row: {
          detail: string | null
          key: string
          last_run_at: string | null
          locked_until: string | null
          paused_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          detail?: string | null
          key: string
          last_run_at?: string | null
          locked_until?: string | null
          paused_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          detail?: string | null
          key?: string
          last_run_at?: string | null
          locked_until?: string | null
          paused_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      listening_mentions: {
        Row: {
          author: string | null
          campaign_id: string
          comments_issue: string | null
          comments_negative: number | null
          comments_positive: number | null
          comments_read: number | null
          created_at: string
          domain: string | null
          found_at: string
          id: string
          issue: string | null
          published_at: string | null
          reach: number | null
          rival_id: string | null
          sentiment: string | null
          sentiment_score: number | null
          snippet: string | null
          source: string
          status: string
          title: string | null
          topic_id: string | null
          url: string
          ward: string | null
        }
        Insert: {
          author?: string | null
          campaign_id?: string
          comments_issue?: string | null
          comments_negative?: number | null
          comments_positive?: number | null
          comments_read?: number | null
          created_at?: string
          domain?: string | null
          found_at?: string
          id?: string
          issue?: string | null
          published_at?: string | null
          reach?: number | null
          rival_id?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          snippet?: string | null
          source?: string
          status?: string
          title?: string | null
          topic_id?: string | null
          url: string
          ward?: string | null
        }
        Update: {
          author?: string | null
          campaign_id?: string
          comments_issue?: string | null
          comments_negative?: number | null
          comments_positive?: number | null
          comments_read?: number | null
          created_at?: string
          domain?: string | null
          found_at?: string
          id?: string
          issue?: string | null
          published_at?: string | null
          reach?: number | null
          rival_id?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          snippet?: string | null
          source?: string
          status?: string
          title?: string | null
          topic_id?: string | null
          url?: string
          ward?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listening_mentions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listening_mentions_rival_id_fkey"
            columns: ["rival_id"]
            isOneToOne: false
            referencedRelation: "race_rivals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listening_mentions_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "listening_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      listening_topics: {
        Row: {
          active: boolean
          alert_feed_url: string | null
          campaign_id: string
          created_at: string
          exclude_terms: string[]
          id: string
          keywords: string[]
          kind: string
          label: string
          last_scanned_at: string | null
          query: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          alert_feed_url?: string | null
          campaign_id?: string
          created_at?: string
          exclude_terms?: string[]
          id?: string
          keywords?: string[]
          kind?: string
          label: string
          last_scanned_at?: string | null
          query: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          alert_feed_url?: string | null
          campaign_id?: string
          created_at?: string
          exclude_terms?: string[]
          id?: string
          keywords?: string[]
          kind?: string
          label?: string
          last_scanned_at?: string | null
          query?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listening_topics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attempts: number
          author_handle: string | null
          body: string
          broadcast_id: string | null
          campaign_id: string
          channel: string
          claim_id: string | null
          claimed_at: string | null
          conversation_id: string | null
          cost_kes: number
          created_at: string
          delivered_at: string | null
          direction: string
          error: string | null
          external_id: string | null
          id: string
          issue: string | null
          kind: string
          outbox_kind: string
          permalink: string | null
          person_id: string | null
          phone: string | null
          platform: string
          poll_id: string | null
          provider_ref: string | null
          read_at: string | null
          sent_at: string | null
          sentiment: string | null
          sentiment_score: number | null
          status: string
        }
        Insert: {
          attempts?: number
          author_handle?: string | null
          body: string
          broadcast_id?: string | null
          campaign_id?: string
          channel?: string
          claim_id?: string | null
          claimed_at?: string | null
          conversation_id?: string | null
          cost_kes?: number
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error?: string | null
          external_id?: string | null
          id?: string
          issue?: string | null
          kind?: string
          outbox_kind?: string
          permalink?: string | null
          person_id?: string | null
          phone?: string | null
          platform?: string
          poll_id?: string | null
          provider_ref?: string | null
          read_at?: string | null
          sent_at?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string
        }
        Update: {
          attempts?: number
          author_handle?: string | null
          body?: string
          broadcast_id?: string | null
          campaign_id?: string
          channel?: string
          claim_id?: string | null
          claimed_at?: string | null
          conversation_id?: string | null
          cost_kes?: number
          created_at?: string
          delivered_at?: string | null
          direction?: string
          error?: string | null
          external_id?: string | null
          id?: string
          issue?: string | null
          kind?: string
          outbox_kind?: string
          permalink?: string | null
          person_id?: string | null
          phone?: string | null
          platform?: string
          poll_id?: string | null
          provider_ref?: string | null
          read_at?: string | null
          sent_at?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
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
      morning_stories: {
        Row: {
          campaign_id: string
          created_at: string
          day: string
          edited_at: string | null
          edited_by: string | null
          id: string
          story: Json
          updated_at: string
          written_by: string
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          day: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          story: Json
          updated_at?: string
          written_by?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          day?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          story?: Json
          updated_at?: string
          written_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "morning_stories_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          building_id: string | null
          campaign_id: string
          consent_call: boolean
          consent_sms: boolean
          consent_whatsapp: boolean
          created_at: string
          door_no: number | null
          email: string | null
          full_name: string | null
          id: string
          language: string
          last_contacted_at: string | null
          last_inbound_at: string | null
          lat: number | null
          lng: number | null
          notes: string | null
          opted_out: boolean
          opted_out_at: string | null
          phone: string
          placed_at: string | null
          segment: string | null
          source: string
          street_id: string | null
          support_score: number
          tags: string[]
          updated_at: string
          ward_id: string | null
        }
        Insert: {
          building_id?: string | null
          campaign_id?: string
          consent_call?: boolean
          consent_sms?: boolean
          consent_whatsapp?: boolean
          created_at?: string
          door_no?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string
          last_contacted_at?: string | null
          last_inbound_at?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          phone: string
          placed_at?: string | null
          segment?: string | null
          source?: string
          street_id?: string | null
          support_score?: number
          tags?: string[]
          updated_at?: string
          ward_id?: string | null
        }
        Update: {
          building_id?: string | null
          campaign_id?: string
          consent_call?: boolean
          consent_sms?: boolean
          consent_whatsapp?: boolean
          created_at?: string
          door_no?: number | null
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string
          last_contacted_at?: string | null
          last_inbound_at?: string | null
          lat?: number | null
          lng?: number | null
          notes?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
          phone?: string
          placed_at?: string | null
          segment?: string | null
          source?: string
          street_id?: string | null
          support_score?: number
          tags?: string[]
          updated_at?: string
          ward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_street_id_fkey"
            columns: ["street_id"]
            isOneToOne: false
            referencedRelation: "canvass_streets"
            referencedColumns: ["id"]
          },
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
          accuracy_m: number | null
          actor: string | null
          building_id: string | null
          campaign_id: string
          channel: string | null
          client_id: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          lat: number | null
          lng: number | null
          person_id: string
        }
        Insert: {
          accuracy_m?: number | null
          actor?: string | null
          building_id?: string | null
          campaign_id?: string
          channel?: string | null
          client_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          lat?: number | null
          lng?: number | null
          person_id: string
        }
        Update: {
          accuracy_m?: number | null
          actor?: string | null
          building_id?: string | null
          campaign_id?: string
          channel?: string | null
          client_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          lat?: number | null
          lng?: number | null
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "person_events_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      person_imports: {
        Row: {
          campaign_id: string
          consent_count: number
          consent_source: string | null
          created_at: string
          created_by: string | null
          created_count: number
          filename: string
          id: string
          rows_total: number
          skipped_count: number
          source: string
          updated_count: number
        }
        Insert: {
          campaign_id?: string
          consent_count?: number
          consent_source?: string | null
          created_at?: string
          created_by?: string | null
          created_count?: number
          filename: string
          id?: string
          rows_total?: number
          skipped_count?: number
          source: string
          updated_count?: number
        }
        Update: {
          campaign_id?: string
          consent_count?: number
          consent_source?: string | null
          created_at?: string
          created_by?: string | null
          created_count?: number
          filename?: string
          id?: string
          rows_total?: number
          skipped_count?: number
          source?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "person_imports_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_invites: {
        Row: {
          campaign_id: string
          channel: string
          id: string
          person_id: string
          poll_id: string
          sent_at: string
        }
        Insert: {
          campaign_id?: string
          channel?: string
          id?: string
          person_id: string
          poll_id: string
          sent_at?: string
        }
        Update: {
          campaign_id?: string
          channel?: string
          id?: string
          person_id?: string
          poll_id?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_invites_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_invites_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_invites_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_responses: {
        Row: {
          campaign_id: string
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
          campaign_id?: string
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
          campaign_id?: string
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
            foreignKeyName: "poll_responses_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
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
          campaign_id: string
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
          campaign_id?: string
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
          campaign_id?: string
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
            foreignKeyName: "polling_stations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
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
          campaign_id: string
          channels: string[]
          closes_at: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          lang: string
          launched_at: string | null
          opens_at: string | null
          options: Json
          question: string
          question_sw: string | null
          reward: string | null
          reward_amount: number
          reward_method: string
          sample_target: number
          status: string
          updated_at: string
          weighting: boolean
        }
        Insert: {
          audience?: Json
          campaign_id?: string
          channels?: string[]
          closes_at?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lang?: string
          launched_at?: string | null
          opens_at?: string | null
          options?: Json
          question: string
          question_sw?: string | null
          reward?: string | null
          reward_amount?: number
          reward_method?: string
          sample_target?: number
          status?: string
          updated_at?: string
          weighting?: boolean
        }
        Update: {
          audience?: Json
          campaign_id?: string
          channels?: string[]
          closes_at?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lang?: string
          launched_at?: string | null
          opens_at?: string | null
          options?: Json
          question?: string
          question_sw?: string | null
          reward?: string | null
          reward_amount?: number
          reward_method?: string
          sample_target?: number
          status?: string
          updated_at?: string
          weighting?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "polls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
      race_polls: {
        Row: {
          approval: number | null
          campaign_id: string
          created_at: string
          created_by: string | null
          disapproval: number | null
          fieldwork_from: string | null
          fieldwork_to: string | null
          id: string
          margin: number | null
          pollster: string
          published_on: string
          sample_size: number | null
          shares: Json
          source_url: string
          undecided: number | null
        }
        Insert: {
          approval?: number | null
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          disapproval?: number | null
          fieldwork_from?: string | null
          fieldwork_to?: string | null
          id?: string
          margin?: number | null
          pollster: string
          published_on: string
          sample_size?: number | null
          shares: Json
          source_url: string
          undecided?: number | null
        }
        Update: {
          approval?: number | null
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          disapproval?: number | null
          fieldwork_from?: string | null
          fieldwork_to?: string | null
          id?: string
          margin?: number | null
          pollster?: string
          published_on?: string
          sample_size?: number | null
          shares?: Json
          source_url?: string
          undecided?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "race_polls_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      race_rivals: {
        Row: {
          campaign_id: string
          created_at: string
          facebook: string | null
          id: string
          is_us: boolean
          name: string
          office: string | null
          party: string | null
          search_as: string | null
          sort: number
          tiktok: string | null
          tone: string
          updated_at: string
          x: string | null
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          facebook?: string | null
          id?: string
          is_us?: boolean
          name: string
          office?: string | null
          party?: string | null
          search_as?: string | null
          sort?: number
          tiktok?: string | null
          tone?: string
          updated_at?: string
          x?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          facebook?: string | null
          id?: string
          is_us?: boolean
          name?: string
          office?: string | null
          party?: string | null
          search_as?: string | null
          sort?: number
          tiktok?: string | null
          tone?: string
          updated_at?: string
          x?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "race_rivals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          hits: number
          key: string
          window_start: string
        }
        Insert: {
          hits: number
          key: string
          window_start: string
        }
        Update: {
          hits?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      search_interest: {
        Row: {
          campaign_id: string
          created_at: string
          day: string
          geo: string
          id: string
          kind: string
          series: Json
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          day: string
          geo: string
          id?: string
          kind: string
          series: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          day?: string
          geo?: string
          id?: string
          kind?: string
          series?: Json
        }
        Relationships: [
          {
            foreignKeyName: "search_interest_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          campaign_id: string
          colour: string | null
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          campaign_id?: string
          colour?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          campaign_id?: string
          colour?: string | null
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      site_versions: {
        Row: {
          campaign_id: string
          content: Json
          id: string
          published_at: string
          published_by: string | null
        }
        Insert: {
          campaign_id?: string
          content: Json
          id?: string
          published_at?: string
          published_by?: string | null
        }
        Update: {
          campaign_id?: string
          content?: Json
          id?: string
          published_at?: string
          published_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_versions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          campaign_id: string
          created_at: string
          display_name: string | null
          external_id: string | null
          handle: string
          id: string
          last_event_at: string | null
          live: boolean
          note: string | null
          platform: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string
          created_at?: string
          display_name?: string | null
          external_id?: string | null
          handle: string
          id?: string
          last_event_at?: string | null
          live?: boolean
          note?: string | null
          platform: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          display_name?: string | null
          external_id?: string | null
          handle?: string
          id?: string
          last_event_at?: string | null
          live?: boolean
          note?: string | null
          platform?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      social_credits: {
        Row: {
          budget: string
          day: string
          used: number
        }
        Insert: {
          budget: string
          day: string
          used?: number
        }
        Update: {
          budget?: string
          day?: string
          used?: number
        }
        Relationships: []
      }
      stream_results: {
        Row: {
          campaign_id: string
          channel: string
          corrected: boolean
          filed_at: string
          filed_by: string
          id: string
          over_register: boolean
          rejected: number
          station_id: string
          stream: number
          superseded_at: string | null
          valid_votes: number
          votes: Json
        }
        Insert: {
          campaign_id?: string
          channel: string
          corrected?: boolean
          filed_at?: string
          filed_by: string
          id?: string
          over_register?: boolean
          rejected: number
          station_id: string
          stream: number
          superseded_at?: string | null
          valid_votes: number
          votes: Json
        }
        Update: {
          campaign_id?: string
          channel?: string
          corrected?: boolean
          filed_at?: string
          filed_by?: string
          id?: string
          over_register?: boolean
          rejected?: number
          station_id?: string
          stream?: number
          superseded_at?: string | null
          valid_votes?: number
          votes?: Json
        }
        Relationships: [
          {
            foreignKeyName: "stream_results_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_results_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "polling_stations"
            referencedColumns: ["id"]
          },
        ]
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
          campaign_id: string
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
          campaign_id?: string
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
          campaign_id?: string
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
        Relationships: [
          {
            foreignKeyName: "wards_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_webhook_events: {
        Row: {
          attempts: number
          delivery_id: string
          event: string
          id: string
          payload: Json
          processed_at: string | null
          processing_error: string | null
          received_at: string
        }
        Insert: {
          attempts?: number
          delivery_id: string
          event: string
          id?: string
          payload: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Update: {
          attempts?: number
          delivery_id?: string
          event?: string
          id?: string
          payload?: Json
          processed_at?: string | null
          processing_error?: string | null
          received_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_person: {
        Args: {
          _consent: Json
          _consent_source: string
          _full_name: string
          _language: string
          _notes: string
          _phone: string
          _segment: string
          _support_score: number
          _ward_id: string
        }
        Returns: Json
      }
      approve_expense: { Args: { _expense_id: string }; Returns: Json }
      assign_station_agent: {
        Args: { _name: string; _phone: string; _station_id: string }
        Returns: undefined
      }
      audience_counts: { Args: never; Returns: Json }
      audience_estimate: { Args: { _audience: Json }; Returns: Json }
      begin_person_import: {
        Args: {
          _consent_source: string
          _filename: string
          _rows_total: number
          _source: string
        }
        Returns: string
      }
      broadcast_estimate: { Args: { _audience: Json }; Returns: Json }
      campaign_for_channel: {
        Args: { _identifier: string; _kind: string }
        Returns: string
      }
      can_admit: {
        Args: { _campaign: string; _user_id: string }
        Returns: boolean
      }
      channel_campaign: { Args: never; Returns: string }
      create_campaign: {
        Args: {
          _candidate: string
          _host: string
          _level: string
          _name: string
          _seat: string
          _slug: string
        }
        Returns: string
      }
      file_stream_result: {
        Args: {
          _channel: string
          _phone: string
          _rejected: number
          _station_id: string
          _stream: number
          _votes: number[]
        }
        Returns: Json
      }
      focus_campaign: { Args: { _campaign: string }; Returns: undefined }
      groundwork_schema_version: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_people_chunk: {
        Args: { _import_id: string; _rows: Json }
        Returns: Json
      }
      in_broadcast_audience: {
        Args: {
          _audience: Json
          _segment: string
          _support: number
          _ward_id: string
        }
        Returns: boolean
      }
      in_poll_audience: {
        Args: { _audience: Json; _segment: string; _ward_id: string }
        Returns: boolean
      }
      invite_member: {
        Args: {
          _campaign: string
          _email: string
          _role: Database["public"]["Enums"]["campaign_role"]
        }
        Returns: string
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      launch_poll: {
        Args: { _poll_id: string; _sms_body: string }
        Returns: Json
      }
      my_campaign: { Args: never; Returns: string }
      my_campaign_role: { Args: never; Returns: string }
      outbox_block_reason: {
        Args: {
          _channel: string
          _consent_sms: boolean
          _consent_whatsapp: boolean
          _kind: string
          _opted_out: boolean
        }
        Returns: string
      }
      outbox_mark_submitting: {
        Args: { _claim: string; _ids: string[] }
        Returns: string[]
      }
      outbox_record: {
        Args: { _claim: string; _results: Json }
        Returns: number
      }
      outbox_release: {
        Args: { _claim: string; _ids: string[] }
        Returns: number
      }
      parse_import_rows: {
        Args: { _consent_stated: boolean; _rows: Json }
        Returns: {
          call: boolean
          full_name: string
          language: string
          phone: string
          segment: string
          sms: boolean
          wa: boolean
          ward_id: string
        }[]
      }
      poll_tallies: { Args: { _poll_id: string }; Returns: Json }
      process_outbox: {
        Args: { _daily_cap?: number; _limit?: number; _live?: boolean }
        Returns: Json
      }
      publish_site: { Args: never; Returns: string }
      queue_broadcast: {
        Args: { _audience: Json; _body: string; _client_key: string }
        Returns: Json
      }
      race_share_total: { Args: { _shares: Json }; Returns: number }
      race_shares_ok: { Args: { _shares: Json }; Returns: boolean }
      rate_limit_hit: {
        Args: { _key: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      record_door: {
        Args: {
          _client_id: string
          _consent: Json
          _consent_source: string
          _issue: string
          _new: Json
          _outcome: string
          _person_id: string
          _place?: Json
          _support: number
          _visited_at: string
        }
        Returns: Json
      }
      record_form_photo: {
        Args: {
          _caption: string
          _code: string
          _phone: string
          _stream: number
          _wa_media_id: string
          _wa_message_id: string
        }
        Returns: Json
      }
      remove_member: { Args: { _user_id: string }; Returns: undefined }
      request_campaign_access: { Args: { _slug: string }; Returns: string }
      restore_site_version: { Args: { _version: string }; Returns: number }
      save_site_draft: { Args: { _draft: Json; _rev: number }; Returns: number }
      set_ballot: { Args: { _candidates: Json }; Returns: number }
      set_member_role: {
        Args: {
          _role: Database["public"]["Enums"]["campaign_role"]
          _user_id: string
        }
        Returns: undefined
      }
      site_editor: { Args: never; Returns: string }
      street_walk: {
        Args: { _street_id: string }
        Returns: {
          door_no: number
          full_name: string
          id: string
          last_contacted_at: string
          last_outcome: string
          last_visit_at: string
          phone_masked: string
          segment: string
          support_score: number
        }[]
      }
      take_social_credits: {
        Args: { _budget: string; _cap: number; _n: number }
        Returns: boolean
      }
      unpublish_site: { Args: never; Returns: undefined }
      walk_list: {
        Args: { _limit?: number; _ward_id: string }
        Returns: {
          full_name: string
          id: string
          last_contacted_at: string
          last_outcome: string
          last_visit_at: string
          phone_masked: string
          segment: string
          support_score: number
        }[]
      }
      ward_map: {
        Args: { _ward_id: string }
        Returns: {
          building_id: string
          consent_sms: boolean
          full_name: string
          id: string
          last_contacted_at: string
          last_issue: string
          last_outcome: string
          last_visit_at: string
          lat: number
          lng: number
          opted_out: boolean
          phone_masked: string
          segment: string
          support_score: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "organiser" | "agent" | "viewer"
      campaign_role: "candidate" | "manager" | "organiser" | "agent" | "pending"
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
      campaign_role: ["candidate", "manager", "organiser", "agent", "pending"],
    },
  },
} as const
