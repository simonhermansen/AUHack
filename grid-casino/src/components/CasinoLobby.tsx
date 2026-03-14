import { motion } from 'motion/react';
import { COUNTRIES } from '../services/dataService';
import { Zap, TrendingUp, Coins } from 'lucide-react';

interface CasinoLobbyProps {
  onSelectGame: (countryId: string) => void;
  balance: number;
}

export function CasinoLobby({ onSelectGame, balance }: CasinoLobbyProps) {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans selection:bg-emerald-500/30">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-16 pt-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Zap className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Grid Casino</h1>
              <p className="text-sm text-zinc-400 font-mono">Beat the Energy Market</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-full px-4 py-2">
            <Coins className="w-5 h-5 text-amber-400" />
            <span className="font-mono font-bold text-lg text-white">€{balance.toFixed(2)}</span>
          </div>
        </header>

        <div className="mb-12">
          <h2 className="text-4xl font-bold tracking-tight mb-4">Choose Your Table</h2>
          <p className="text-zinc-400 text-lg max-w-2xl">
            Select a European energy market to play. Each market has its own volatility and average spot price.
            Will you charge when it's cheap, or discharge when it spikes?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {COUNTRIES.map((country, index) => (
            <motion.button
              key={country.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              onClick={() => onSelectGame(country.id)}
              className="group relative flex flex-col items-start p-6 text-left bg-zinc-900/50 border border-zinc-800 rounded-2xl hover:bg-zinc-800/80 hover:border-emerald-500/50 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="flex items-center justify-between w-full mb-4">
                <span className="text-4xl">{country.flag}</span>
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center group-hover:bg-emerald-500/20 group-hover:text-emerald-400 transition-colors">
                  <TrendingUp className="w-4 h-4" />
                </div>
              </div>
              
              <h3 className="text-xl font-bold text-white mb-1">{country.name}</h3>
              <p className="text-sm text-zinc-500 font-mono">{country.id} Market</p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
