import Papa from 'papaparse';

export const COUNTRIES = ['AT', 'BE', 'CH', 'CZ', 'DE', 'DK1', 'FR', 'NL', 'PL'];

export const FLOW_COUNTRIES = ['AT', 'BE', 'CH', 'CZ', 'DE', 'DK1', 'DK2', 'FR', 'NL', 'NO2', 'PL', 'SE4'];

export interface SpotPrice {
  time: string;
  value: number;
}

export interface Flow {
  zone: string;
  time: string;
  value: number;
}

export interface Generation {
  type: string;
  time: string;
  value: number;
}

export interface TotalLoad {
  time: string;
  value: number;
}

export interface Weather {
  time: string;
  temperature: number;
  windSpeed: number;
  cloudCover: number;
}

export const fetchSpotPrices = async (country: string): Promise<SpotPrice[]> => {
  const url = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/spot-price/${country}-spot-price.csv`;
  const res = await fetch(url);
  const text = await res.text();
  
  return new Promise((resolve) => {
    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data
          .map((row: any) => ({
            time: row.time,
            value: parseFloat(row['value (EUR/MWh)'])
          }))
          .filter((row: any) => !isNaN(row.value));
        resolve(data);
      }
    });
  });
};

export const fetchAllFlows = async (): Promise<Flow[]> => {
  const promises = FLOW_COUNTRIES.map(async (country) => {
    const url = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/flows/${country}-physical-flows-in.csv`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const text = await res.text();
      return new Promise<Flow[]>((resolve) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const data = results.data
              .map((row: any) => ({
                zone: row.zone,
                time: row.time,
                value: parseFloat(row['value (MW)'])
              }))
              .filter((row: any) => !isNaN(row.value));
            resolve(data);
          }
        });
      });
    } catch (e) {
      console.error(`Failed to fetch flows for ${country}`, e);
      return [];
    }
  });

  const allResults = await Promise.all(promises);
  return allResults.flat();
};

export const fetchGeneration = async (country: string): Promise<Generation[]> => {
  const url = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/generation/${country}-generation.csv`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data
            .map((row: any) => ({
              type: row.type,
              time: row.time,
              value: parseFloat(row['value (MW)'])
            }))
            .filter((row: any) => !isNaN(row.value));
          resolve(data);
        }
      });
    });
  } catch (e) {
    console.error(`Failed to fetch generation for ${country}`, e);
    return [];
  }
};

export const fetchTotalLoad = async (country: string): Promise<TotalLoad[]> => {
  const url = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/total-load/${country}-total-load.csv`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    return new Promise((resolve) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data
            .map((row: any) => ({
              time: row.time,
              value: parseFloat(row['value (MW)'])
            }))
            .filter((row: any) => !isNaN(row.value));
          resolve(data);
        }
      });
    });
  } catch (e) {
    console.error(`Failed to fetch total load for ${country}`, e);
    return [];
  }
};

const WEATHER_FILES: Record<string, string> = {
  'AT': 'AT-open-meteo-47.35N13.40E1357m.csv',
  'BE': 'BE-open-meteo-50.72N4.48E94m.csv',
  'CH': 'CH-open-meteo-46.99N8.04E920m.csv',
  'CZ': 'CZ-open-meteo-49.74N14.97E430m.csv',
  'DE': 'DE-open-meteo-51.49N10.43E309m.csv',
  'DK1': 'DK-open-meteo-55.99N9.96E56m.csv',
  'FR': 'FR-open-meteo-46.01N2.00E550m.csv',
  'NL': 'NL-open-meteo-52.76N5.90E1m.csv',
  'PL': 'PL-open-meteo-51.99N19.98E113m.csv'
};

export const fetchWeather = async (country: string): Promise<Weather[]> => {
  const filename = WEATHER_FILES[country];
  if (!filename) return [];
  const url = `https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/weather/${filename}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const text = await res.text();
    
    // The weather CSV has 2 lines of metadata, an empty line, then the actual CSV headers.
    // We can split by lines and find the index of the header row.
    const lines = text.split('\n');
    const headerIndex = lines.findIndex(line => line.startsWith('time,temperature_2m'));
    const csvText = lines.slice(headerIndex).join('\n');

    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data
            .map((row: any) => ({
              time: row.time,
              temperature: parseFloat(row['temperature_2m (°C)']),
              windSpeed: parseFloat(row['wind_speed_10m (km/h)']),
              cloudCover: parseFloat(row['cloud_cover (%)'])
            }))
            .filter((row: any) => !isNaN(row.temperature));
          resolve(data);
        }
      });
    });
  } catch (e) {
    console.error(`Failed to fetch weather for ${country}`, e);
    return [];
  }
};
