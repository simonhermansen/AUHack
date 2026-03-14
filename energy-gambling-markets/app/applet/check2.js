import https from 'https';
import readline from 'readline';

https.get('https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/flows/DK1-physical-flows-in.csv', (res) => {
  const rl = readline.createInterface({ input: res });
  const zones = new Set();
  let count = 0;
  rl.on('line', (line) => {
    if (count > 0) {
      const parts = line.split(',');
      if (parts.length > 0) zones.add(parts[0]);
    }
    count++;
  });
  rl.on('close', () => {
    console.log("ZONES:", Array.from(zones).join(' | '));
  });
});
