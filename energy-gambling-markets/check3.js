import https from 'https';

https.get('https://api.github.com/repos/simonhermansen/AUHack/contents/data/flows', {
  headers: { 'User-Agent': 'node.js' }
}, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const files = JSON.parse(data).map(f => f.name);
    console.log(files.join(', '));
  });
});
