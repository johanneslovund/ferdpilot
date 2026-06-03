import { useState } from 'react'
import { RouteStep } from '../../services/routeApi'
import { NavInfo } from './NavigationMapController'
import { FerryAnalysis } from '../../services/ferryService'
import { maneuverArrow, fmtDistance, fmtDuration } from '../../services/navigationService'
import './NavigationOverlay.css'

function fmtClock(d: Date) {
  return d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  steps:           RouteStep[]
  navInfo:         NavInfo | null
  ferryAnalyses?:  FerryAnalysis[]
  routeStartTime?: Date
  onStop:          () => void
}

export function NavigationOverlay({ steps, navInfo, ferryAnalyses, routeStartTime, onStop }: Props) {
  // Per-ferry skip offsets: user can choose a later departure
  const [ferrySkips, setFerrySkips] = useState<number[]>([]);
  // Only show the first ferry (index 0) at a time to minimize clutter
  const ferryIdx = 0;

  if (!steps.length) return null

  const idx      = navInfo?.stepIdx ?? 0
  const step     = steps[idx]
  const nextStep = steps[idx + 1]

  return (
    <div className="nav-overlay">
      {/* Main instruction card */}
      <div className="nav-instruction">
        <div className="nav-instruction__arrow">
          {step ? maneuverArrow(step.maneuverType, step.maneuverModifier) : '▶'}
        </div>
        <div className="nav-instruction__text">
          <div className="nav-instruction__distance">
            {fmtDistance(step?.distance ?? 0)}
          </div>
          <div className="nav-instruction__desc">
            {step?.instruction ?? 'Beregner…'}
          </div>
        </div>
        <button className="nav-instruction__stop" onClick={onStop}>Stopp</button>
      </div>

      {/* Ferry progress line — thin, colour-coded by margin */}
      {ferryAnalyses && ferryAnalyses.length > 0 && (() => {
        const fa  = ferryAnalyses[ferryIdx];
        const now = new Date();
        const elapsed   = routeStartTime
          ? (now.getTime() - routeStartTime.getTime()) / 60000 : 0;
        const remaining = Math.max(0, fa.ferry.driveTimeToFerryMin - elapsed);
        const liveEta   = new Date(now.getTime() + remaining * 60 * 1000);

        const upcoming = fa.departures.filter(
          d => d.time >= new Date(liveEta.getTime() - 2 * 60 * 1000)
        );
        const skip   = ferrySkips[ferryIdx] ?? 0;
        let target   = upcoming[skip] ?? upcoming[0];
        if (!target) return null;

        const minEarly   = (target.time.getTime() - liveEta.getTime()) / 60000;
        const canMiss    = minEarly < 0 && minEarly > -25;
        const canSkip    = upcoming.length > skip + 1;
        const LIMIT      = fa.speedLimitKmh ?? 80;

        // Calculate excess speed needed
        let excessSpeed: number | null = null;
        if (canMiss) {
          const hrs = (target.time.getTime() - now.getTime()) / 3600000;
          if (hrs > 0) {
            const req = fa.ferry.driveDistanceToFerryKm / hrs;
            const excess = Math.round(req - LIMIT);
            if (excess > 0 && req <= LIMIT + 40) excessSpeed = excess;
          }
        }

        // Auto-skip if excess > 15 km/h above limit
        let autoSkipped = false;
        if (canMiss && (excessSpeed === null || excessSpeed > 15) && canSkip && skip === 0) {
          target       = upcoming[1];
          autoSkipped  = true;
          const newMin = (target.time.getTime() - liveEta.getTime()) / 60000;
          // Override minEarly to reflect next ferry
          const nextMin = Math.round(newMin);

          // Progress fill: map margin (-20…+20) to 0–100%
          const fillPct = Math.max(5, Math.min(95, 50 + (nextMin / 20) * 45));
          const fillColor = nextMin >= 10 ? '#4caf50' : nextMin >= 3 ? '#8bc34a' : '#90a4ae';

          return (
            <div className="nav-ferry-line">
              <div className="nav-ferry-line__labels">
                <span>⛴ {fa.ferry.name} · {fmtClock(target.time)}</span>
                <span style={{ color: fillColor, fontWeight: 700 }}>+{nextMin} min (neste)</span>
              </div>
              <div className="nav-ferry-line__track">
                <div className="nav-ferry-line__fill" style={{ width: `${fillPct}%`, background: fillColor }} />
                <div className="nav-ferry-line__marker" style={{ left: '50%' }} />
              </div>
              <button className="nav-ferry-line__skip"
                onClick={() => { const n=[...ferrySkips]; n[ferryIdx]=0; setFerrySkips(n); }}>
                ← Tidligere ferje
              </button>
            </div>
          );
        }

        // Normal ferry progress line
        const margin  = Math.round(minEarly);
        // Map margin (-20…+20 min) → fill 0–100%
        const fillPct = Math.max(3, Math.min(97, 50 + (minEarly / 20) * 47));
        const fillColor = minEarly >= 8 ? '#4caf50'
          : minEarly >= 2  ? '#8bc34a'
          : minEarly >= -1 ? '#78909c'
          : minEarly >= -6 ? '#ef9a9a'
          : '#f44336';

        return (
          <div className="nav-ferry-line">
            <div className="nav-ferry-line__labels">
              <span>⛴ {fa.ferry.name} · {fmtClock(target.time)}</span>
              <span style={{ color: fillColor, fontWeight: 700 }}>
                {margin >= 0 ? `+${margin} min` : canMiss && excessSpeed ? `+${excessSpeed} km/t over grensen` : `${margin} min`}
              </span>
            </div>
            <div className="nav-ferry-line__track">
              <div className="nav-ferry-line__fill" style={{ width: `${fillPct}%`, background: fillColor }} />
              <div className="nav-ferry-line__marker" style={{ left: '50%' }} />
            </div>
            {canSkip && canMiss && !autoSkipped && (
              <button className="nav-ferry-line__skip"
                onClick={() => { const n=[...ferrySkips]; n[ferryIdx]=(n[ferryIdx]??0)+1; setFerrySkips(n); }}>
                Ta neste ferje ({fmtClock(upcoming[skip + 1].time)})
              </button>
            )}
          </div>
        );
      })()}

      {/* Status bar */}
      <div className="nav-status">
        <div className="nav-status__item">
          <span className="nav-status__value">{fmtDistance(navInfo?.remainDist ?? 0)}</span>
          <span className="nav-status__label">Gjenstår</span>
        </div>
        <div className="nav-status__divider" />
        <div className="nav-status__item">
          <span className="nav-status__value">{fmtDuration(navInfo?.remainMin ?? 0)}</span>
          <span className="nav-status__label">Tid</span>
        </div>
        <div className="nav-status__divider" />
        <div className="nav-status__item">
          <span className="nav-status__value">{navInfo?.eta ?? '--:--'}</span>
          <span className="nav-status__label">ETA</span>
        </div>
      </div>

      {/* Next step + compass */}
      <div className="nav-bottom-row">
        {nextStep && (
          <div className="nav-next">
            Deretter: {maneuverArrow(nextStep.maneuverType, nextStep.maneuverModifier)}{' '}
            {nextStep.instruction}
          </div>
        )}
        {navInfo?.bearing !== null && navInfo?.bearing !== undefined && (
          <div className="nav-compass" title={`${Math.round(navInfo.bearing)}°`}>
            <svg width="28" height="28" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="12" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
              <polygon points="14,4 11,18 14,15 17,18" fill="#e53935"
                transform={`rotate(${navInfo.bearing}, 14, 14)`}/>
              <polygon points="14,24 11,10 14,13 17,10" fill="rgba(255,255,255,0.4)"
                transform={`rotate(${navInfo.bearing}, 14, 14)`}/>
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
