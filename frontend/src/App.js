import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Toaster } from '@/components/ui/sonner';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import FavoritesPage from './pages/FavoritesPage';
import { SearchProvider } from './context/SearchContext';
import { Search, Star, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";

function TopNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/', icon: Search, label: 'Buscar' },
    { path: '/favorites', icon: Star, label: 'Favoritos' },
    { path: '/settings', icon: Settings, label: 'Configurações' }
  ];

  return (
    <div className="top-nav" data-testid="top-nav">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.path;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`nav-item ${isActive ? 'active' : ''}`}
            data-testid={`nav-${item.label.toLowerCase()}`}
          >
            <Icon size={20} />
            <span className="nav-label">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function AppContent() {
  return (
    <>
      <TopNav />
      <div className="app-container">
        <div className="content-wrapper">
          <header className="header">
            <div className="header-logo">
              <img 
                src="https://customer-assets.emergentagent.com/job_price-finder-117/artifacts/s5opdkqv_daf9f7f8-dcde-4589-b4a8-58bae23ac714.png" 
                alt="XAB Distribuidora"
                className="header-logo-img"
              />
            </div>
            <h1 className="header-title">Sistema de Cotação de Preços</h1>
            <p className="header-subtitle">Busca ilimitada • Sistema de favoritos • Cores originais do PDF</p>
          </header>

          <div className="main-content">
            <Routes>
              <Route path="/" element={<SearchPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SearchProvider>
        <AppContent />
      </SearchProvider>
    </BrowserRouter>
  );
}

export default App;