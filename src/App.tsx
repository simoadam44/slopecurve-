import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Header, Footer } from "./components/Layout";
import { HomeRoute } from "./pages/Home";
import { Games, NewGames, HotGames } from "./pages/Games";
import { GameDetail } from "./pages/GameDetail";
import { Categories, CategoryDetail } from "./pages/Categories";
import { Blog, BlogPostPage, LegalPage, StaticPage } from "./pages/Content";
import { LandingPage } from "./pages/LandingPage";
import { AdminLayout, Dashboard, GamesAdmin, GameEditor, CategoriesAdmin, CommentsAdmin, BlogAdmin, SettingsAdmin, BrandingAdmin, GeneralAdmin, SeoAdmin, WebmasterAdmin, AdsenseAdmin, AccountAdmin, SecurityAdmin, RequireAuth } from "./pages/admin/Admin";
import { AdminLogin } from "./pages/admin/AdminLogin";
import { AiAdmin } from "./pages/admin/AiWriter";
import { LandingAdmin } from "./pages/admin/Landing";
import { LandingEditor } from "./pages/admin/LandingEditor";

export function App() {
  return (
    <BrowserRouter>
      <Header />
      <main className="container" style={{ paddingTop: 16, minHeight: "70vh" }}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/games" element={<Games />} />
          <Route path="/games/:slug" element={<GameDetail />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/categories/:slug" element={<CategoryDetail />} />
          <Route path="/new-games" element={<NewGames />} />
          <Route path="/hot-games" element={<HotGames />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="/about" element={<StaticPage key_="about" />} />
          <Route path="/privacy-policy" element={<LegalPage page="privacy-policy" />} />
          <Route path="/terms-of-use" element={<LegalPage page="terms-of-use" />} />
          <Route path="/contact" element={<LegalPage page="contact" />} />
          <Route path="/privacy" element={<Navigate to="/privacy-policy" replace />} />
          <Route path="/terms" element={<Navigate to="/terms-of-use" replace />} />
          <Route path="/faq" element={<StaticPage key_="faq" />} />
          <Route path="/:slug" element={<LandingPage />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<RequireAuth><AdminLayout /></RequireAuth>}>
            <Route index element={<Dashboard />} />
            <Route path="games" element={<GamesAdmin />} />
            <Route path="games/new" element={<GameEditor />} />
            <Route path="games/:id" element={<GameEditor />} />
            <Route path="categories" element={<CategoriesAdmin />} />
            <Route path="comments" element={<CommentsAdmin />} />
            <Route path="blog" element={<BlogAdmin />} />
            <Route path="landing" element={<LandingAdmin />}>
              <Route path="new" element={<LandingEditor />} />
              <Route path=":id" element={<LandingEditor />} />
            </Route>
            <Route path="ai" element={<AiAdmin />} />
            <Route path="branding" element={<BrandingAdmin />} />
            <Route path="general" element={<GeneralAdmin />} />
            <Route path="seo" element={<SeoAdmin />} />
            <Route path="webmaster" element={<WebmasterAdmin />} />
            <Route path="adsense" element={<AdsenseAdmin />} />
            <Route path="account" element={<AccountAdmin />} />
            <Route path="security" element={<SecurityAdmin />} />
            <Route path="settings" element={<SettingsAdmin />} />
          </Route>
          <Route path="/404" element={<div><h1>Not found</h1><p className="muted">Unknown route.</p></div>} />
          <Route path="*" element={<Navigate to="/404" replace />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
