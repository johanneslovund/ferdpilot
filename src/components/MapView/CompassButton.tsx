import { useMap } from 'react-leaflet';
import { useEffect, useRef } from 'react';
import './CompassButton.css';

interface Props {
  bearing: number | null;   // current heading from GPS/compass
  lockMode: 'north' | 'heading';
  onToggle: () => void;
}

// CompassButton — shows current bearing, tap to toggle lock-north / follow-heading
export function CompassButton({ bearing, lockMode, onToggle }: Props) {
  const map     = useMap();
  const prevRef = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = map as any;
    if (typeof m.setBearing !== 'function') return;

    if (lockMode === 'north') {
      m.setBearing(0);
    } else if (bearing !== null && bearing !== prevRef.current) {
      prevRef.current = bearing;
      m.setBearing(-bearing);   // leaflet-rotate: negative = CCW = map rotates to face heading
    }
  }, [bearing, lockMode, map]);

  const deg = bearing ?? 0;

  return (
    <button
      className={`compass-btn${lockMode === 'heading' ? ' compass-btn--active' : ''}`}
      onClick={onToggle}
      title={lockMode === 'north' ? 'Følg retning' : 'Lås nord'}
    >
      <svg width="36" height="36" viewBox="0 0 36 36">
        {/* Ring */}
        <circle cx="18" cy="18" r="15" fill="rgba(8,11,20,0.72)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
        {/* N needle — rotates to always point North */}
        <g transform={`rotate(${-deg}, 18, 18)`}>
          <polygon points="18,5 15.5,18 18,16 20.5,18" fill="#e53935"/>
          <polygon points="18,31 15.5,18 18,20 20.5,18" fill="rgba(255,255,255,0.55)"/>
        </g>
        {/* N label */}
        <text x="18" y="4" textAnchor="middle" fontSize="6" fill="rgba(255,255,255,0.4)"
          fontFamily="system-ui" fontWeight="bold">N</text>
      </svg>
      {lockMode === 'heading' && (
        <div className="compass-btn__dot" />
      )}
    </button>
  );
}
