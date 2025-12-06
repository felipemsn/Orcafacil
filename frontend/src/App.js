import { useState, useEffect } from "react";
import "@/App.css";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Search, FileText, TrendingUp, Star, Database } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [file, setFile] = useState(null);
  const [itemNames, setItemNames] = useState("");
  const [quotations, setQuotations] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [defaultPdfStatus, setDefaultPdfStatus] = useState(null);
  const [favorites, setFavorites] = useState(new Set());

  useEffect(() => {
    fetchDefaultPdfStatus();
    fetchFavorites();
  }, []);

  const fetchDefaultPdfStatus = async () => {
    try {
      const response = await axios.get(`${API}/default-pdf-status`);
      setDefaultPdfStatus(response.data);
    } catch (error) {
      console.error("Error fetching default PDF status:", error);
    }
  };

  const fetchFavorites = async () => {
    try {
      const response = await axios.get(`${API}/favorites/list`);
      setFavorites(new Set(response.data.favorites));
    } catch (error) {
      console.error("Error fetching favorites:", error);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === "application/pdf") {
      setFile(selectedFile);
    } else {
      toast.error("Por favor, selecione um arquivo PDF válido");
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast.error("Por favor, selecione um arquivo PDF");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(`${API}/upload-pdf`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      toast.success(`PDF definido como padrão! ${response.data.items_count} itens carregados`);
      await fetchDefaultPdfStatus();
      setQuotations(null);
      setFile(null);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      toast.error(error.response?.data?.detail || "Erro ao processar PDF");
    } finally {
      setUploading(false);
    }
  };

  const handleGetQuotations = async () => {
    const lines = itemNames.trim().split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      toast.error("Por favor, digite pelo menos uma palavra-chave");
      return;
    }

    setSearching(true);
    try {
      const response = await axios.post(`${API}/quotation-batch`, {
        item_names: lines,
      });

      setQuotations(response.data);
      toast.success(`${response.data.total_items_found} itens encontrados para ${response.data.total_keywords} palavras-chave!`);
    } catch (error) {
      console.error("Error getting quotations:", error);
      toast.error(error.response?.data?.detail || "Erro ao buscar cotações");
      setQuotations(null);
    } finally {
      setSearching(false);
    }
  };

  const toggleFavorite = async (itemName, currentlyFavorited) => {
    try {
      if (currentlyFavorited) {
        await axios.delete(`${API}/favorites/remove`, {
          data: { item_name: itemName }
        });
        setFavorites(prev => {
          const newSet = new Set(prev);
          newSet.delete(itemName);
          return newSet;
        });
        toast.success("Removido dos favoritos");
      } else {
        await axios.post(`${API}/favorites/add`, {
          item_name: itemName
        });
        setFavorites(prev => new Set([...prev, itemName]));
        toast.success("Adicionado aos favoritos");
      }
      
      if (quotations) {
        handleGetQuotations();
      }
    } catch (error) {
      console.error("Error toggling favorite:", error);
      toast.error("Erro ao atualizar favorito");
    }
  };

  const getColorClass = (color) => {
    if (color === 'yellow') return 'value-yellow';
    if (color === 'green') return 'value-green';
    return '';
  };

  const getCincoDisplayColor = (match) => {
    // When fallback is applied and Limite Tabela has green color, display in green
    if (match.fallback_applied && match.limite_tabela_color === 'green') {
      return 'value-green';
    }
    // Otherwise check the cinco_porcento color
    return getColorClass(match.cinco_porcento_color);
  };

  const keywordCount = itemNames.trim().split('\n').filter(line => line.trim()).length;

  return (
    <div className="app-container">
      <div className="content-wrapper">
        <header className="header">
          <div className="header-icon">
            <FileText size={32} />
          </div>
          <h1 className="header-title">Sistema de Cotação de Preços</h1>
          <p className="header-subtitle">Busca ilimitada • Modo exato/parcial • Sistema de favoritos • Cores originais do PDF</p>
        </header>

        {defaultPdfStatus?.has_default && (
          <div className="default-pdf-status" data-testid="default-pdf-status">
            <Database size={20} />
            <div className="status-info">
              <span className="status-label">Tabela Padrão Ativa:</span>
              <span className="status-value" data-testid="default-pdf-filename">{defaultPdfStatus.filename}</span>
              <span className="status-detail" data-testid="default-pdf-items-count">({defaultPdfStatus.items_count} itens)</span>
            </div>
          </div>
        )}

        <div className="cards-container">
          <Card className="upload-card" data-testid="upload-card">
            <CardHeader>
              <CardTitle className="card-title">
                <Upload size={20} />
                Definir Tabela Padrão
              </CardTitle>
              <CardDescription>Envie um PDF para definir como tabela de preços padrão persistente</CardDescription>
            </CardHeader>
            <CardContent className="card-content">
              <div className="upload-section">
                <Label htmlFor="pdf-upload" className="upload-label">
                  Selecionar PDF
                </Label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="file-input"
                  data-testid="pdf-upload-input"
                />
                {file && (
                  <div className="file-info" data-testid="selected-file-info">
                    <FileText size={16} />
                    <span>{file.name}</span>
                  </div>
                )}
                <Button
                  onClick={handleUpload}
                  disabled={!file || uploading}
                  className="upload-button"
                  data-testid="upload-button"
                >
                  {uploading ? "Processando..." : "Definir como Padrão"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="quotation-card" data-testid="quotation-card">
            <CardHeader>
              <CardTitle className="card-title">
                <Search size={20} />
                Buscar Itens (Ilimitado)
              </CardTitle>
              <CardDescription>Digite palavras-chave ou nomes completos (uma por linha)</CardDescription>
            </CardHeader>
            <CardContent className="card-content">
              <div className="search-section">
                <Label htmlFor="item-names" className="search-label">
                  Palavras-chave ou Itens Completos
                </Label>
                <Textarea
                  id="item-names"
                  placeholder="Digite palavras-chave ou nomes completos
Exemplo: THINER
Exemplo: 1570.THINER 5 LITROS FARBEN"
                  value={itemNames}
                  onChange={(e) => setItemNames(e.target.value)}
                  className="search-textarea"
                  rows={8}
                  data-testid="item-names-textarea"
                />
                <div className="item-counter" data-testid="item-counter">
                  {keywordCount} {keywordCount === 1 ? 'palavra-chave' : 'palavras-chave'}
                </div>
                <Button
                  onClick={handleGetQuotations}
                  disabled={!itemNames.trim() || searching}
                  className="search-button"
                  data-testid="search-button"
                >
                  {searching ? "Buscando..." : "Buscar Itens"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {quotations && quotations.results && quotations.results.length > 0 && (
          <div className="results-section" data-testid="results-section">
            <div className="results-header">
              <TrendingUp size={24} />
              <h2>Resultados da Busca</h2>
              <span className="results-summary" data-testid="results-summary">
                {quotations.total_items_found} itens • {quotations.total_keywords} consultas
              </span>
            </div>

            {quotations.results.map((keywordResult, kIndex) => {
              const favoritesInGroup = keywordResult.matches.filter(m => m.is_favorite).length;
              
              return (
                <div key={kIndex} className="keyword-group" data-testid={`keyword-group-${kIndex}`}>
                  <div className="keyword-header">
                    <h3 data-testid={`keyword-${kIndex}`}>
                      <span className="keyword-text">"{keywordResult.keyword}"</span>
                    </h3>
                    <div className="header-badges">
                      {favoritesInGroup > 0 && (
                        <span className="favorites-badge" data-testid={`favorites-badge-${kIndex}`}>
                          <Star size={14} /> {favoritesInGroup} favorito{favoritesInGroup > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="matches-count" data-testid={`matches-count-${kIndex}`}>
                        {keywordResult.total_matches} resultado{keywordResult.total_matches !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {keywordResult.total_matches > 0 ? (
                    <div className="results-table-container">
                      <table className="results-table" data-testid={`results-table-${kIndex}`}>
                        <thead>
                          <tr>
                            <th>Fav</th>
                            <th>Item Encontrado</th>
                            <th>Valor de Venda</th>
                            <th>Limite Sistema</th>
                            <th>Limite Tabela</th>
                            <th>5%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {keywordResult.matches.map((match, mIndex) => (
                            <tr 
                              key={mIndex} 
                              className={match.is_favorite ? 'favorite-row' : ''}
                              data-testid={`match-row-${kIndex}-${mIndex}`}
                            >
                              <td className="favorite-cell">
                                <button
                                  onClick={() => toggleFavorite(match.matched_item_name, match.is_favorite)}
                                  className={`favorite-btn ${match.is_favorite ? 'active' : ''}`}
                                  data-testid={`favorite-btn-${kIndex}-${mIndex}`}
                                  title={match.is_favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                >
                                  <Star size={16} fill={match.is_favorite ? "currentColor" : "none"} />
                                </button>
                              </td>
                              <td className="item-name" data-testid={`item-name-${kIndex}-${mIndex}`}>
                                {match.matched_item_name}
                                {match.is_favorite && <span className="fav-tag">★</span>}
                              </td>
                              <td className={`value-cell ${getColorClass(match.valor_venda_color)}`} data-testid={`valor-venda-${kIndex}-${mIndex}`}>
                                {match.valor_venda}
                              </td>
                              <td className={`value-cell ${getColorClass(match.limite_sistema_color)}`} data-testid={`limite-sistema-${kIndex}-${mIndex}`}>
                                {match.limite_sistema}
                              </td>
                              <td className={`value-cell ${getColorClass(match.limite_tabela_color)}`} data-testid={`limite-tabela-${kIndex}-${mIndex}`}>
                                {match.limite_tabela}
                              </td>
                              <td className="cinco-cell" data-testid={`cinco-display-${kIndex}-${mIndex}`}>
                                <span className={`cinco-value ${match.fallback_applied ? 'fallback-green' : 'original'} ${getCincoDisplayColor(match)}`} data-testid={`cinco-value-${kIndex}-${mIndex}`}>
                                  {match.cinco_porcento_display}
                                </span>
                                {match.fallback_applied && (
                                  <span className="fallback-badge" data-testid={`fallback-badge-${kIndex}-${mIndex}`}>
                                    Fallback
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="no-results" data-testid={`no-results-${kIndex}`}>
                      <span>Nenhum item encontrado</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;