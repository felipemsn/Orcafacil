import { useState, useEffect } from "react";
import "@/App.css";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Search, FileText, TrendingUp, CheckCircle2, XCircle, Database, Info } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [file, setFile] = useState(null);
  const [itemNames, setItemNames] = useState("");
  const [quotations, setQuotations] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [defaultPdfStatus, setDefaultPdfStatus] = useState(null);

  useEffect(() => {
    fetchDefaultPdfStatus();
  }, []);

  const fetchDefaultPdfStatus = async () => {
    try {
      const response = await axios.get(`${API}/default-pdf-status`);
      setDefaultPdfStatus(response.data);
    } catch (error) {
      console.error("Error fetching default PDF status:", error);
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

    if (lines.length > 15) {
      toast.error("Máximo de 15 palavras-chave permitidas por consulta");
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

  return (
    <div className="app-container">
      <div className="content-wrapper">
        <header className="header">
          <div className="header-icon">
            <FileText size={32} />
          </div>
          <h1 className="header-title">Sistema de Cotação de Preços</h1>
          <p className="header-subtitle">Busca inteligente com múltiplos resultados • Até 15 palavras-chave • Exibição completa de campos</p>
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
                Buscar Itens (Múltiplos Resultados)
              </CardTitle>
              <CardDescription>Digite até 15 palavras-chave (uma por linha) para buscar todos os itens correspondentes</CardDescription>
            </CardHeader>
            <CardContent className="card-content">
              <div className="search-section">
                <Label htmlFor="item-names" className="search-label">
                  Palavras-chave (máx. 15)
                </Label>
                <Textarea
                  id="item-names"
                  placeholder="Digite uma palavra-chave por linha:
THINER
LED
PERFIL
..."
                  value={itemNames}
                  onChange={(e) => setItemNames(e.target.value)}
                  className="search-textarea"
                  rows={8}
                  data-testid="item-names-textarea"
                />
                <div className="item-counter" data-testid="item-counter">
                  {itemNames.trim().split('\n').filter(line => line.trim()).length} / 15 palavras-chave
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
                {quotations.total_items_found} itens encontrados para {quotations.total_keywords} palavras-chave
              </span>
            </div>

            <div className="info-banner" data-testid="info-banner">
              <Info size={16} />
              <span>Todos os itens que contêm as palavras-chave buscadas são exibidos abaixo, agrupados por palavra-chave.</span>
            </div>

            {quotations.results.map((keywordResult, kIndex) => (
              <div key={kIndex} className="keyword-group" data-testid={`keyword-group-${kIndex}`}>
                <div className="keyword-header">
                  <h3 data-testid={`keyword-${kIndex}`}>
                    Palavra-chave: <span className="keyword-text">"{keywordResult.keyword}"</span>
                  </h3>
                  <span className="matches-count" data-testid={`matches-count-${kIndex}`}>
                    {keywordResult.total_matches} {keywordResult.total_matches === 1 ? 'resultado' : 'resultados'}
                  </span>
                </div>

                {keywordResult.total_matches > 0 ? (
                  <div className="results-table-container">
                    <table className="results-table" data-testid={`results-table-${kIndex}`}>
                      <thead>
                        <tr>
                          <th>Item Encontrado</th>
                          <th>Valor de Venda</th>
                          <th>Limite Sistema</th>
                          <th>Limite Tabela</th>
                          <th>5% (com fallback)</th>
                          <th>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keywordResult.matches.map((match, mIndex) => (
                          <tr key={mIndex} data-testid={`match-row-${kIndex}-${mIndex}`}>
                            <td className="item-name" data-testid={`item-name-${kIndex}-${mIndex}`}>
                              {match.matched_item_name}
                            </td>
                            <td className="value-cell" data-testid={`valor-venda-${kIndex}-${mIndex}`}>
                              {match.valor_venda}
                            </td>
                            <td className="value-cell" data-testid={`limite-sistema-${kIndex}-${mIndex}`}>
                              {match.limite_sistema}
                            </td>
                            <td className="value-cell" data-testid={`limite-tabela-${kIndex}-${mIndex}`}>
                              {match.limite_tabela}
                            </td>
                            <td className="cinco-cell" data-testid={`cinco-display-${kIndex}-${mIndex}`}>
                              <span className={`cinco-value ${match.fallback_applied ? 'fallback' : 'original'}`}>
                                {match.cinco_porcento_display}
                              </span>
                              {match.fallback_applied && (
                                <span className="fallback-badge" data-testid={`fallback-badge-${kIndex}-${mIndex}`}>
                                  Fallback
                                </span>
                              )}
                            </td>
                            <td className="match-score" data-testid={`match-score-${kIndex}-${mIndex}`}>
                              {match.match_score}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="no-results" data-testid={`no-results-${kIndex}`}>
                    <XCircle size={20} />
                    <span>Nenhum item encontrado para esta palavra-chave</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;