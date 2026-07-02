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
  /** 清单领域：food 吃 / drink 喝 / activity 玩 / other（sql/0016，默认 food） */
  category: "food" | "drink" | "activity" | "other";
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
  // Google Maps 口碑（enrichPlacesFromGoogle 拉取，见 sql/0012）
  google_rating: number | null;
  google_rating_count: number | null;
  google_maps_uri: string | null;
  lat: number | null;
  lng: number | null;
  // AI 综合判断 / 评论区交叉信号 / 客观口碑提醒
  // 由 LLM 在抓取小红书帖子或自由文本时生成；用户可编辑
  notes: string | null;
  // 招牌 / 网友推荐的具体菜（AI 抽取时提取，见 sql/0012）
  dishes: string[];
  // 图片 URL 数组（XHS 抓的所有图 / 用户手动贴的）。第一张默认为封面
  photo_urls: string[];
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
