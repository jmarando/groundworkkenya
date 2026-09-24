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
      broadcasts: {
        Row: {
          audience: Json
          body: string
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
          channel?: string
          client_key?: string
          created_at?: string
          created_by?: string | null
          id?: string
          matched?: number
          recipients?: number
        }
        Relationships: []
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
          author_handle: string | null
          author_name: string | null
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
          approved_at: string | null
          approved_by: string | null
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
      listening_alert_events: {
        Row: {
          alert_id: string | null
          body: string | null
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
          created_at: string
          domain: string | null
          found_at: string
          id: string
          issue: string | null
          published_at: string | null
          reach: number | null
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
          created_at?: string
          domain?: string | null
          found_at?: string
          id?: string
          issue?: string | null
          published_at?: string | null
          reach?: number | null
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
          created_at?: string
          domain?: string | null
          found_at?: string
          id?: string
          issue?: string | null
          published_at?: string | null
          reach?: number | null
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
        Relationships: []
      }
      messages: {
        Row: {
          attempts: number
          author_handle: string | null
          body: string
          broadcast_id: string | null
          channel: string
          claimed_at: string | null
          conversation_id: string | null
          cost_kes: number
          created_at: string
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
          channel?: string
          claimed_at?: string | null
          conversation_id?: string | null
          cost_kes?: number
          created_at?: string
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
          channel?: string
          claimed_at?: string | null
          conversation_id?: string | null
          cost_kes?: number
          created_at?: string
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
          sent_at?: string | null
          sentiment?: string | null
          sentiment_score?: number | null
          status?: string
        }
        Relationships: [
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
          last_inbound_at: string | null
          notes: string | null
          opted_out: boolean
          opted_out_at: string | null
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
          last_inbound_at?: string | null
          notes?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
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
          last_inbound_at?: string | null
          notes?: string | null
          opted_out?: boolean
          opted_out_at?: string | null
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
          client_id: string | null
          created_at: string
          detail: string | null
          id: string
          kind: string
          person_id: string
        }
        Insert: {
          actor?: string | null
          channel?: string | null
          client_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          person_id: string
        }
        Update: {
          actor?: string | null
          channel?: string | null
          client_id?: string | null
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
      person_imports: {
        Row: {
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
        Relationships: []
      }
      poll_invites: {
        Row: {
          channel: string
          id: string
          person_id: string
          poll_id: string
          sent_at: string
        }
        Insert: {
          channel?: string
          id?: string
          person_id: string
          poll_id: string
          sent_at?: string
        }
        Update: {
          channel?: string
          id?: string
          person_id?: string
          poll_id?: string
          sent_at?: string
        }
        Relationships: [
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
      social_accounts: {
        Row: {
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
      add_person: {
        Args: {
          _consent: Json
          _consent_source: string
          _full_name: string
          _language: string
          _notes: string
          _phone: string
          _segment: string | null
          _support_score: number | null
          _ward_id: string | null
        }
        Returns: Json
      }
      approve_expense: { Args: { _expense_id: string }; Returns: Json }
      audience_counts: { Args: never; Returns: Json }
      audience_estimate: { Args: { _audience: Json }; Returns: Json }
      begin_person_import: {
        Args: { _consent_source: string; _filename: string; _rows_total: number; _source: string }
        Returns: string
      }
      broadcast_estimate: { Args: { _audience: Json }; Returns: Json }
      groundwork_schema_version: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_people_chunk: { Args: { _import_id: string; _rows: Json }; Returns: Json }
      in_broadcast_audience: {
        Args: { _audience: Json; _segment: string; _support: number; _ward_id: string }
        Returns: boolean
      }
      in_poll_audience: {
        Args: { _audience: Json; _segment: string; _ward_id: string }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      launch_poll: { Args: { _poll_id: string; _sms_body: string }; Returns: Json }
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
      poll_tallies: { Args: { _poll_id: string }; Returns: Json }
      process_outbox: { Args: { _limit?: number; _live?: boolean }; Returns: Json }
      queue_broadcast: {
        Args: { _audience: Json; _body: string; _client_key: string }
        Returns: Json
      }
      record_door: {
        Args: {
          _client_id: string
          _consent: Json
          _consent_source: string
          _issue: string
          _new: Json
          _outcome: string
          _person_id: string | null
          _support: number | null
          _visited_at: string
        }
        Returns: Json
      }
      set_member_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      walk_list: {
        Args: { _limit?: number; _ward_id: string }
        Returns: {
          full_name: string | null
          id: string
          last_contacted_at: string | null
          last_outcome: string | null
          last_visit_at: string | null
          phone_masked: string
          segment: string | null
          support_score: number
        }[]
      }
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
