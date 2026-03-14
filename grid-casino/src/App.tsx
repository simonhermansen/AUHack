import { useState } from 'react';
import { CasinoLobby } from './components/CasinoLobby';
import { GameTable } from './components/GameTable';
import { CountryData, fetchCountryData } from './services/dataService';
import { Loader2 } from 'lucide-react';

export default function App() {
  const [balance, setBalance] = useState<number>(1000);
  const [selectedCountry, setSelectedCountry] = useState<CountryData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100">
        <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
        <p className="text-zinc-400 font-mono">Loading Market Data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-zinc-100 p-6">
        <div className="bg-rose-500/10 border border-rose-500/50 rounded-2xl p-8 max-w-md text-center">
          <h2 className="text-2xl font-bold text-rose-400 mb-2">Market Offline</h2>
          <p className="text-zinc-400 mb-6">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
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
        onBack={() => setSelectedCountry(null)}
        onUpdateBalance={handleUpdateBalance}
      />
    );
  }

  return <CasinoLobby onSelectGame={handleSelectGame} balance={balance} />;
}
