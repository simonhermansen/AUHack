import { Bet } from '../types';
import { RED_NUMBERS } from './RouletteWheel';

const row3 = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36];
const row2 = [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35];
const row1 = [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34];

const Chip = ({ amount }: { amount: number }) => {
  let color = 'bg-blue-600';
  if (amount >= 500) color = 'bg-purple-600';
  else if (amount >= 100) color = 'bg-slate-900';
  else if (amount >= 25) color = 'bg-green-600';
  else if (amount >= 5) color = 'bg-red-600';

  return (
    <div className={`absolute z-10 w-6 h-6 rounded-full ${color} border-2 border-dashed border-white flex items-center justify-center text-[10px] font-bold text-white shadow-md pointer-events-none`}>
      {amount >= 1000 ? `${amount/1000}k` : amount}
    </div>
  );
};

export const BettingBoard = ({ bets, onBet, roundPrices }: { bets: Bet[], onBet: (type: Bet['type'], value: any) => void, roundPrices: number[] }) => {
  
  const getBetAmount = (type: Bet['type'], value: any) => {
    return bets.filter(b => b.type === type && b.value === value).reduce((sum, b) => sum + b.amount, 0);
  };

  const renderCell = (type: Bet['type'], value: any, label: string, className: string, subLabel?: string) => {
    const amount = getBetAmount(type, value);
    return (
      <div 
        key={`${type}-${value}`}
        className={`${className} flex flex-col items-center justify-center text-white font-bold cursor-pointer relative transition-colors select-none`}
        onClick={() => onBet(type, value)}
      >
        <span>{label}</span>
        {subLabel && <span className="text-[10px] text-white/70 font-normal tracking-wider">{subLabel}</span>}
        {amount > 0 && <Chip amount={amount} />}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-[50px_repeat(12,1fr)_50px] grid-rows-5 gap-1 bg-white/10 p-2 rounded-xl w-full border border-white/20 shadow-2xl overflow-x-auto min-w-[700px]">
      {/* Row 1 */}
      {renderCell('straight', 0, roundPrices[0] !== undefined ? roundPrices[0].toString() : '0', 'row-span-3 bg-green-600 hover:bg-green-500 rounded-l-md text-xs', '')}
      {row3.map(n => renderCell('straight', n, roundPrices[n] !== undefined ? roundPrices[n].toString() : n.toString(), `${RED_NUMBERS.includes(n) ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800'} rounded-sm text-xs`))}
      {renderCell('column', 3, '2:1', 'bg-slate-700 hover:bg-slate-600 rounded-tr-md text-xs')}

      {/* Row 2 */}
      {row2.map(n => renderCell('straight', n, roundPrices[n] !== undefined ? roundPrices[n].toString() : n.toString(), `${RED_NUMBERS.includes(n) ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800'} rounded-sm text-xs`))}
      {renderCell('column', 2, '2:1', 'bg-slate-700 hover:bg-slate-600 text-xs')}

      {/* Row 3 */}
      {row1.map(n => renderCell('straight', n, roundPrices[n] !== undefined ? roundPrices[n].toString() : n.toString(), `${RED_NUMBERS.includes(n) ? 'bg-red-600 hover:bg-red-500' : 'bg-slate-900 hover:bg-slate-800'} rounded-sm text-xs`))}
      {renderCell('column', 1, '2:1', 'bg-slate-700 hover:bg-slate-600 rounded-br-md text-xs')}

      {/* Row 4 */}
      {renderCell('dozen', 1, '1st 12', 'col-start-2 col-span-4 bg-slate-700 hover:bg-slate-600 rounded-md mt-1 py-2')}
      {renderCell('dozen', 2, '2nd 12', 'col-span-4 bg-slate-700 hover:bg-slate-600 rounded-md mt-1 py-2')}
      {renderCell('dozen', 3, '3rd 12', 'col-span-4 bg-slate-700 hover:bg-slate-600 rounded-md mt-1 py-2')}

      {/* Row 5 */}
      {renderCell('half', 'low', '0% - 50%', 'col-start-2 col-span-2 bg-slate-700 hover:bg-slate-600 rounded-md mt-1 py-2')}
      {renderCell('evenOdd', 'even', 'IMPORTING', 'col-span-2 bg-slate-700 hover:bg-slate-600 rounded-md mt-1 py-2')}
      {renderCell('color', 'red', 'RENEWABLES', 'col-span-2 bg-red-600 hover:bg-red-500 rounded-md mt-1 py-2', 'WIN')}
      {renderCell('color', 'black', 'FOSSIL', 'col-span-2 bg-slate-900 hover:bg-slate-800 rounded-md mt-1 py-2', 'WINS')}
      {renderCell('evenOdd', 'odd', 'EXPORTING', 'col-span-2 bg-slate-700 hover:bg-slate-600 rounded-md mt-1 py-2')}
      {renderCell('half', 'high', '50% - 100%', 'col-span-2 bg-slate-700 hover:bg-slate-600 rounded-md mt-1 py-2')}
    </div>
  );
};

