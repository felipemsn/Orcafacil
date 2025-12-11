import { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileText, Calendar, CheckCircle2 } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function SettingsPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
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
      setFile(null);
    } catch (error) {
      console.error("Error uploading PDF:", error);
      toast.error(error.response?.data?.detail || "Erro ao processar PDF");
    } finally {
      setUploading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return "N/A";
    }
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1 className="page-title">Configurações da Tabela</h1>
      </div>

      {defaultPdfStatus?.has_default && (
        <Card className="current-table-card" data-testid="current-table-card">
          <CardHeader>
            <CardTitle className="card-title">
              <CheckCircle2 size={20} className="text-green-600" />
              Tabela Atual
            </CardTitle>
            <CardDescription>Informações da tabela de preços ativa</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-info">
              <div className="info-row">
                <div className="info-label">
                  <FileText size={16} />
                  <span>Arquivo:</span>
                </div>
                <div className="info-value" data-testid="current-filename">
                  {defaultPdfStatus.filename}
                </div>
              </div>
              <div className="info-row">
                <div className="info-label">
                  <Calendar size={16} />
                  <span>Data de Atualização:</span>
                </div>
                <div className="info-value update-date" data-testid="update-date">
                  {formatDate(defaultPdfStatus.upload_timestamp)}
                </div>
              </div>
              <div className="info-row">
                <div className="info-label">
                  <span>Total de Itens:</span>
                </div>
                <div className="info-value items-count" data-testid="items-count">
                  {defaultPdfStatus.items_count} itens
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="upload-card" data-testid="upload-card">
        <CardHeader>
          <CardTitle className="card-title">
            <Upload size={20} />
            {defaultPdfStatus?.has_default ? 'Atualizar Tabela' : 'Definir Tabela Padrão'}
          </CardTitle>
          <CardDescription>
            {defaultPdfStatus?.has_default 
              ? 'Envie um novo PDF para substituir a tabela atual'
              : 'Envie um PDF para definir como tabela de preços padrão persistente'
            }
          </CardDescription>
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
              {uploading ? "Processando..." : defaultPdfStatus?.has_default ? "Atualizar Tabela" : "Definir como Padrão"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SettingsPage;