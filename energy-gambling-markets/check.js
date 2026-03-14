import fs from 'fs';
import https from 'https';

https.get('https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/flows/DK1-physical-flows-in.csv', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 500) {
      console.log(data.substring(0, 500));
      process.exit(0);
    }
  });
});
