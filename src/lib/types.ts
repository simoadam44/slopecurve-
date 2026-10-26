export interface Game {
  id: string;
  title: string;
  slug: string;
  game_url: string;
  thumbnail_url: string;
  icon_url?: string | null;
  short_description: string;
  long_description: string;
  how_to_play?: string | null;
  controls?: string | null;
  tips?: string | null;
  faqs?: string | null;
  category_slug: string;
  category_name?: string;
  seo_title?: string | null;
  meta_description?: string | null;
  focus_keyword?: string | null;
  related_keywords?: string | null;
  canonical_url?: string | null;
  social_image?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  noindex?: number;
  status: "draft" | "published" | "archived";
  is_featured: number;
  is_new: number;
  is_hot: number;
  sort_order: number;
  published_at?: string | null;
  allow_fullscreen: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image_url?: string | null;
  seo_title?: string | null;
  meta_description?: string | null;
  status: "draft" | "published";
}

export interface Comment {
  id: string;
  game_id: string;
  display_name: string;
  body: string;
  status: "pending" | "approved" | "rejected" | "spam";
  created_at: string;
}

export interface LandingPage {
  id: string;
  game_id: string;
  badge: string;
  slug: string;
  focus_keyword: string;
  language: string;
  intent: string;
  title: string;
  h1: string;
  subtitle: string;
  tool_type: string;
  meta_description: string;
  intro: string;
  sections: string;
  faqs: string;
  related_keywords?: string | null;
  canonical_url?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  social_image?: string | null;
  noindex?: number;
  status: "draft" | "published";
  sort_order: number;
  published_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface LandingWithGame extends LandingPage {
  game: Game;
}

export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  cover_url?: string | null;
  author?: string | null;
  seo_title?: string | null;
  meta_description?: string | null;
  focus_keyword?: string | null;
  related_keywords?: string | null;
  canonical_url?: string | null;
  social_image?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  h1?: string | null;
  language?: string | null;
  status: "draft" | "published";
  published_at?: string | null;
  updated_at?: string | null;
}
