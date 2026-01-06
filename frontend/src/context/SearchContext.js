import { createContext, useContext, useState } from 'react';

const SearchContext = createContext();

export function SearchProvider({ children }) {
  const [searchState, setSearchState] = useState({
    itemNames: "",
    quotations: null,
  });
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const updateSearchState = (newState) => {
    setSearchState(prev => ({ ...prev, ...newState }));
  };

  return (
    <SearchContext.Provider value={{ 
      searchState, 
      updateSearchState, 
      isSearchFocused, 
      setIsSearchFocused 
    }}>
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
