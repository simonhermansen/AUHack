import https from 'https';
import readline from 'readline';

https.get('https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/flows/DK1-physical-flows-in.csv', (res) => {
  const rl = readline.createInterface({ input: res });
  const zones = new Set();
  rl.on('line', (line) => {
    const parts = line.split(',');
    if (parts.length > 0 && parts[0].startsWith('DK1->')) {
      zones.add(parts[0]);
    }
  });
  rl.on('close', () => {
    console.log("DK1-> zones:", Array.from(zones).join(' | '));
  });
});
