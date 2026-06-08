import React, { useEffect, useRef, useState } from 'react';

interface TimerOverlayProps {
  isRecording: boolean;
}

export const TimerOverlay: React.FC<TimerOverlayProps> = ({ isRecording }) => {
  const [time, setTime] = useState(0);
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const animate = (timestamp: number) => {
    if (startTimeRef.current === 0) {
      startTimeRef.current = timestamp;
    }
    const elapsed = (timestamp - startTimeRef.current) / 1000;
    setTime(elapsed);
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    if (isRecording) {
      startTimeRef.current = 0; // reset
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      setTime(0); // reset when not recording
    }
    
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isRecording]);

  if (!isRecording && time === 0) return null;

  return (
    <div style={{
      position: 'absolute', top: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      zIndex: 1000, pointerEvents: 'none',
      background: 'rgba(15, 23, 42, 0.4)',
      backdropFilter: 'blur(20px)',
      border: '1px solid rgba(239, 68, 68, 0.5)',
      boxShadow: '0 0 30px rgba(239, 68, 68, 0.4), inset 0 0 15px rgba(239, 68, 68, 0.2)',
      padding: '0.6rem 2.5rem',
      borderRadius: '8px',
      color: '#fdf2f8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '0.1rem',
      animation: 'pulseGlow 2s infinite alternate'
    }}>
      <style>
        {`
          @keyframes pulseGlow {
            from { box-shadow: 0 0 20px rgba(239, 68, 68, 0.3), inset 0 0 10px rgba(239, 68, 68, 0.1); }
            to { box-shadow: 0 0 40px rgba(239, 68, 68, 0.6), inset 0 0 20px rgba(239, 68, 68, 0.3); }
          }
        `}
      </style>
      <div style={{ fontSize: '0.75rem', color: '#fca5a5', fontWeight: 700, letterSpacing: '0.2em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 10px #ef4444' }}></span>
        记录中
      </div>
      <div style={{ fontSize: '2.8rem', fontWeight: 800, fontFamily: '"JetBrains Mono", "Courier New", monospace', textShadow: '0 0 15px rgba(239,68,68,0.8)' }}>
        {time.toFixed(2)}s
      </div>
    </div>
  );
};
