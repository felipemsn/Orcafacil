import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from '@/components/ui/sonner';
import SearchPage from './pages/SearchPage';
import SettingsPage from './pages/SettingsPage';
import { FileText } from "lucide-react";

function App() {
  return (
    <BrowserRouter>
      <div className="app-container">
        <div className="content-wrapper">
          <header className="header">
            <div className="header-icon">
              <FileText size={32} />
            </div>
            <h1 className="header-title">Sistema de Cotação de Preços</h1>
            <p className="header-subtitle">Busca ilimitada • Sistema de favoritos • Cores originais do PDF</p>
          </header>

          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>
      <Toaster position="top-right" richColors />
    </BrowserRouter>
  );
}

export default App;