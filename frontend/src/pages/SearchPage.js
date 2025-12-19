import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, TrendingUp, Star, ArrowUp, X } from "lucide-react";
import { useSearch } from "@/context/SearchContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function SearchPage() {
  const { searchState, updateSearchState } = useSearch();
  const [itemNames, setItemNames] = useState(searchState.itemNames);
  const [quotations, setQuotations] = useState(searchState.quotations);
  const [searching, setSearching] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [showScrollTop, setShowScrollTop] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    fetchFavorites();
    
    // Scroll listener
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [itemNames]);

  const fetchFavorites = async () => {
    try {
      const response = await axios.get(`${API}/favorites/list`);
      setFavorites(new Set(response.data.favorites));
    } catch (error) {
      console.error("Error fetching favorites:", error);
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

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // Persist search state when it changes
  useEffect(() => {
    updateSearchState({ itemNames, quotations });
  }, [itemNames, quotations]);

  const clearText = () => {
    setItemNames("");
    setQuotations(null);
    toast.success("Texto limpo");
  };

  const getColorClass = (color) => {
    if (color === 'yellow') return 'value-yellow';
    if (color === 'green') return 'value-green';
    return '';
  };

  const getCincoDisplayColor = (match) => {
    if (match.fallback_applied && match.limite_tabela_color === 'green') {
      return 'value-green';
    }
    return getColorClass(match.cinco_porcento_color);
  };

  const keywordCount = itemNames.trim().split('\n').filter(line => line.trim()).length;

  return (
    <div className="search-page">
      <Card className="search-card" data-testid="search-card">
        <CardHeader>
          <CardTitle className="card-title">
            <Search size={20} />
            Buscar Itens
          </CardTitle>
          <CardDescription>Digite palavras-chave ou nomes completos (uma por linha)</CardDescription>
        </CardHeader>
        <CardContent className="card-content">
          <div className="search-section">
            <Label htmlFor="item-names" className="search-label">
              Palavras-chave ou Itens Completos
            </Label>
            <Textarea
              ref={textareaRef}
              id="item-names"
              placeholder="Digite palavras-chave ou nomes completos
Exemplo: THINER
Exemplo: 1570.THINER 5 LITROS FARBEN"
              value={itemNames}
              onChange={(e) => setItemNames(e.target.value)}
              className="search-textarea auto-resize"
              rows={1}
              data-testid="item-names-textarea"
            />
            <div className="textarea-controls">
              <div className="item-counter" data-testid="item-counter">
                {keywordCount} {keywordCount === 1 ? 'palavra-chave' : 'palavras-chave'}
              </div>
              {itemNames && (
                <Button
                  onClick={clearText}
                  variant="ghost"
                  size="sm"
                  className="clear-button"
                  data-testid="clear-button"
                >
                  <X size={16} />
                  Limpar
                </Button>
              )}
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
                        <Star size={14} /> {favoritesInGroup}
                      </span>
                    )}
                    <span className="matches-count" data-testid={`matches-count-${kIndex}`}>
                      {keywordResult.total_matches}
                    </span>
                  </div>
                </div>

                {keywordResult.total_matches > 0 ? (
                  <div className="results-cards-container">
                    {keywordResult.matches.map((match, mIndex) => (
                      <div 
                        key={mIndex} 
                        className={`result-card ${match.is_favorite ? 'favorite' : ''}`}
                        data-testid={`match-card-${kIndex}-${mIndex}`}
                      >
                        <div className="result-card-header">
                          <button
                            onClick={() => toggleFavorite(match.matched_item_name, match.is_favorite)}
                            className={`favorite-btn ${match.is_favorite ? 'active' : ''}`}
                            data-testid={`favorite-btn-${kIndex}-${mIndex}`}
                          >
                            <Star size={16} fill={match.is_favorite ? "currentColor" : "none"} />
                          </button>
                          <h4 className="result-item-name" data-testid={`item-name-${kIndex}-${mIndex}`}>
                            {match.matched_item_name}
                          </h4>
                        </div>
                        <div className="result-card-body">
                          <div className="result-field">
                            <span className="field-label">Valor de Venda</span>
                            <span className={`field-value ${getColorClass(match.valor_venda_color)}`}>
                              {match.valor_venda}
                            </span>
                          </div>
                          <div className="result-field">
                            <span className="field-label">Limite Sistema</span>
                            <span className={`field-value ${getColorClass(match.limite_sistema_color)}`}>
                              {match.limite_sistema}
                            </span>
                          </div>
                          <div className="result-field">
                            <span className="field-label">Limite Tabela</span>
                            <span className={`field-value ${getColorClass(match.limite_tabela_color)}`}>
                              {match.limite_tabela}
                            </span>
                          </div>
                          <div className="result-field highlight">
                            <span className="field-label">5%</span>
                            <div className="field-value-wrapper">
                              <span className={`field-value-main ${match.fallback_applied ? 'fallback-green' : 'original'} ${getCincoDisplayColor(match)}`}>
                                {match.cinco_porcento_display}
                              </span>
                              {match.fallback_applied && (
                                <span className="preco-cheio-badge">
                                  Preço Cheio
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="scroll-to-top"
          data-testid="scroll-to-top"
          title="Voltar ao topo"
        >
          <ArrowUp size={24} />
        </button>
      )}
    </div>
  );
}

export default SearchPage;