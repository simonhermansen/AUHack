import { useState, useEffect } from 'react';

export const SlotText = ({ text, isSpinning }: { text: string, isSpinning: boolean }) => {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    if (!isSpinning) {
      setDisplay(text);
      return;
    }

    const chars = '0123456789-T:';
    const interval = setInterval(() => {
      let scrambled = '';
      for (let i = 0; i < text.length; i++) {
        if (text[i] === '-' || text[i] === 'T' || text[i] === ':') {
          scrambled += text[i];
        } else {
          scrambled += chars[Math.floor(Math.random() * 10)];
        }
      }
      setDisplay(scrambled);
    }, 50);

    return () => clearInterval(interval);
  }, [text, isSpinning]);

  return <span>{display}</span>;
};
