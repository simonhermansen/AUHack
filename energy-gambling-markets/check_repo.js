const run = async () => {
  try {
    const res = await fetch('https://api.github.com/repos/simonhermansen/AUHack/git/trees/main?recursive=1');
    const data = await res.json();
    const files = data.tree.filter(t => t.path.startsWith('data/')).map(t => t.path);
    console.log(files);
  } catch (e) {
    console.error(e);
  }
};
run();
