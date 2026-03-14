import { motion, useAnimation } from 'framer-motion';
import { useEffect, useState } from 'react';

const ROULETTE_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const RED_NUMBERS = [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];

const getCenteredWedgePath = (radius: number, angleDegrees: number) => {
  const halfAngle = (angleDegrees / 2) * Math.PI / 180;
  const x1 = radius + radius * Math.sin(-halfAngle);
  const y1 = radius - radius * Math.cos(-halfAngle);
  const x2 = radius + radius * Math.sin(halfAngle);
  const y2 = radius - radius * Math.cos(halfAngle);
  return `M ${radius} ${radius} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`;
};

export const RouletteWheel = ({ spinning, targetNumber, onStop, roundPrices }: { spinning: boolean, targetNumber: number | null, onStop: () => void, roundPrices: number[] }) => {
  const wheelControls = useAnimation();
  const ballControls = useAnimation();
  
  const [wheelRotation, setWheelRotation] = useState(0);
  const [ballRotation, setBallRotation] = useState(0);

  useEffect(() => {
    if (spinning && targetNumber !== null) {
      const targetIndex = ROULETTE_NUMBERS.indexOf(targetNumber);
      const pocketAngle = targetIndex * (360 / 37);

      const newWheelRotation = wheelRotation + 360 * 5; // 5 spins
      
      const targetVisualAngle = (newWheelRotation + pocketAngle) % 360;
      const currentBallVisual = ((ballRotation % 360) + 360) % 360;
      let diff = targetVisualAngle - currentBallVisual;
      if (diff > 0) diff -= 360; // force counter-clockwise
      
      const nextBallRotation = ballRotation - 360 * 5 + diff;

      wheelControls.start({
        rotate: newWheelRotation,
        transition: { duration: 6, ease: [0.2, 0.8, 0.3, 1] }
      });

      ballControls.start({
        rotate: nextBallRotation,
        transition: { duration: 6, ease: [0.2, 0.8, 0.3, 1] }
      }).then(() => {
        setWheelRotation(newWheelRotation);
        setBallRotation(nextBallRotation);
        onStop();
      });
    }
  }, [spinning, targetNumber]);

  const radius = 200;
  const angle = 360 / 37;
  const path = getCenteredWedgePath(radius, angle);

  return (
    <div className="relative w-full h-full">
      <motion.div 
        className="w-full h-full"
        animate={wheelControls}
        initial={{ rotate: 0 }}
      >
        <svg viewBox="0 0 400 400" className="w-full h-full drop-shadow-2xl">
          <circle cx="200" cy="200" r="195" fill="#2a2a2a" stroke="#d4af37" strokeWidth="10" />
          <g transform="translate(0,0)">
            {ROULETTE_NUMBERS.map((num, i) => {
              const rotation = i * angle;
              const color = num === 0 ? '#00b300' : RED_NUMBERS.includes(num) ? '#e60000' : '#1a1a1a';
              return (
                <g key={num} transform={`rotate(${rotation}, 200, 200)`}>
                  <path d={path} fill={color} stroke="#d4af37" strokeWidth="1" />
                  <text
                    x="200"
                    y="45"
                    fill="white"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                    transform={`rotate(0, 200, 45)`}
                  >
                    {roundPrices[num] ?? num}
                  </text>
                </g>
              );
            })}
          </g>
          <circle cx="200" cy="200" r="120" fill="#1a1a1a" stroke="#d4af37" strokeWidth="4" />
          <circle cx="200" cy="200" r="110" fill="#2a2a2a" />
          <path d="M 200 100 L 210 200 L 200 300 L 190 200 Z" fill="#d4af37" opacity="0.2" />
          <path d="M 100 200 L 200 210 L 300 200 L 200 190 Z" fill="#d4af37" opacity="0.2" />
          <circle cx="200" cy="200" r="20" fill="#d4af37" />
        </svg>
      </motion.div>

      {/* Ball Container */}
      <motion.div
        animate={ballControls}
        initial={{ rotate: 0 }}
        className="absolute inset-0 pointer-events-none"
      >
        <motion.div
          animate={spinning ? { top: ['2%', '12%'] } : { top: '12%' }}
          transition={{ duration: 6, ease: "circOut" }}
          className="absolute left-1/2 w-4 h-4 bg-white rounded-full shadow-[0_0_6px_rgba(255,255,255,0.8)]"
          style={{ x: '-50%' }}
        />
      </motion.div>
    </div>
  );
};

