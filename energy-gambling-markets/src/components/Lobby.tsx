import { useState } from 'react';
import { motion } from 'framer-motion';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';

const geoUrl = "https://unpkg.com/world-atlas@2.0.2/countries-110m.json";

const COUNTRY_MAP: Record<string, string> = {
  'Austria': 'AT',
  'Belgium': 'BE',
  'Switzerland': 'CH',
  'Czechia': 'CZ',
  'Germany': 'DE',
  'Denmark': 'DK1',
  'France': 'FR',
  'Netherlands': 'NL',
  'Poland': 'PL'
};

export const Lobby = ({ onSelect, onShowHelp }: { onSelect: (country: string) => void, onShowHelp: () => void }) => {
  const [hoveredCountry, setHoveredCountry] = useState<string | null>(null);

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white font-sans flex flex-col items-center justify-center p-6 overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-6xl font-serif text-yellow-500 mb-4 drop-shadow-[0_0_15px_rgba(234,179,8,0.5)] tracking-widest text-center"
      >
        ENERGY GAMBLING MARKETS
      </motion.div>
      <div className="flex flex-col items-center mb-8">
        <p className="text-gray-400 text-lg tracking-widest uppercase mb-4">Select a country on the map to join a table</p>
        <button 
          onClick={onShowHelp}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-bold border border-slate-600 transition-colors flex items-center gap-2"
        >
          <span className="w-5 h-5 flex items-center justify-center bg-yellow-500 text-black rounded-full text-[10px]">?</span>
          HOW TO PLAY
        </button>
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className="bg-black/50 rounded-3xl border border-white/10 shadow-2xl w-full max-w-5xl h-[68vh] max-h-[620px] min-h-[430px] relative overflow-hidden flex items-center justify-center"
      >
        <ComposableMap
          projection="geoAzimuthalEqualArea"
          projectionConfig={{
            rotate: [-10.0, -52.0, 0],
            center: [5, 2],
            scale: 1200
          }}
          className="w-full h-full outline-none"
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const countryName = geo.properties.name;
                const tableCode = COUNTRY_MAP[countryName];
                const isSelectable = !!tableCode;

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    onMouseEnter={() => {
                      if (isSelectable) setHoveredCountry(countryName);
                    }}
                    onMouseLeave={() => {
                      setHoveredCountry(null);
                    }}
                    onClick={() => {
                      if (isSelectable) onSelect(tableCode);
                    }}
                    style={{
                      default: {
                        fill: isSelectable ? "#1e293b" : "#0f172a",
                        stroke: "#334155",
                        strokeWidth: 0.5,
                        outline: "none",
                      },
                      hover: {
                        fill: isSelectable ? "#eab308" : "#0f172a",
                        stroke: isSelectable ? "#fef08a" : "#334155",
                        strokeWidth: 1,
                        outline: "none",
                        cursor: isSelectable ? "pointer" : "default",
                      },
                      pressed: {
                        fill: isSelectable ? "#ca8a04" : "#0f172a",
                        outline: "none",
                      }
                    }}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        {hoveredCountry && (
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-slate-900/90 border border-yellow-500/50 text-yellow-400 px-6 py-3 rounded-full font-bold tracking-widest shadow-[0_0_15px_rgba(234,179,8,0.3)] pointer-events-none">
            {hoveredCountry.toUpperCase()} (TABLE {COUNTRY_MAP[hoveredCountry]})
          </div>
        )}
      </motion.div>
    </div>
  );
};

