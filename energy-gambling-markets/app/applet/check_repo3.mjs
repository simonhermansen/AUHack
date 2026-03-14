fetch('https://api.github.com/repos/simonhermansen/AUHack/git/trees/main?recursive=1')
  .then(res => res.json())
  .then(data => {
    const files = data.tree.filter(t => t.path.startsWith('data/')).map(t => t.path);
    console.log(files);
  })
  .catch(e => console.error(e));
