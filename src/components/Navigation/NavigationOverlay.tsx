import { useState, useEffect } from 'react'
import { RouteStep } from '../../services/routeApi'
import { NavInfo } from './NavigationMapController'
import { FerryAnalysis } from '../../services/ferryService'
import { maneuverArrow, fmtDistance } from '../../services/navigationService'
import './NavigationOverlay.css'

function fmtClock(d: Date) {
  return d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
}
function fmtDist(m: number) { return m >= 1000 ? `${(m/1000).toFixed(0)} km` : `${Math.round(m)} m` }
function fmtTime(min: number) {
  if (!min) return '--';
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.floor(min/60)}t ${Math.round(min%60)}m`;
}

interface Props {
  steps:           RouteStep[]
  navInfo:         NavInfo | null
  ferryAnalyses?:  FerryAnalysis[]
  routeStartTime?: Date
  destination?:    string
  onStop:          () => void
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function NavigationOverlay({ steps, navInfo, ferryAnalyses, routeStartTime, destination, onStop: _s }: Props) {
  const [ferrySkips, setFerrySkips] = useState<number[]>([]);
  const ferryIdx = 0;
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);

  if (!steps.length) return null

  const idx      = navInfo?.stepIdx ?? 0
  const step     = steps[idx]
  const nextStep = steps[idx + 1]

  return (
    <div className="nav-overlay">
      {/* ── ONE combined block: metrics + instruction ── */}
      <div className="nav-block">
        {/* Top row: destination + metrics */}
        <div className="nav-block__top">
          <span className="nav-block__dest">{destination || 'Navigerer…'}</span>
          <div className="nav-block__metrics">
            <span className="nav-block__met-val">{navInfo?.remainDist ? fmtDist(navInfo.remainDist) : '--'}</span>
            <span className="nav-block__met-sep">·</span>
            <span className="nav-block__met-val">{fmtTime(navInfo?.remainMin ?? 0)}</span>
            <span className="nav-block__met-sep">·</span>
            <span className="nav-block__met-val">{navInfo?.eta ?? '--:--'}</span>
          </div>
        </div>

        {/* Divider */}
        <div className="nav-block__divider" />

        {/* Bottom row: turn arrow + instruction */}
        <div className="nav-block__bottom">
          <div className="nav-block__arrow">
            {step ? maneuverArrow(step.maneuverType, step.maneuverModifier) : '▶'}
          </div>
          <div className="nav-block__text">
            <div className="nav-block__dist">{fmtDistance(step?.distance ?? 0)}</div>
            <div className="nav-block__instruction">{step?.instruction ?? 'Beregner…'}</div>
            {nextStep && (
              <div className="nav-block__next">
                Deretter: {maneuverArrow(nextStep.maneuverType, nextStep.maneuverModifier)}{' '}{nextStep.instruction}
              </div>
            )}
          </div>
          {navInfo?.bearing !== null && navInfo?.bearing !== undefined && (
            <svg className="nav-block__compass" width="26" height="26" viewBox="0 0 26 26">
              <circle cx="13" cy="13" r="11" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
              <polygon points="13,3 10.5,15 13,12 15.5,15" fill="#e53935"
                transform={`rotate(${navInfo.bearing}, 13, 13)`}/>
              <polygon points="13,23 10.5,11 13,14 15.5,11" fill="rgba(255,255,255,0.4)"
                transform={`rotate(${navInfo.bearing}, 13, 13)`}/>
            </svg>
          )}
        </div>
      </div>

      {/* ── Ferry bar ── */}
      {ferryAnalyses && ferryAnalyses.length > 0 && (() => {
        const fa = ferryAnalyses[ferryIdx];
        const elapsed = routeStartTime
          ? (now.getTime() - routeStartTime.getTime()) / 60000 : 0;
        let remainingToFerryMin: number;
        if (navInfo && navInfo.remainDist > 0 && navInfo.remainMin > 0) {
          const speedMs    = navInfo.remainDist / (navInfo.remainMin * 60);
          const ferryDistM = fa.ferry.driveDistanceToFerryKm * 1000;
          const drivenM    = Math.min(ferryDistM, elapsed / fa.ferry.driveTimeToFerryMin * ferryDistM);
          remainingToFerryMin = speedMs > 0 ? Math.max(0, ferryDistM - drivenM) / speedMs / 60 : 0;
        } else {
          remainingToFerryMin = Math.max(0, fa.ferry.driveTimeToFerryMin - elapsed);
        }

        const liveEta  = new Date(now.getTime() + remainingToFerryMin * 60 * 1000);
        const upcoming = fa.departures.filter(d => d.time >= new Date(liveEta.getTime() - 2 * 60 * 1000));
        const skip     = ferrySkips[ferryIdx] ?? 0;
        let target     = upcoming[skip] ?? upcoming[0];
        if (!target) return null;

        const minEarly    = (target.time.getTime() - liveEta.getTime()) / 60000;
        const canMiss     = minEarly < 0 && minEarly > -25;
        const canSkipNext = upcoming.length > skip + 1;
        const canSkipPrev = skip > 0;
        const LIMIT       = fa.speedLimitKmh ?? 80;

        let excessSpeed: number | null = null;
        if (canMiss) {
          const hrs = (target.time.getTime() - now.getTime()) / 3600000;
          if (hrs > 0) {
            const req = fa.ferry.driveDistanceToFerryKm / hrs;
            const excess = Math.round(req - LIMIT);
            if (excess > 0 && req <= LIMIT + 40) excessSpeed = excess;
          }
        }
        if (canMiss && (excessSpeed === null || excessSpeed > 15) && canSkipNext && skip === 0) {
          target = upcoming[1];
        }

        const margin    = Math.round(minEarly);
        const fillPct   = Math.max(3, Math.min(97, 50 + (minEarly / 20) * 47));
        const fillColor = minEarly >= 8  ? '#4caf50'
          : minEarly >= 2  ? '#8bc34a'
          : minEarly >= -1 ? '#78909c'
          : minEarly >= -6 ? '#ef9a9a'
          : '#f44336';

        return (
          <div className="nav-ferry-line">
            <button className={`nav-ferry-line__arrow${!canSkipPrev?' nav-ferry-line__arrow--hidden':''}`}
              onClick={() => { if(canSkipPrev){const n=[...ferrySkips];n[ferryIdx]--;setFerrySkips(n);}}}
              disabled={!canSkipPrev}>‹</button>
            <div className="nav-ferry-line__centre">
              <div className="nav-ferry-line__labels">
                <span>⛴ {fa.ferry.name} · {fmtClock(target.time)}</span>
                <span style={{color:fillColor,fontWeight:700}}>
                  {margin>=0?`+${margin} min`:canMiss&&excessSpeed?`+${excessSpeed} km/t over grensen`:`${margin} min`}
                </span>
              </div>
              <div className="nav-ferry-line__track">
                <div className="nav-ferry-line__fill" style={{width:`${fillPct}%`,background:fillColor}}/>
                <div className="nav-ferry-line__marker" style={{left:'50%'}}/>
              </div>
            </div>
            <button className={`nav-ferry-line__arrow${!canSkipNext?' nav-ferry-line__arrow--hidden':''}`}
              onClick={() => { if(canSkipNext){const n=[...ferrySkips];n[ferryIdx]=(n[ferryIdx]??0)+1;setFerrySkips(n);}}}
              disabled={!canSkipNext}>›</button>
          </div>
        );
      })()}
    </div>
  )
}
