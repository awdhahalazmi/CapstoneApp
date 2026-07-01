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
      check_ins: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_private: boolean
          note: string | null
          place_name: string
          rating: number | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_private?: boolean
          note?: string | null
          place_name: string
          rating?: number | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_private?: boolean
          note?: string | null
          place_name?: string
          rating?: number | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "check_ins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          friend_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          friend_id: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          friend_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_availability: {
        Row: {
          created_at: string | null
          date: string
          group_id: string
          id: string
          time_slot: string
          user_id: string
          user_name: string
        }
        Insert: {
          created_at?: string | null
          date: string
          group_id: string
          id?: string
          time_slot: string
          user_id: string
          user_name: string
        }
        Update: {
          created_at?: string | null
          date?: string
          group_id?: string
          id?: string
          time_slot?: string
          user_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_availability_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          added_at: string
          group_id: string
          member_id: string
        }
        Insert: {
          added_at?: string
          group_id: string
          member_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          created_at: string
          group_id: string
          id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          group_id: string
          id?: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          group_id?: string
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_places: {
        Row: {
          added_by: string
          added_by_name: string
          category: string
          created_at: string | null
          description: string | null
          group_id: string
          id: string
          lat: number
          lng: number
          title: string
        }
        Insert: {
          added_by: string
          added_by_name: string
          category?: string
          created_at?: string | null
          description?: string | null
          group_id: string
          id?: string
          lat: number
          lng: number
          title: string
        }
        Update: {
          added_by?: string
          added_by_name?: string
          category?: string
          created_at?: string | null
          description?: string | null
          group_id?: string
          id?: string
          lat?: number
          lng?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_places_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_places_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          emoji: string
          id: string
          is_public: boolean
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          id: string
          group_id: string
          title: string
          description: string | null
          place_name: string | null
          place_lat: number | null
          place_lng: number | null
          event_date: string | null
          event_time: string | null
          poll_summary: string | null
          source_poll_id: string | null
          wa_jid: string | null
          wa_message_id: string | null
          sent_at: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          title: string
          description?: string | null
          place_name?: string | null
          place_lat?: number | null
          place_lng?: number | null
          event_date?: string | null
          event_time?: string | null
          poll_summary?: string | null
          source_poll_id?: string | null
          wa_jid?: string | null
          wa_message_id?: string | null
          sent_at?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          title?: string
          description?: string | null
          place_name?: string | null
          place_lat?: number | null
          place_lng?: number | null
          event_date?: string | null
          event_time?: string | null
          poll_summary?: string | null
          source_poll_id?: string | null
          wa_jid?: string | null
          wa_message_id?: string | null
          sent_at?: string | null
          created_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_source_poll_id_fkey"
            columns: ["source_poll_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reminders: {
        Row: {
          id: string
          event_id: string
          remind_at: string
          label: string
          status: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          remind_at: string
          label: string
          status?: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          remind_at?: string
          label?: string
          status?: string
          created_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reminders_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          read: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          message: string
          read?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          read?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      place_votes: {
        Row: {
          created_at: string | null
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "place_votes_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "group_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      places: {
        Row: {
          ai_reason: string | null
          area: string | null
          category: string | null
          created_at: string
          id: string
          image_gradient: string | null
          name: string
          price_level: number | null
          rating: number | null
          tags: string[]
        }
        Insert: {
          ai_reason?: string | null
          area?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_gradient?: string | null
          name: string
          price_level?: number | null
          rating?: number | null
          tags?: string[]
        }
        Update: {
          ai_reason?: string | null
          area?: string | null
          category?: string | null
          created_at?: string
          id?: string
          image_gradient?: string | null
          name?: string
          price_level?: number | null
          rating?: number | null
          tags?: string[]
        }
        Relationships: []
      }
      planned_outings: {
        Row: {
          created_at: string
          created_by: string
          group_id: string | null
          id: string
          notes: string | null
          place_name: string
          planned_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          group_id?: string | null
          id?: string
          notes?: string | null
          place_name: string
          planned_at: string
        }
        Update: {
          created_at?: string
          created_by?: string
          group_id?: string | null
          id?: string
          notes?: string | null
          place_name?: string
          planned_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_outings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_outings_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability_status: string
          avatar_url: string | null
          city: string | null
          created_at: string
          id: string
          interests: string[]
          name: string
          updated_at: string
          username: string | null
        }
        Insert: {
          availability_status?: string
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          id: string
          interests?: string[]
          name?: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          availability_status?: string
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          id?: string
          interests?: string[]
          name?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      whatsapp_group_links: {
        Row: {
          group_id: string
          id: string
          synced_at: string | null
          user_id: string
          wa_jid: string
          wa_name: string
          wa_participant_count: number | null
        }
        Insert: {
          group_id: string
          id?: string
          synced_at?: string | null
          user_id: string
          wa_jid: string
          wa_name: string
          wa_participant_count?: number | null
        }
        Update: {
          group_id?: string
          id?: string
          synced_at?: string | null
          user_id?: string
          wa_jid?: string
          wa_name?: string
          wa_participant_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_group_links_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_group_links_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_polls: {
        Row: {
          created_at: string | null
          created_by: string | null
          enc_key: string | null
          group_id: string
          id: string
          options: Json
          question: string
          vote_counts: Json | null
          voter_map: Json | null
          wa_jid: string
          wa_message_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          enc_key?: string | null
          group_id: string
          id?: string
          options: Json
          question: string
          vote_counts?: Json | null
          voter_map?: Json | null
          wa_jid: string
          wa_message_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          enc_key?: string | null
          group_id?: string
          id?: string
          options?: Json
          question?: string
          vote_counts?: Json | null
          voter_map?: Json | null
          wa_jid?: string
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_polls_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_active_polls: {
        Args: never
        Returns: {
          enc_key: string
          group_id: string
          options: Json
          wa_message_id: string
        }[]
      }
      update_poll_votes: {
        Args: { p_vote_counts: Json; p_wa_message_id: string }
        Returns: undefined
      }
      username_available: { Args: { p_username: string }; Returns: boolean }
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
