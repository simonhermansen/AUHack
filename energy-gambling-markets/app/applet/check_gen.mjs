import https from 'https';
https.get('https://raw.githubusercontent.com/simonhermansen/AUHack/main/data/generation/DE-generation.csv', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
    if (data.length > 500) {
      console.log(data.substring(0, 500));
      process.exit(0);
    }
  });
});
