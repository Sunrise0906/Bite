// 领域模型类型。schema 变更时同步更新；后续可被 supabase gen types 生成的类型替换。

export type Profile = {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ListMemberRole = "co_owner" | "viewer";

export type List = {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type ListMember = {
  list_id: string;
  user_id: string;
  role: ListMemberRole;
  invited_by: string | null;
  created_at: string;
};

export type PlaceStatus = "want_to_go" | "visited" | "archived";
export type PlacePrice = "$" | "$$" | "$$$" | "$$$$";
export type PlaceSource =
  | "manual"
  | "xhs"
  | "ai_extract"
  | "google_places"
  | "yelp";

export type PlaceReason = { user_id: string; text: string };

export type Place = {
  id: string;
  list_id: string;
  name: string;
  address: string;
  cuisine: string[];
  price_range: PlacePrice | null;
  status: PlaceStatus;
  reasons: PlaceReason[];
  occasions: string[];
  recommended_by: string | null;
  tags: string[];
  source: PlaceSource;
  source_url: string | null;
  google_place_id: string | null;
  lat: number | null;
  lng: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type VisitSentiment = "will_return" | "okay" | "wont_return";

export type VisitLog = {
  id: string;
  place_id: string;
  user_id: string;
  visited_at: string;
  sentiment: VisitSentiment;
  star_rating: number | null;
  note: string | null;
  photos: string[];
  companions: string | null;
  created_at: string;
  updated_at: string;
};

export type RecommendationStatus = "pending" | "accepted" | "declined";

export type Recommendation = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  place_data: Partial<Place> & { name: string; address: string };
  status: RecommendationStatus;
  created_at: string;
  resolved_at: string | null;
};
