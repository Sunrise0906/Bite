// Supabase Database 类型。基于 src/lib/db/types.ts 中的领域类型构造。
// schema 变更后请同步更新；后续可被 `supabase gen types typescript` 生成的类型替换。

import type {
  List,
  ListMember,
  Place,
  Profile,
  Recommendation,
  VisitLog,
} from "@/lib/db/types";

type Relationships = readonly [];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Pick<Profile, "id" | "email"> & Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: Relationships;
      };
      lists: {
        Row: List;
        Insert: {
          name: string;
          owner_id: string;
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<List>;
        Relationships: Relationships;
      };
      list_members: {
        Row: ListMember;
        Insert: {
          list_id: string;
          user_id: string;
          role: ListMember["role"];
          invited_by?: string | null;
          created_at?: string;
        };
        Update: Partial<ListMember>;
        Relationships: Relationships;
      };
      places: {
        Row: Place;
        Insert: Pick<Place, "list_id" | "name" | "address" | "created_by"> &
          Partial<Place>;
        Update: Partial<Place>;
        Relationships: Relationships;
      };
      visit_logs: {
        Row: VisitLog;
        Insert: Pick<VisitLog, "place_id" | "user_id" | "sentiment"> &
          Partial<VisitLog>;
        Update: Partial<VisitLog>;
        Relationships: Relationships;
      };
      recommendations: {
        Row: Recommendation;
        Insert: Pick<
          Recommendation,
          "from_user_id" | "to_user_id" | "place_data"
        > &
          Partial<Recommendation>;
        Update: Partial<Recommendation>;
        Relationships: Relationships;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      list_member_role: ListMember["role"];
      place_status: Place["status"];
      place_price: NonNullable<Place["price_range"]>;
      place_source: Place["source"];
      visit_sentiment: VisitLog["sentiment"];
      recommendation_status: Recommendation["status"];
    };
    CompositeTypes: Record<string, never>;
  };
};
