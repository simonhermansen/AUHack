import Papa from 'papaparse';

export interface SpotPriceRecord {
  time: string;
  value: number;
}

export interface CountryData {
  id: string;
  name: string;
  flag: string;
  records: SpotPriceRecord[];
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

export async function fetchCountryData(countryId: string): Promise<CountryData> {
  const url = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/spot-price/${countryId}-spot-price.csv`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch data for ${countryId}`);
  }
  
  const csvText = await response.text();
  
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const records: SpotPriceRecord[] = results.data
          .map((row: any) => ({
            time: row['time'],
            value: parseFloat(row['value (EUR/MWh)']),
          }))
          .filter((r) => !isNaN(r.value) && r.time);
          
        if (records.length === 0) {
          reject(new Error('No valid data found'));
          return;
        }

        const values = records.map(r => r.value).sort((a, b) => a - b);
        const sum = values.reduce((a, b) => a + b, 0);
        const averagePrice = sum / values.length;
        const medianPrice = values[Math.floor(values.length / 2)];

        const countryInfo = COUNTRIES.find(c => c.id === countryId)!;

        resolve({
          id: countryId,
          name: countryInfo.name,
          flag: countryInfo.flag,
          records,
          averagePrice,
          medianPrice,
        });
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
}
