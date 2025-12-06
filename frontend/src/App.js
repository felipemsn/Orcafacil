import { useState } from "react";
import "@/App.css";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, Search, FileText, TrendingUp } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function App() {
  const [file, setFile] = useState(null);
  const [itemName, setItemName] = useState("");
  const [quotation, setQuotation] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [itemsCount, setItemsCount] = useState(0);

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

      toast.success(`PDF processado com sucesso! ${response.data.items_count} itens carregados`);
      setItemsCount(response.data.items_count);
      setQuotation(null);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      toast.error(error.response?.data?.detail || "Erro ao processar PDF");
    } finally {
      setUploading(false);
    }
  };

  const handleGetQuotation = async () => {
    if (!itemName.trim()) {
      toast.error("Por favor, digite o nome do item");
      return;
    }

    setSearching(true);
    try {
      const response = await axios.post(`${API}/quotation`, {
        item_name: itemName,
      });

      setQuotation(response.data);
      toast.success("Cotação encontrada!");
    } catch (error) {
      console.error("Error getting quotation:", error);
      toast.error(error.response?.data?.detail || "Erro ao buscar cotação");
      setQuotation(null);
    } finally {
      setSearching(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleGetQuotation();
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
          <p className="header-subtitle">Faça upload da tabela de preços e consulte valores instantaneamente</p>
        </header>

        <div className="cards-container">
          <Card className="upload-card" data-testid="upload-card">
            <CardHeader>
              <CardTitle className="card-title">
                <Upload size={20} />
                Upload da Tabela
              </CardTitle>
              <CardDescription>Envie o arquivo PDF com a tabela de preços</CardDescription>
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
                  {uploading ? "Processando..." : "Fazer Upload"}
                </Button>
                {itemsCount > 0 && (
                  <div className="items-count" data-testid="items-count-display">
                    ✓ {itemsCount} itens carregados
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="quotation-card" data-testid="quotation-card">
            <CardHeader>
              <CardTitle className="card-title">
                <Search size={20} />
                Consultar Cotação
              </CardTitle>
              <CardDescription>Digite o nome do produto para obter o preço</CardDescription>
            </CardHeader>
            <CardContent className="card-content">
              <div className="search-section">
                <Label htmlFor="item-name" className="search-label">
                  Nome do Produto
                </Label>
                <Input
                  id="item-name"
                  type="text"
                  placeholder="Ex: THINER 5 LITROS FARBEN"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="search-input"
                  data-testid="item-name-input"
                />
                <Button
                  onClick={handleGetQuotation}
                  disabled={!itemName.trim() || searching}
                  className="search-button"
                  data-testid="search-button"
                >
                  {searching ? "Buscando..." : "Buscar Cotação"}
                </Button>
              </div>

              {quotation && (
                <div className="quotation-result" data-testid="quotation-result">
                  <div className="result-header">
                    <TrendingUp size={20} />
                    <h3>Resultado da Cotação</h3>
                  </div>
                  <div className="result-content">
                    <div className="result-item">
                      <span className="result-label">Produto:</span>
                      <span className="result-value" data-testid="result-item-name">{quotation.item_name}</span>
                    </div>
                    <div className="result-item highlight">
                      <span className="result-label">Valor:</span>
                      <span className="result-value-main" data-testid="result-quotation-value">{quotation.quotation_value}</span>
                    </div>
                    <div className="result-item">
                      <span className="result-label">Origem:</span>
                      <span className="result-badge" data-testid="result-source">
                        {quotation.source === "5%" ? "Coluna 5%" : "Coluna Limite"}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default App;