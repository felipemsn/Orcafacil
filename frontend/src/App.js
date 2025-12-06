import { useState, useEffect } from "react";
import "@/App.css";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Search, FileText, TrendingUp, CheckCircle2, XCircle, Database } from "lucide-react";

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
      toast.error("Por favor, digite pelo menos um nome de item");
      return;
    }

    if (lines.length > 15) {
      toast.error("Máximo de 15 itens permitidos por consulta");
      return;
    }

    setSearching(true);
    try {
      const response = await axios.post(`${API}/quotation-batch`, {
        item_names: lines,
      });

      setQuotations(response.data);
      toast.success(`${response.data.total_found} de ${response.data.total_queried} itens encontrados!`);
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
          <p className="header-subtitle">Gerencie tabela de preços padrão e consulte até 15 itens simultaneamente</p>
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
                Consultar Cotações (Lote)
              </CardTitle>
              <CardDescription>Digite até 15 nomes de produtos (um por linha)</CardDescription>
            </CardHeader>
            <CardContent className="card-content">
              <div className="search-section">
                <Label htmlFor="item-names" className="search-label">
                  Nomes dos Produtos (máx. 15)
                </Label>
                <Textarea
                  id="item-names"
                  placeholder="Digite um nome por linha:
THINER 5 LITROS FARBEN
ACAB. EMBUTIR PERFIL LED
..."
                  value={itemNames}
                  onChange={(e) => setItemNames(e.target.value)}
                  className="search-textarea"
                  rows={8}
                  data-testid="item-names-textarea"
                />
                <div className="item-counter" data-testid="item-counter">
                  {itemNames.trim().split('\n').filter(line => line.trim()).length} / 15 itens
                </div>
                <Button
                  onClick={handleGetQuotations}
                  disabled={!itemNames.trim() || searching}
                  className="search-button"
                  data-testid="search-button"
                >
                  {searching ? "Buscando..." : "Buscar Cotações"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {quotations && quotations.results && quotations.results.length > 0 && (
          <div className="results-section" data-testid="results-section">
            <div className="results-header">
              <TrendingUp size={24} />
              <h2>Resultados das Cotações</h2>
              <span className="results-summary" data-testid="results-summary">
                {quotations.total_found} encontrados de {quotations.total_queried} consultados
              </span>
            </div>

            <div className="results-table-container">
              <table className="results-table" data-testid="results-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Item Consultado</th>
                    <th>Item Encontrado</th>
                    <th>Valor 5%</th>
                    <th>Valor Limite</th>
                    <th>Valor Ativo</th>
                    <th>Origem</th>
                    <th>Score</th>
                  </tr>
                </thead>
                <tbody>
                  {quotations.results.map((result, index) => (
                    <tr key={index} className={result.found ? "found" : "not-found"} data-testid={`result-row-${index}`}>
                      <td>
                        {result.found ? (
                          <CheckCircle2 size={20} className="status-icon success" data-testid={`status-found-${index}`} />
                        ) : (
                          <XCircle size={20} className="status-icon error" data-testid={`status-not-found-${index}`} />
                        )}
                      </td>
                      <td className="item-queried" data-testid={`item-queried-${index}`}>{result.item_name}</td>
                      <td className="item-matched" data-testid={`item-matched-${index}`}>
                        {result.matched_item_name || "-"}
                      </td>
                      <td className="value-cell" data-testid={`cinco-value-${index}`}>{result.cinco_porcento_value}</td>
                      <td className="value-cell" data-testid={`limite-value-${index}`}>{result.limite_value}</td>
                      <td className="active-value" data-testid={`active-value-${index}`}>
                        <span className={`value-highlight ${result.source}`}>
                          {result.active_value}
                        </span>
                      </td>
                      <td data-testid={`source-${index}`}>
                        <span className={`source-badge ${result.source}`}>
                          {result.source === "5%" ? "5%" : result.source === "limit" ? "Limite" : "N/A"}
                        </span>
                      </td>
                      <td className="match-score" data-testid={`match-score-${index}`}>
                        {result.match_score ? `${result.match_score}%` : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;