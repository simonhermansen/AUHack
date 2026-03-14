import Papa from 'papaparse';

export interface SpotPriceRecord {
  time: string;
  value: number;
}

export interface GenerationMix {
  renewableMW: number;
  fossilMW: number;
  renewablePct: number;
  fossilPct: number;
  totalMW: number;
  topSources: Array<{ type: string; value: number }>;
}

export interface CountryData {
  id: string;
  name: string;
  flag: string;
  records: SpotPriceRecord[];
  generationMixByTime: Record<string, GenerationMix>;
  averagePrice: number;
  medianPrice: number;
}

export const COUNTRIES = [
  { id: 'AT', name: 'Austria', flag: '🇦🇹' },
  { id: 'BE', name: 'Belgium', flag: '🇧🇪' },
  { id: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { id: 'CZ', name: 'Czechia', flag: '🇨🇿' },
  { id: 'DE', name: 'Germany', flag: '🇩🇪' },
  { id: 'DK1', name: 'Denmark', flag: '🇩🇰' },
  { id: 'FR', name: 'France', flag: '🇫🇷' },
  { id: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { id: 'PL', name: 'Poland', flag: '🇵🇱' },
];

const RENEWABLE_TYPES = new Set([
  'WIND-OFFSHORE',
  'WIND-ONSHORE',
  'SOLAR',
  'BIOMASS',
  'HYDRO-PUMPED-STORAGE',
  'HYDRO-ROR',
  'HYDRO-WATER-RESERVOIR',
  'OTHER-RENEWABLE',
]);

const FOSSIL_TYPES = new Set([
  'LIGNITE',
  'FOSSIL-GAS',
  'HARD-COAL',
  'COAL-DERVIED GAS',
  'FOSSIL',
  'OIL',
]);

function parseSpotPriceRecords(csvText: string): SpotPriceRecord[] {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  return (parsed.data as any[])
    .map((row: any) => ({
      time: row['time'],
      value: parseFloat(row['value (EUR/MWh)']),
    }))
    .filter((r) => !isNaN(r.value) && r.time);
}

function parseGenerationMixByTime(csvText: string): Record<string, GenerationMix> {
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const rows = parsed.data as any[];

  const byTime: Record<string, Record<string, number>> = {};
  rows.forEach((row: any) => {
    const time = row.time;
    const type = String(row.type || '').toUpperCase();
    const value = parseFloat(row['value (MW)']);
    if (!time || isNaN(value)) return;
    if (!byTime[time]) byTime[time] = {};
    byTime[time][type] = (byTime[time][type] || 0) + value;
  });

  const mixByTime: Record<string, GenerationMix> = {};
  Object.entries(byTime).forEach(([time, typeMap]) => {
    let renewableMW = 0;
    let fossilMW = 0;
    let totalMW = 0;

    const typeEntries = Object.entries(typeMap);
    typeEntries.forEach(([type, value]) => {
      totalMW += value;
      if (RENEWABLE_TYPES.has(type)) renewableMW += value;
      if (FOSSIL_TYPES.has(type)) fossilMW += value;
    });

    const renewablePct = totalMW > 0 ? (renewableMW / totalMW) * 100 : 0;
    const fossilPct = totalMW > 0 ? (fossilMW / totalMW) * 100 : 0;
    const topSources = typeEntries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, value]) => ({ type, value }));

    mixByTime[time] = {
      renewableMW,
      fossilMW,
      renewablePct,
      fossilPct,
      totalMW,
      topSources,
    };
  });

  return mixByTime;
}

export async function fetchCountryData(countryId: string): Promise<CountryData> {
  const spotUrl = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/spot-price/${countryId}-spot-price.csv`;
  const generationUrl = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/generation/${countryId}-generation.csv`;

  const [spotResponse, generationResponse] = await Promise.all([fetch(spotUrl), fetch(generationUrl)]);
  if (!spotResponse.ok) {
    throw new Error(`Failed to fetch data for ${countryId}`);
  }
  if (!generationResponse.ok) {
    throw new Error(`Failed to fetch generation data for ${countryId}`);
  }

  const [spotCsvText, generationCsvText] = await Promise.all([
    spotResponse.text(),
    generationResponse.text(),
  ]);
  const records = parseSpotPriceRecords(spotCsvText);
  const generationMixByTime = parseGenerationMixByTime(generationCsvText);

  if (records.length === 0) {
    throw new Error('No valid data found');
  }

  const values = records.map(r => r.value).sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const averagePrice = sum / values.length;
  const medianPrice = values[Math.floor(values.length / 2)];

  const countryInfo = COUNTRIES.find(c => c.id === countryId)!;
  
  return {
    id: countryId,
    name: countryInfo.name,
    flag: countryInfo.flag,
    records,
    generationMixByTime,
    averagePrice,
    medianPrice,
  };
}
