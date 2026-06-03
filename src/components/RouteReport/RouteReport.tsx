import { RouteAnalysis } from '../../services/routeAnalysis';
import { RISK_COLORS } from '../../types/weather';
import { RouteResult } from '../../services/routeApi';
import { FerryAnalysis } from '../../services/ferryService';
import { NavLinks } from '../NavLinks/NavLinks';
import './RouteReport.css';

// Render **bold** markdown in analysis text
function renderText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/).map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  )
}

function fmt(t: number) { return (t > 0 ? '+' : '') + t.toFixed(1) + '°C'; }
function dur(min: number) {
  if (min < 60) return `${Math.round(min)} min`;
  return `${Math.floor(min / 60)}t ${Math.round(min % 60)}min`;
}

interface Props {
  analysis: RouteAnalysis;
  route: RouteResult;
  routeAnalysisText?: string;
  ferryAnalyses?: FerryAnalysis[];
  fromCoords?: [number, number] | null;
  toCoords?: [number, number] | null;
  toName?: string;
  onClose: () => void;
}

function fmtTime(d: Date) {
  return d.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
}

export function RouteReport({ analysis, route, routeAnalysisText, ferryAnalyses, fromCoords, toCoords, toName, onClose }: Props) {
  const badgeColor = RISK_COLORS[analysis.overallLevel];

  return (
    <div className="route-report">
      <div className="route-report__header">
        <span className="route-report__title">Rutevurdering</span>
        <span className="route-report__badge" style={{ background: badgeColor }}>
          {analysis.overallLabel}
        </span>
        <span className="route-report__stats">
          <strong>{route.distanceKm.toFixed(0)} km</strong>
          {' · '}
          <strong>{dur(route.durationMin)}</strong>
        </span>
        <button className="route-report__close" onClick={onClose}>×</button>
      </div>

      <div className="route-report__body">
        {/* Danger spots */}
        <div className="route-report__section">
          <div className="route-report__section-title">Farlige strekninger</div>
          {analysis.dangerSpots.length === 0 ? (
            <div className="no-spots">Ingen kritiske strekninger funnet</div>
          ) : (
            analysis.dangerSpots.map((s, i) => (
              <div key={i} className="route-report__spot">
                <div
                  className="route-report__spot-dot"
                  style={{ background: RISK_COLORS[s.level] }}
                />
                <span className="route-report__spot-name">{s.name}</span>
                <span className="route-report__spot-detail">
                  {fmt(s.airTemperature)} · {s.windSpeed.toFixed(0)} m/s
                </span>
              </div>
            ))
          )}
        </div>

        {/* Conditions */}
        <div className="route-report__section">
          <div className="route-report__section-title">Værforhold</div>
          <div className="route-report__condition-row">
            <span className="route-report__condition-icon">🌡</span>
            Temperatur: {fmt(analysis.tempMin)} til {fmt(analysis.tempMax)}
          </div>
          {analysis.hasSnow && (
            <div className="route-report__condition-row">
              <span className="route-report__condition-icon">❄</span>
              Snø langs ruten
            </div>
          )}
          {analysis.hasSleet && (
            <div className="route-report__condition-row">
              <span className="route-report__condition-icon">🌨</span>
              Sludd langs ruten
            </div>
          )}
          {analysis.hasIceRisk && (
            <div className="route-report__condition-row">
              <span className="route-report__condition-icon">⚠</span>
              Isrisiko (temp nær 0 med nedbør)
            </div>
          )}
          {!analysis.hasSnow && !analysis.hasSleet && !analysis.hasIceRisk && (
            <div className="route-report__condition-row">
              <span className="route-report__condition-icon">✓</span>
              Ingen aktiv nedbør langs ruten
            </div>
          )}
        </div>

        {/* Ferry section */}
        {ferryAnalyses && ferryAnalyses.length > 0 && ferryAnalyses.map((fa, i) => {
          const isClose  = fa.minutesEarly !== null && fa.minutesEarly > -20 && fa.minutesEarly < 10;
          const willMiss = fa.minutesEarly !== null && fa.minutesEarly < 0;

          return (
            <div key={i} className="route-report__section" style={{ gridColumn: '1 / -1', borderColor: willMiss ? 'rgba(244,67,54,0.3)' : 'rgba(255,255,255,0.07)' }}>
              <div className="route-report__section-title">
                ⛴ {fa.ferry.name}
              </div>

              {/* ETA row */}
              <div className="route-report__ferry-eta">
                <span>Ankomst terminal:</span>
                <strong>{fmtTime(fa.etaToFerry)}</strong>
              </div>

              {/* Speed warning */}
              {isClose && fa.requiredSpeedKmh && willMiss && (
                <div className="route-report__ferry-warn">
                  ⚠ Du går glipp av ferjen kl. {fa.nextFerry ? fmtTime(fa.nextFerry.time) : '?'}.
                  Du må kjøre <strong>{fa.requiredSpeedKmh} km/t</strong> snitt
                  ({fa.requiredSpeedKmh - fa.speedLimitKmh > 0 ? `+${fa.requiredSpeedKmh - fa.speedLimitKmh}` : fa.requiredSpeedKmh - fa.speedLimitKmh} km/t over fartsgrensen).
                </div>
              )}
              {isClose && !willMiss && fa.minutesEarly !== null && fa.minutesEarly < 10 && (
                <div className="route-report__ferry-ok">
                  ✓ Du rekker ferjen kl. {fa.nextFerry ? fmtTime(fa.nextFerry.time) : '?'} —{' '}
                  du ankommer {Math.round(fa.minutesEarly)} {Math.round(fa.minutesEarly) === 1 ? 'minutt' : 'minutter'} før avgang.
                </div>
              )}

              {/* Departure list: max 2 before ETA, then upcoming */}
              {(() => {
                const earlier  = fa.departures.filter(d => d.time < fa.etaToFerry).slice(-2);
                const upcoming = fa.departures.filter(d => d.time >= fa.etaToFerry).slice(0, 4);
                const toShow   = [...earlier, ...upcoming];
                return (
                  <div className="route-report__ferry-times">
                    {earlier.length > 0 && (
                      <div className="route-report__ferry-divider">Avganger</div>
                    )}
                    {toShow.map((dep, j) => {
                      const isPast = dep.time < fa.etaToFerry;
                      const isNext = fa.nextFerry && dep.time.getTime() === fa.nextFerry.time.getTime();
                      const isFirst = earlier.length > 0 && j === earlier.length;
                      return (
                        <>
                          {isFirst && (
                            <div key={`divider-${j}`} className="route-report__ferry-divider route-report__ferry-divider--eta">
                              ↓ ETA {fmtTime(fa.etaToFerry)}
                            </div>
                          )}
                          <div key={j} className={[
                            'route-report__ferry-dep',
                            isNext ? 'route-report__ferry-dep--next' : '',
                            isPast ? 'route-report__ferry-dep--past' : '',
                          ].filter(Boolean).join(' ')}>
                            <span className="route-report__ferry-time">{fmtTime(dep.time)}</span>
                            <span className="route-report__ferry-dest">→ {dep.destination}</span>
                            {isNext && (
                              <span className="route-report__ferry-badge">
                                {willMiss ? 'Neste' : 'Rekker'}
                              </span>
                            )}
                          </div>
                        </>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          );
        })}

        {/* Recommendation */}
        <div className="route-report__recommendation">
          <strong>Anbefaling</strong>
          {analysis.recommendation}
        </div>

        {/* Route AI analysis */}
        {routeAnalysisText && (
          <div className="route-report__recommendation" style={{ gridColumn: '1 / -1' }}>
            <strong>Analyse</strong>
            <div style={{ marginTop: 4, lineHeight: 1.6 }}>
              {routeAnalysisText.split('\n').map((line, i) => (
                <div key={i}>{renderText(line)}</div>
              ))}
            </div>
            {toCoords && (
              <NavLinks fromCoords={fromCoords} toCoords={toCoords} toName={toName} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
