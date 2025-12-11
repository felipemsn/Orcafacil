import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Star, Trash2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [allItems, setAllItems] = useState([]);

  useEffect(() => {
    fetchFavorites();
    fetchAllItems();
  }, []);

  const fetchFavorites = async () => {
    try {
      const response = await axios.get(`${API}/favorites/list`);
      setFavorites(response.data.favorites);
    } catch (error) {
      console.error("Error fetching favorites:", error);
      toast.error("Erro ao carregar favoritos");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllItems = async () => {
    try {
      const response = await axios.get(`${API}/items?limit=10000`);
      setAllItems(response.data);
    } catch (error) {
      console.error("Error fetching items:", error);
    }
  };

  const removeFavorite = async (itemName) => {
    try {
      await axios.delete(`${API}/favorites/remove`, {
        data: { item_name: itemName }
      });
      setFavorites(prev => prev.filter(fav => fav !== itemName));
      toast.success("Removido dos favoritos");
    } catch (error) {
      console.error("Error removing favorite:", error);
      toast.error("Erro ao remover favorito");
    }
  };

  const getItemDetails = (itemName) => {
    return allItems.find(item => item.produto === itemName);
  };

  const filteredFavorites = favorites.filter(fav => 
    fav.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getColorClass = (color) => {
    if (color === 'yellow') return 'value-yellow';
    if (color === 'green') return 'value-green';
    return '';
  };

  return (
    <div className="favorites-page">
      <div className="page-header">
        <h1 className="page-title">
          <Star size={28} fill="currentColor" className="text-yellow-500" />
          Meus Favoritos
        </h1>
        <p className="page-subtitle">{favorites.length} {favorites.length === 1 ? 'item' : 'itens'} salvos</p>
      </div>

      {favorites.length > 0 && (
        <div className="search-filter">
          <div className="search-input-wrapper">
            <Search size={18} className="search-icon" />
            <Input
              type="text"
              placeholder="Filtrar favoritos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="filter-input"
              data-testid="favorites-search"
            />
          </div>
        </div>
      )}

      {loading ? (
        <div className="loading-state">
          <p>Carregando favoritos...</p>
        </div>
      ) : favorites.length === 0 ? (
        <Card className="empty-state-card">
          <CardContent className="empty-state">
            <Star size={64} className="empty-icon" />
            <h3>Nenhum favorito ainda</h3>
            <p>Adicione itens aos favoritos durante a busca clicando na estrela</p>
          </CardContent>
        </Card>
      ) : (
        <div className="favorites-list">
          {filteredFavorites.length === 0 ? (
            <Card className="empty-state-card">
              <CardContent className="empty-state">
                <Search size={48} className="empty-icon" />
                <p>Nenhum favorito encontrado com "{searchTerm}"</p>
              </CardContent>
            </Card>
          ) : (
            filteredFavorites.map((favorite, index) => {
              const itemDetails = getItemDetails(favorite);
              return (
                <Card key={index} className="favorite-item-card" data-testid={`favorite-card-${index}`}>
                  <CardHeader>
                    <div className="favorite-card-header">
                      <CardTitle className="favorite-item-name">
                        <Star size={18} fill="currentColor" className="text-yellow-500" />
                        {favorite}
                      </CardTitle>
                      <button
                        onClick={() => removeFavorite(favorite)}
                        className="remove-favorite-btn"
                        data-testid={`remove-favorite-${index}`}
                        title="Remover dos favoritos"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </CardHeader>
                  {itemDetails && (
                    <CardContent>
                      <div className="item-details-grid">
                        <div className="detail-item">
                          <span className="detail-label">Valor de Venda:</span>
                          <span className={`detail-value ${getColorClass(itemDetails.valor_venda_color)}`}>
                            {itemDetails.valor_venda || 'N/A'}
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Limite Sistema:</span>
                          <span className={`detail-value ${getColorClass(itemDetails.limite_sistema_color)}`}>
                            {itemDetails.limite_sistema || 'N/A'}
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Limite Tabela:</span>
                          <span className={`detail-value ${getColorClass(itemDetails.limite_tabela_color)}`}>
                            {itemDetails.limite_tabela || 'N/A'}
                          </span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">5%:</span>
                          <span className={`detail-value ${getColorClass(itemDetails.cinco_porcento_color)}`}>
                            {itemDetails.cinco_porcento || itemDetails.limite_tabela || 'N/A'}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default FavoritesPage;