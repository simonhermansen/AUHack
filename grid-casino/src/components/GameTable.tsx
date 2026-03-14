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

  const handleBet = (selectedChoice: Choice) => {
    if (!currentRecord || betAmount > balance || betAmount <= 0) return;
    
    setChoice(selectedChoice);
    setGameState('revealing');

    // Simulate the reveal delay
    setTimeout(() => {
      const price = currentRecord.value;
      const average = countryData.averagePrice;
      
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
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <button 
            onClick={onBack}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Lobby</span>
          </button>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2">
              <span className="text-2xl">{countryData.flag}</span>
              <span className="font-bold text-white">{countryData.name}</span>
            </div>
            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2">
              <Coins className="w-5 h-5 text-amber-400" />
              <span className="font-mono font-bold text-lg text-white">€{balance.toFixed(2)}</span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Game Info & Controls */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-4">The Setup</h2>
              
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Date</p>
                  <p className="text-lg font-medium text-white">{dateString}</p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Time</p>
                  <p className="text-3xl font-mono font-bold text-emerald-400">{timeString}</p>
                </div>
                <div className="pt-4 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 mb-1">House Line (Average Price)</p>
                  <p className="text-xl font-mono text-white">€{countryData.averagePrice.toFixed(2)} / MWh</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
              <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-4">Place Your Bet</h2>
              
              <div className="mb-6">
                <label className="text-xs text-zinc-500 mb-2 block">Bet Amount (€)</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setBetAmount(Math.max(10, betAmount - 10))}
                    disabled={gameState !== 'betting'}
                    className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 disabled:opacity-50"
                  >-</button>
                  <input 
                    type="number" 
                    value={betAmount}
                    onChange={(e) => setBetAmount(Number(e.target.value))}
                    disabled={gameState !== 'betting'}
                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg h-10 text-center font-mono text-lg focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                  <button 
                    onClick={() => setBetAmount(Math.min(balance, betAmount + 10))}
                    disabled={gameState !== 'betting'}
                    className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 disabled:opacity-50"
                  >+</button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleBet('charge')}
                  disabled={gameState !== 'betting' || betAmount > balance || betAmount <= 0}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                    gameState === 'betting' ? "border-zinc-800 hover:border-emerald-500 hover:bg-emerald-500/10" : 
                    choice === 'charge' ? "border-emerald-500 bg-emerald-500/20" : "border-zinc-800 opacity-50",
                    "disabled:cursor-not-allowed"
                  )}
                >
                  <BatteryCharging className="w-8 h-8 mb-2 text-emerald-400" />
                  <span className="font-bold text-white">Charge</span>
                  <span className="text-xs text-zinc-400 mt-1">Bet Low</span>
                </button>
                
                <button
                  onClick={() => handleBet('discharge')}
                  disabled={gameState !== 'betting' || betAmount > balance || betAmount <= 0}
                  className={cn(
                    "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all",
                    gameState === 'betting' ? "border-zinc-800 hover:border-rose-500 hover:bg-rose-500/10" : 
                    choice === 'discharge' ? "border-rose-500 bg-rose-500/20" : "border-zinc-800 opacity-50",
                    "disabled:cursor-not-allowed"
                  )}
                >
                  <BatteryFull className="w-8 h-8 mb-2 text-rose-400" />
                  <span className="font-bold text-white">Discharge</span>
                  <span className="text-xs text-zinc-400 mt-1">Bet High</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: The Reveal & Chart */}
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex-1 flex flex-col items-center justify-center relative overflow-hidden">
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
                    <p className="text-zinc-400">Will the spot price be higher or lower than the house line?</p>
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
                    <p className="text-zinc-400 font-mono">Fetching historical data for {timeString}</p>
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
                          currentRecord.value < countryData.averagePrice ? "text-emerald-400" : "text-rose-400"
                        )}>
                          €{currentRecord.value.toFixed(2)}
                        </span>
                        {currentRecord.value < countryData.averagePrice ? (
                          <TrendingDown className="w-8 h-8 text-emerald-400" />
                        ) : (
                          <TrendingUp className="w-8 h-8 text-rose-400" />
                        )}
                      </div>
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
                          <ReferenceLine y={countryData.averagePrice} stroke="#52525b" strokeDasharray="3 3" />
                          <ReferenceLine x={timeString} stroke="#10b981" strokeDasharray="3 3" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
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
                      className="mt-8 px-8 py-3 bg-white text-black font-bold rounded-full hover:bg-zinc-200 transition-colors"
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
    </div>
  );
}
