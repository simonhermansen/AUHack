import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RouletteWheel, RED_NUMBERS } from './components/RouletteWheel';
import { BettingBoard } from './components/BettingBoard';
import { Lobby } from './components/Lobby';
import { Bet } from './types';
import { COUNTRIES, fetchSpotPrices, fetchAllFlows, fetchGeneration, fetchTotalLoad, fetchWeather, SpotPrice, Flow, Generation, TotalLoad, Weather } from './services/dataService';
import { SlotText } from './components/SlotText';

const FOSSIL_TYPES = ['LIGNITE', 'FOSSIL-GAS', 'HARD-COAL', 'COAL-DERVIED GAS', 'FOSSIL', 'OIL'];
const RENEWABLE_TYPES = [
  'WIND-OFFSHORE', 'WIND-ONSHORE', 'SOLAR', 
  'BIOMASS', 'HYDRO-PUMPED-STORAGE', 'HYDRO-ROR', 'HYDRO-WATER-RESERVOIR', 
  'OTHER-RENEWABLE'
];

export default function App() {
  const [country, setCountry] = useState<string | null>(null);
  const [pendingCountry, setPendingCountry] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Data state
  const [spotPrices, setSpotPrices] = useState<SpotPrice[]>([]);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [totalLoads, setTotalLoads] = useState<TotalLoad[]>([]);
  const [weathers, setWeathers] = useState<Weather[]>([]);
  
  const [balance, setBalance] = useState(1000);
  const [bets, setBets] = useState<Bet[]>([]);
  const [selectedChip, setSelectedChip] = useState(5);
  const [spinning, setSpinning] = useState(false);
  const [targetNumber, setTargetNumber] = useState<number | null>(null);
  const [history, setHistory] = useState<{value: number, color: string}[]>([]);
  const [isSlotSpinning, setIsSlotSpinning] = useState(false);
  
  // Current Round Data
  const [currentRound, setCurrentRound] = useState<{
    time: string;
    renewablePercentage: number;
    isFossilWinner: boolean;
    isRenewableWinner: boolean;
    isImporting: boolean;
    isExporting: boolean;
    roundPercentages: number[];
    winningIndex: number;
    weather?: Weather;
  } | null>(null);

  const [winStatus, setWinStatus] = useState<{ amount: number, type: 'win' | 'lose', message: string } | null>(null);

  const [gridLauncherUrl, setGridLauncherUrl] = useState<string | null>(null);

  const loadData = async (selectedCountry: string) => {
    setLoading(true);
    try {
      const [prices, allFlows, genData, loadData, weatherData] = await Promise.all([
        fetchSpotPrices(selectedCountry),
        fetchAllFlows(),
        fetchGeneration(selectedCountry),
        fetchTotalLoad(selectedCountry),
        fetchWeather(selectedCountry)
      ]);
      setSpotPrices(prices);
      setFlows(allFlows);
      setGenerations(genData);
      setTotalLoads(loadData);
      setWeathers(weatherData);
      setCountry(selectedCountry);
      prepareNextRound(prices, allFlows, genData, loadData, weatherData, selectedCountry);
    } catch (e) {
      console.error(e);
      alert("Failed to load data");
    }
    setLoading(false);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gridUrlFromQuery = params.get('grid_url');
    if (gridUrlFromQuery) {
      setGridLauncherUrl(gridUrlFromQuery);
    }

    const countryFromQuery = params.get('country');
    if (!countryFromQuery) return;
    const normalizedCountry = countryFromQuery.toUpperCase();
    if (COUNTRIES.includes(normalizedCountry)) {
      setPendingCountry(normalizedCountry);
    }
  }, []);

  const launchGridCasino = () => {
    if (!pendingCountry) return;
    if (!gridLauncherUrl) {
      alert('Grid Casino is not available yet. Build or run the grid-casino app first.');
      return;
    }
    try {
      const hubUrl = new URL(window.location.href);
      hubUrl.searchParams.delete('country');
      if (gridLauncherUrl) {
        hubUrl.searchParams.set('grid_url', gridLauncherUrl);
      }

      const targetUrl = new URL(gridLauncherUrl);
      targetUrl.searchParams.set('country', pendingCountry);
      targetUrl.searchParams.set('return_url', hubUrl.toString());
      window.location.href = targetUrl.toString();
    } catch {
      const separator = gridLauncherUrl.includes('?') ? '&' : '?';
      window.location.href = `${gridLauncherUrl}${separator}country=${encodeURIComponent(pendingCountry)}`;
    }
  };

  const prepareNextRound = (
    prices: SpotPrice[], 
    allFlows: Flow[], 
    genData: Generation[], 
    loadData: TotalLoad[], 
    weatherData: Weather[], 
    currentCountry: string
  ) => {
    if (prices.length < 2) return;
    
    // Pick a random index
    const idx = Math.floor(Math.random() * prices.length);
    const current = prices[idx];

    // Calculate flows for this hour involving this country
    const hourFlows = allFlows.filter(f => f.time === current.time);
    let totalImport = 0;
    let totalExport = 0;
    hourFlows.forEach(f => {
      const [from, to] = f.zone.split('->');
      if (to === currentCountry) totalImport += f.value;
      if (from === currentCountry) totalExport += f.value;
    });

    // Calculate generation
    const hourGen = genData.filter(g => g.time === current.time);
    let fossilSum = 0;
    let renewableSum = 0;
    hourGen.forEach(g => {
      if (FOSSIL_TYPES.includes(g.type)) fossilSum += g.value;
      if (RENEWABLE_TYPES.includes(g.type)) renewableSum += g.value;
    });

    // Calculate total load
    const hourLoad = loadData.find(l => l.time === current.time)?.value || 1; // avoid div by 0
    const renewablePercentage = Math.min(100, Math.max(0, (renewableSum / hourLoad) * 100));

    // Weather
    // Weather data might be hourly (e.g. 2024-01-01T00:00) while prices might be 15-min.
    // We can try to find exact match, or match by hour.
    const hourPrefix = current.time.substring(0, 13); // "2024-01-01T00"
    const weather = weatherData.find(w => w.time.startsWith(hourPrefix));

    const isFossilWinner = renewablePercentage < 50;
    const isRenewableWinner = renewablePercentage >= 50;
    const isImporting = totalImport > totalExport;
    const isExporting = totalExport >= totalImport;

    let winningIndex = Math.round((renewablePercentage / 100) * 36);

    // Generate 37 percentages (0-100 in increasing order)
    const roundPercentages = Array.from({ length: 37 }, (_, i) => parseFloat(((i / 36) * 100).toFixed(1)));

    setCurrentRound({
      time: current.time,
      renewablePercentage,
      isFossilWinner,
      isRenewableWinner,
      isImporting,
      isExporting,
      roundPercentages,
      winningIndex,
      weather
    });
  };

  const placeBet = (type: Bet['type'], value: Bet['value']) => {
    if (spinning || winStatus || isSlotSpinning) return;
    if (balance < selectedChip) return;
    
    setBalance(prev => prev - selectedChip);
    setBets(prev => [...prev, { id: Math.random().toString(), type, value, amount: selectedChip }]);
  };

  const clearBets = () => {
    if (spinning || winStatus || isSlotSpinning) return;
    const totalBets = bets.reduce((sum, b) => sum + b.amount, 0);
    setBalance(prev => prev + totalBets);
    setBets([]);
  };

  const spin = () => {
    if (spinning || bets.length === 0 || !currentRound || winStatus || isSlotSpinning) return;
    setWinStatus(null);
    
    setTargetNumber(currentRound.winningIndex);
    setSpinning(true);
  };

  const isWin = (bet: Bet, result: number) => {
    if (bet.type === 'straight') return bet.value === result;
    if (result === 0) return false;

    if (bet.type === 'column') {
      if (bet.value === 1) return result % 3 === 1;
      if (bet.value === 2) return result % 3 === 2;
      if (bet.value === 3) return result % 3 === 0;
    }
    if (bet.type === 'dozen') {
      if (bet.value === 1) return result >= 1 && result <= 12;
      if (bet.value === 2) return result >= 13 && result <= 24;
      if (bet.value === 3) return result >= 25 && result <= 36;
    }
    if (bet.type === 'half') {
      if (bet.value === 'low') return result >= 1 && result <= 18;
      if (bet.value === 'high') return result >= 19 && result <= 36;
    }
    
    // Custom Outside Bets Logic based on data
    if (bet.type === 'evenOdd') {
      if (bet.value === 'even') return currentRound?.isImporting;
      if (bet.value === 'odd') return currentRound?.isExporting;
    }
    if (bet.type === 'color') {
      if (bet.value === 'red') return currentRound?.isRenewableWinner;
      if (bet.value === 'black') return currentRound?.isFossilWinner;
    }
    return false;
  };

  const getPayout = (type: Bet['type']) => {
    switch (type) {
      case 'straight': return 35;
      case 'column':
      case 'dozen': return 2;
      case 'half':
      case 'evenOdd':
      case 'color': return 1;
      default: return 0;
    }
  };

  const handleSpinComplete = () => {
    setSpinning(false);
    
    const isRed = RED_NUMBERS.includes(targetNumber!);
    const colorClass = targetNumber === 0 ? 'bg-green-600' : isRed ? 'bg-red-600' : 'bg-slate-900';
    
    setHistory(prev => [{ value: currentRound!.roundPercentages[targetNumber!], color: colorClass }, ...prev].slice(0, 10));
    
    let totalWin = 0;
    bets.forEach(bet => {
      if (isWin(bet, targetNumber!)) {
        totalWin += bet.amount + bet.amount * getPayout(bet.type);
      }
    });
    
    let message = `Renewables met ${currentRound?.renewablePercentage.toFixed(1)}% of the load (Closest pocket: ${currentRound?.roundPercentages[targetNumber!]}%). `;
    if (currentRound?.isFossilWinner) message += "Fossil fuels won the hour. ";
    if (currentRound?.isRenewableWinner) message += "Renewables won the hour. ";
    if (currentRound?.isImporting) message += "The country was a net importer. ";
    if (currentRound?.isExporting) message += "The country was a net exporter. ";

    if (totalWin > 0) {
      setBalance(prev => prev + totalWin);
      setWinStatus({ amount: totalWin, type: 'win', message: `${message} You win $${totalWin}!` });
    } else {
      setWinStatus({ amount: 0, type: 'lose', message: `${message} You lose.` });
    }
    
    setBets([]);
  };

  const handlePlayAgain = () => {
    setWinStatus(null);
    setIsSlotSpinning(true);
    setTimeout(() => {
      prepareNextRound(spotPrices, flows, generations, totalLoads, weathers, country!);
      setIsSlotSpinning(false);
    }, 1500);
  };

  const handleChangeTable = () => {
    setCountry(null);
    setPendingCountry(null);
    setWinStatus(null);
    setCurrentRound(null);
    setBets([]);
  };

  const getChipColorClass = (amount: number) => {
    if (amount >= 500) return 'bg-purple-600 border-purple-400';
    if (amount >= 100) return 'bg-slate-900 border-slate-600';
    if (amount >= 25) return 'bg-green-600 border-green-400';
    if (amount >= 5) return 'bg-red-600 border-red-400';
    return 'bg-blue-600 border-blue-400';
  };

  return (
    <>
      {!country ? (
        <>
          {loading ? (
            <div className="h-screen bg-slate-900 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
              Loading Market Data...
            </div>
          ) : pendingCountry ? (
            <div className="h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white font-sans flex flex-col items-center justify-center p-8 overflow-hidden">
              <div className="w-full max-w-3xl bg-black/50 border border-white/10 rounded-3xl shadow-2xl p-8">
                <div className="text-center mb-8">
                  <div className="text-4xl font-serif text-yellow-500 tracking-widest mb-2">TABLE {pendingCountry}</div>
                  <p className="text-gray-300">Choose which game you want to play for this selected country.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => void loadData(pendingCountry)}
                    className="p-6 rounded-2xl border border-yellow-500/40 bg-yellow-500/10 hover:bg-yellow-500/20 text-left transition-colors"
                  >
                    <div className="text-xl font-bold text-yellow-400 mb-1">Energy Roulette</div>
                    <div className="text-sm text-gray-300">Play the wheel and data-driven betting table.</div>
                  </button>
                  <button
                    onClick={launchGridCasino}
                    className="p-6 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-left transition-colors"
                  >
                    <div className="text-xl font-bold text-emerald-400 mb-1">Grid Casino</div>
                    <div className="text-sm text-gray-300">Switch to the storage trading game for the same country.</div>
                  </button>
                </div>
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setPendingCountry(null)}
                    className="px-5 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-600 transition-colors"
                  >
                    Back to country map
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <Lobby onSelect={setPendingCountry} />
          )}
        </>
      ) : (
        <div className="h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white font-sans flex flex-col items-center py-3 overflow-hidden">
          <div className="w-full max-w-7xl origin-top scale-[0.88] lg:scale-[0.92] 2xl:scale-[0.96]">
          <div className="flex items-center justify-between w-full px-4 mb-6">
            <button onClick={handleChangeTable} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-600 transition-colors">
              &larr; CHANGE TABLE
            </button>
            <div className="text-4xl font-serif text-yellow-500 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] tracking-widest">
              TABLE {country}
            </div>
            <div className="w-[132px]" />
          </div>

          {currentRound && (
            <div className="flex flex-col items-center mb-6 gap-2">
              <div className="bg-black/40 px-6 py-3 rounded-xl border border-white/10 flex gap-8 text-sm tracking-wider shadow-lg">
                <div><span className="text-gray-400">DATE:</span> <span className="font-mono text-yellow-400"><SlotText text={currentRound.time.split('T')[0]} isSpinning={isSlotSpinning} /></span></div>
                <div><span className="text-gray-400">HOUR:</span> <span className="font-mono text-yellow-400"><SlotText text={currentRound.time.split('T')[1]} isSpinning={isSlotSpinning} /></span></div>
              </div>
              {currentRound.weather && (
                <div className="text-xs text-gray-300 font-mono flex gap-6 bg-black/20 px-6 py-2 rounded-full border border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">TEMP:</span>
                    <span>{currentRound.weather.temperature}°C</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">WIND:</span>
                    <span>{currentRound.weather.windSpeed} km/h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">CLOUD:</span>
                    <span>{currentRound.weather.cloudCover}%</span>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col xl:flex-row gap-8 items-center justify-center w-full px-4">
            
            <div className="relative w-80 h-80 lg:w-[400px] lg:h-[400px] shrink-0">
              <RouletteWheel spinning={spinning} targetNumber={targetNumber} onStop={handleSpinComplete} roundPrices={currentRound?.roundPercentages || []} />
              
              <AnimatePresence>
                {winStatus && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    className="absolute inset-0 flex items-center justify-center z-20"
                  >
                    <div className={`flex flex-col items-center text-center p-6 rounded-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md border-2 ${winStatus.type === 'win' ? 'bg-green-600/95 border-green-400 text-white' : 'bg-red-600/95 border-red-400 text-white'}`}>
                      <div className="text-3xl font-black mb-2">
                        {winStatus.type === 'win' ? `YOU WIN $${winStatus.amount}!` : 'YOU LOSE'}
                      </div>
                      <div className="text-sm font-medium max-w-[250px] leading-snug mb-4">
                        {winStatus.message}
                      </div>
                      <button 
                        onClick={handlePlayAgain}
                        className="px-6 py-2 bg-white text-black font-bold rounded-full shadow-lg hover:scale-105 transition-transform"
                      >
                        PLAY AGAIN
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-6 w-full max-w-4xl overflow-hidden relative">
              <div className="flex gap-2 overflow-x-auto p-3 bg-black/40 rounded-xl border border-white/10 hide-scrollbar">
                {history.length === 0 && <div className="text-gray-500 italic text-sm py-1">No spins yet...</div>}
                {history.map((item, i) => (
                  <div key={i} className={`h-10 px-3 flex items-center justify-center rounded-full font-bold text-sm shrink-0 shadow-inner border border-white/20 ${item.color}`}>
                    {item.value}%
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto pb-4">
                <BettingBoard bets={bets} onBet={placeBet} roundPrices={currentRound?.roundPercentages || []} />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-6 bg-black/50 p-6 rounded-2xl border border-white/10 shadow-2xl">
                
                <div className="flex gap-3">
                  {[1, 5, 25, 100, 500].map(val => (
                    <button 
                      key={val}
                      onClick={() => setSelectedChip(val)}
                      className={`w-14 h-14 rounded-full font-bold flex items-center justify-center border-4 transition-all ${selectedChip === val ? 'scale-110 border-yellow-400 shadow-[0_0_20px_rgba(250,204,21,0.6)] z-10' : 'border-dashed hover:scale-105 opacity-80 hover:opacity-100'} ${getChipColorClass(val)}`}
                    >
                      ${val}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-8">
                  <div className="flex flex-col">
                    <span className="text-gray-400 uppercase text-xs tracking-wider mb-1">Balance</span>
                    <span className="font-mono font-bold text-2xl text-yellow-400">${balance}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-gray-400 uppercase text-xs tracking-wider mb-1">Total Bet</span>
                    <span className="font-mono font-bold text-2xl text-white">${bets.reduce((s,b)=>s+b.amount,0)}</span>
                  </div>
                  
                  <div className="flex gap-3 ml-4">
                    <button 
                      onClick={clearBets}
                      disabled={spinning || bets.length === 0 || !!winStatus || isSlotSpinning}
                      className="px-6 py-2 bg-red-950 hover:bg-red-900 text-red-200 rounded-xl font-semibold disabled:opacity-50 transition-colors border border-red-800"
                    >
                      Clear
                    </button>
                    <button 
                      onClick={spin}
                      disabled={spinning || bets.length === 0 || !!winStatus || isSlotSpinning}
                      className="px-10 py-2 bg-gradient-to-b from-yellow-400 to-yellow-600 hover:from-yellow-300 hover:to-yellow-500 text-black font-black text-2xl rounded-xl shadow-[0_0_20px_rgba(250,204,21,0.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 border border-yellow-300"
                    >
                      SPIN
                    </button>
                  </div>
                </div>

              </div>
            </div>

          </div>
          </div>
        </div>
      )}
    </>
  );
}

