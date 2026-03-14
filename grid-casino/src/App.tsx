import { useState } from 'react';
import { CasinoLobby } from './components/CasinoLobby';
import { GameTable } from './components/GameTable';
import { CountryData, COUNTRIES, fetchCountryData } from './services/dataService';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';

export default function App() {
  const [balance, setBalance] = useState<number>(1000);
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [didAutoLoadCountry, setDidAutoLoadCountry] = useState<boolean>(false);
  const [returnUrl, setReturnUrl] = useState<string | null>(null);

  const handleSelectGame = async (countryId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchCountryData(countryId);
      setSelectedCountry(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load country data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateBalance = (amount: number) => {
    setBalance(prev => prev + amount);
  };

  useEffect(() => {
    if (didAutoLoadCountry) return;
    setDidAutoLoadCountry(true);
    const params = new URLSearchParams(window.location.search);
    const backToHubUrl = params.get('return_url');
    if (backToHubUrl) {
      setReturnUrl(backToHubUrl);
    }
    const countryFromUrl = params.get('country');
    if (!countryFromUrl) return;
    const normalizedCountry = countryFromUrl.toUpperCase();
    if (!COUNTRIES.some(c => c.id === normalizedCountry)) {
      setError(`Unsupported country code: ${normalizedCountry}`);
      return;
    }
    void handleSelectGame(normalizedCountry);
  }, [didAutoLoadCountry]);

  const handleBackFromGame = () => {
    if (returnUrl) {
      window.location.href = returnUrl;
      return;
    }
    setSelectedCountry(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-12 h-12 text-yellow-400 animate-spin mb-4" />
        <p className="text-gray-300 font-mono">Loading Market Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex flex-col items-center justify-center text-white p-6">
        <div className="bg-black/50 border border-rose-500/50 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-rose-400 mb-2">Market Offline</h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-600 transition-colors"
          >
            Return to Lobby
          </button>
        </div>
      </div>
    );
  }

  if (selectedCountry) {
    return (
      <GameTable 
        countryData={selectedCountry} 
        balance={balance} 
        onBack={handleBackFromGame}
        onUpdateBalance={handleUpdateBalance}
      />
    );
  }

  return <CasinoLobby onSelectGame={handleSelectGame} balance={balance} />;
}
