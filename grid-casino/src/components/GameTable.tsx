import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CountryData, SpotPriceRecord } from '../services/dataService';
import { ArrowLeft, BatteryCharging, BatteryFull, Coins, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

interface GameTableProps {
  countryData: CountryData;
  balance: number;
  onBack: () => void;
  onUpdateBalance: (amount: number) => void;
}

type GameState = 'betting' | 'revealing' | 'result';
type Choice = 'charge' | 'discharge' | null;

export function GameTable({ countryData, balance, onBack, onUpdateBalance }: GameTableProps) {
  const [gameState, setGameState] = useState<GameState>('betting');
  const [currentRecord, setCurrentRecord] = useState<SpotPriceRecord | null>(null);
  const [betAmount, setBetAmount] = useState<number>(10);
  const [choice, setChoice] = useState<Choice>(null);
  const [profit, setProfit] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Pick a random record when the component mounts or when starting a new round
  const startNewRound = () => {
    const randomIndex = Math.floor(Math.random() * countryData.records.length);
    setCurrentRecord(countryData.records[randomIndex]);
    setGameState('betting');
    setChoice(null);
    setProfit(null);
  };

  useEffect(() => {
    startNewRound();
  }, [countryData]);

  const monthlyAverageByMonth = useMemo(() => {
    const monthBuckets: Record<string, { sum: number; count: number }> = {};
    countryData.records.forEach((r) => {
      const dt = new Date(r.time);
      const monthKey = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
      if (!monthBuckets[monthKey]) {
        monthBuckets[monthKey] = { sum: 0, count: 0 };
      }
      monthBuckets[monthKey].sum += r.value;
      monthBuckets[monthKey].count += 1;
    });

    const out: Record<string, number> = {};
    Object.entries(monthBuckets).forEach(([k, v]) => {
      out[k] = v.count > 0 ? v.sum / v.count : 0;
    });
    return out;
  }, [countryData]);

  const monthKey = useMemo(() => {
    if (!currentRecord) return '';
    const dt = new Date(currentRecord.time);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
  }, [currentRecord]);

  const monthlyAverage = monthKey ? monthlyAverageByMonth[monthKey] : undefined;
  const currentMix = currentRecord ? countryData.generationMixByTime[currentRecord.time] : undefined;

  const handleBet = (selectedChoice: Choice) => {
    if (!currentRecord || betAmount > balance || betAmount <= 0) return;
    
    setChoice(selectedChoice);
    setGameState('revealing');

    // Simulate the reveal delay
    setTimeout(() => {
      const price = currentRecord.value;
      const average = monthlyAverage ?? countryData.averagePrice;
      
      let won = false;
      if (selectedChoice === 'charge' && price < average) {
        won = true;
      } else if (selectedChoice === 'discharge' && price > average) {
        won = true;
      }

      const newProfit = won ? betAmount : -betAmount;
      setProfit(newProfit);
      onUpdateBalance(newProfit);
      setGameState('result');
    }, 2000);
  };

  // Get surrounding data for the chart (e.g., 12 hours before and after)
  const chartData = useMemo(() => {
    if (!currentRecord) return [];
    const index = countryData.records.findIndex(r => r.time === currentRecord.time);
    if (index === -1) return [];
    
    const start = Math.max(0, index - 12);
    const end = Math.min(countryData.records.length, index + 13);
    return countryData.records.slice(start, end).map(r => ({
      time: new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      price: r.value,
      isCurrent: r.time === currentRecord.time
    }));
  }, [currentRecord, countryData]);

  if (!currentRecord) return null;

  const dateObj = new Date(currentRecord.time);
  const dateString = dateObj.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeString = dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Lobby</span>
          </button>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowHelp(true)}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-600 transition-colors"
            >
              HOW TO PLAY
            </button>
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-4 py-2">
              <span className="text-2xl">{countryData.flag}</span>
              <span className="font-bold text-white">{countryData.name}</span>
            </div>
            <div className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-full px-4 py-2">
              <Coins className="w-5 h-5 text-yellow-400" />
              <span className="font-mono font-bold text-lg text-white">€{balance.toFixed(2)}</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Game Info & Controls */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-black/50 border border-white/10 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">The Setup</h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 mb-1">Date</p>
                  <p className="text-lg font-medium text-white">{dateString}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400 mb-1">Time</p>
                  <p className="text-3xl font-mono font-bold text-yellow-400">{timeString}</p>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-400 mb-1">House Line (Monthly Average)</p>
                  <p className="text-xl font-mono text-white">€{(monthlyAverage ?? countryData.averagePrice).toFixed(2)} / MWh</p>
                  <p className="text-xs text-gray-400 mt-1">Month bucket: {monthKey || '-'}</p>
                </div>
                {currentMix && (
                  <div className="pt-4 border-t border-white/10 space-y-2">
                    <p className="text-xs text-gray-400">Generation mix for this hour</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2">
                        <p className="text-emerald-300">Renewables</p>
                        <p className="font-mono text-white">{currentMix.renewablePct.toFixed(1)}%</p>
                      </div>
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
                        <p className="text-orange-300">Fossil</p>
                        <p className="font-mono text-white">{currentMix.fossilPct.toFixed(1)}%</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-300">
                      Top sources: {currentMix.topSources.map((s) => `${s.type} (${s.value.toFixed(0)} MW)`).join(', ')}
                    </p>
                  </div>
                )}
                {!currentMix && (
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-xs text-gray-400">Generation mix unavailable for this hour.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-black/50 border border-white/10 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4">Place Your Bet</h2>
              
              <div className="mb-6">
                <label className="text-xs text-gray-400 mb-2 block">Bet Amount (€)</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setBetAmount(Math.max(10, betAmount - 10))}
                    disabled={gameState !== 'betting'}
                    className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center hover:bg-slate-700 disabled:opacity-50"
                  >-</button>
                  <input 
                    type="number" 
                    value={betAmount}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    disabled={gameState !== 'betting'}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg h-10 text-center font-mono text-lg focus:outline-none focus:border-yellow-500 disabled:opacity-50"
                  />
                  <button 
                    onClick={() => setBetAmount(Math.min(balance, betAmount + 10))}
                    disabled={gameState !== 'betting'}
                    className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-600 flex items-center justify-center hover:bg-slate-700 disabled:opacity-50"
                  >+</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleBet('charge')}
                  disabled={gameState !== 'betting' || betAmount > balance || betAmount <= 0}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                    gameState === 'betting' ? "border-slate-700 hover:border-emerald-500 hover:bg-emerald-500/10" : 
                    choice === 'charge' ? "border-emerald-500 bg-emerald-500/20" : "border-slate-700 opacity-50",
                    "disabled:cursor-not-allowed"
                  )}
                >
                  <BatteryCharging className="w-8 h-8 mb-2 text-emerald-400" />
                  <span className="font-bold text-white">Charge</span>
                  <span className="text-xs text-gray-300 mt-1">Bet Below Monthly Avg</span>
                </button>
                
                <button
                  onClick={() => handleBet('discharge')}
                  disabled={gameState !== 'betting' || betAmount > balance || betAmount <= 0}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                    gameState === 'betting' ? "border-slate-700 hover:border-rose-500 hover:bg-rose-500/10" : 
                    choice === 'discharge' ? "border-rose-500 bg-rose-500/20" : "border-slate-700 opacity-50",
                    "disabled:cursor-not-allowed"
                  )}
                >
                  <BatteryFull className="w-8 h-8 mb-2 text-rose-400" />
                  <span className="font-bold text-white">Discharge</span>
                  <span className="text-xs text-gray-300 mt-1">Bet Above Monthly Avg</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: The Reveal & Chart */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-black/50 border border-white/10 rounded-2xl p-8 flex-1 flex flex-col items-center justify-center relative overflow-hidden">
              <AnimatePresence mode="wait">
                {gameState === 'betting' && (
                  <motion.div 
                    key="betting"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="text-center"
                  >
                    <div className="w-24 h-24 mx-auto rounded-full bg-zinc-800 flex items-center justify-center mb-6">
                      <Zap className="w-10 h-10 text-zinc-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">Awaiting Your Bet</h3>
                    <p className="text-gray-300">Will the spot price be higher or lower than this month’s average?</p>
                  </motion.div>
                )}

                {gameState === 'revealing' && (
                  <motion.div 
                    key="revealing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center"
                  >
                    <div className="w-24 h-24 mx-auto rounded-full border-4 border-emerald-500/30 border-t-emerald-500 animate-spin mb-6" />
                    <h3 className="text-2xl font-bold text-white mb-2">Revealing the Market...</h3>
                    <p className="text-gray-300 font-mono">Fetching historical data for {timeString}</p>
                  </motion.div>
                )}

                {gameState === 'result' && (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center w-full"
                  >
                    <div className="mb-8">
                      <p className="text-sm text-zinc-500 uppercase tracking-wider mb-2">Actual Spot Price</p>
                      <div className="flex items-center justify-center gap-4">
                        <span className={cn(
                          "text-6xl font-mono font-bold",
                          currentRecord.value < (monthlyAverage ?? countryData.averagePrice) ? "text-emerald-400" : "text-rose-400"
                        )}>
                          €{currentRecord.value.toFixed(2)}
                        </span>
                        {currentRecord.value < (monthlyAverage ?? countryData.averagePrice) ? (
                          <TrendingDown className="w-8 h-8 text-emerald-400" />
                        ) : (
                          <TrendingUp className="w-8 h-8 text-rose-400" />
                        )}
                      </div>
                      <p className="text-gray-300 mt-2 font-mono">
                        Compared to monthly average: €{(monthlyAverage ?? countryData.averagePrice).toFixed(2)}
                      </p>
                    </div>

                    <div className={cn(
                      "inline-block px-8 py-4 rounded-2xl border-2 mb-8",
                      profit && profit > 0 ? "bg-emerald-500/10 border-emerald-500/50" : "bg-rose-500/10 border-rose-500/50"
                    )}>
                      <h3 className={cn(
                        "text-3xl font-bold mb-1",
                        profit && profit > 0 ? "text-emerald-400" : "text-rose-400"
                      )}>
                        {profit && profit > 0 ? "You Won!" : "You Lost!"}
                      </h3>
                      <p className="text-zinc-300 font-mono">
                        {profit && profit > 0 ? "+" : ""}€{profit?.toFixed(2)}
                      </p>
                    </div>

                    <div className="h-64 w-full mt-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                          <XAxis dataKey="time" stroke="#52525b" fontSize={12} tickMargin={10} />
                          <YAxis stroke="#52525b" fontSize={12} tickFormatter={(value) => `€${value}`} />
                          <ReferenceLine y={monthlyAverage ?? countryData.averagePrice} stroke="#eab308" strokeDasharray="3 3" />
                          <ReferenceLine x={timeString} stroke="#10b981" strokeDasharray="3 3" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                            itemStyle={{ color: '#e4e4e7' }}
                            labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                            formatter={(value: number) => [`€${value.toFixed(2)}`, 'Price']}
                          />
                          <Line 
                            type="monotone" 
                            dataKey="price" 
                            stroke="#3b82f6" 
                            strokeWidth={2} 
                            dot={(props: any) => {
                              const { cx, cy, payload } = props;
                              if (payload.isCurrent) {
                                return <circle key={`dot-${payload.time}`} cx={cx} cy={cy} r={6} fill="#10b981" stroke="#059669" strokeWidth={2} />;
                              }
                              return <circle key={`dot-${payload.time}`} cx={cx} cy={cy} r={0} />;
                            }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    <button
                      onClick={startNewRound}
                      className="mt-8 px-8 py-3 bg-yellow-500 text-black font-bold rounded-full hover:bg-yellow-400 transition-colors"
                    >
                      Play Next Round
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-xl w-full"
            >
              <h3 className="text-2xl font-bold text-yellow-400 mb-4">How to play Grid Casino</h3>
              <p className="text-gray-200 text-sm mb-2">1. Pick your stake and choose Charge (below average) or Discharge (above average).</p>
              <p className="text-gray-200 text-sm mb-2">2. The house line is the monthly average spot price for the selected record’s month.</p>
              <p className="text-gray-200 text-sm mb-4">3. Use the hourly generation mix panel to inform your guess, then reveal the actual price.</p>
              <button
                onClick={() => setShowHelp(false)}
                className="w-full py-3 bg-yellow-500 hover:bg-yellow-400 text-black font-black rounded-xl transition-colors"
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
