import fs from 'fs';
import https from 'https';

https.get('https://raw.githubusercontent.com/deldersveld/topojson/master/continents/europe.json', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 500) {
      console.log(data.substring(0, 500));
      process.exit(0);
    }
  });
});
