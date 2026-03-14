import https from 'https';
import readline from 'readline';

https.get('https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/flows/DK1-physical-flows-in.csv', (res) => {
  const rl = readline.createInterface({ input: res });
  let min = Infinity;
  let max = -Infinity;
  rl.on('line', (line) => {
    const parts = line.split(',');
    if (parts.length > 2) {
      const val = parseFloat(parts[2]);
      if (!isNaN(val)) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
  });
  rl.on('close', () => {
    console.log(`Min: ${min}, Max: ${max}`);
  });
});
