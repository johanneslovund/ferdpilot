import { useRef, useEffect } from 'react'
import { GridWeather, riskLevel, RISK_COLORS, RISK_LABELS } from '../../types/weather'
import { TrafficFlow } from '../../services/trafficFlow'
import { NavLinks } from '../NavLinks/NavLinks'
import './LocationPanel.css'

function fmt(t: number) { return (t > 0 ? '+' : '') + t.toFixed(1) + '°C' }

function trafficColor(pct: number): string {
  if (pct < 20) return '#4caf50'
  if (pct < 50) return '#ff9800'
  return '#f44336'
}

function renderAiText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/)
  return parts.map((p, i) =>
    p.startsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p
  )
}

interface Props {
  onNavigate?: () => void;
  lat: number; lon: number
  locationName: string
  weather: GridWeather | null
  traffic: TrafficFlow | null
  aiText: string | null
  aiError: string | null
  aiLoading: boolean
  onClose: () => void
}

export function LocationPanel({ lat, lon, locationName, weather, traffic, aiText, aiError, aiLoading, onClose, onNavigate }: Props) {
  const level = weather ? riskLevel(weather.riskScore) : null
  const panelRef = useRef<HTMLDivElement>(null)

  // Swipe-down to dismiss
  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    let startY = 0, startScrollTop = 0
    const onTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
      startScrollTop = el.scrollTop
    }
    const onTouchEnd = (e: TouchEvent) => {
      const dy = e.changedTouches[0].clientY - startY
      // Only dismiss if swiping down from top of scroll
      if (dy > 60 && startScrollTop <= 0) onClose()
    }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onClose])

  return (
    <div className="loc-panel" ref={panelRef}>
      {/* Drag handle */}
      <div className="loc-panel__handle" />

      {/* Header */}
      <div className="loc-panel__header">
        <span className="loc-panel__name">{locationName}</span>
        <span className="loc-panel__coords">{lat.toFixed(3)}°N {lon.toFixed(3)}°Ø</span>
        <button className="loc-panel__close" onClick={onClose}>×</button>
      </div>

      {/* Weather */}
      {weather && level && (
        <div className="loc-panel__weather">
          <img
            className="loc-panel__weather-icon"
            src={`https://api.met.no/images/weathericons/svg/${weather.symbolCode}.svg`}
            alt={weather.symbolCode}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
          <div className="loc-panel__weather-stats">
            <div className="loc-panel__stat">🌡 <strong>{fmt(weather.airTemperature)}</strong></div>
            <div className="loc-panel__stat">💨 <strong>{weather.windSpeed.toFixed(0)} m/s</strong></div>
            {weather.precipitationAmount > 0 && (
              <div className="loc-panel__stat">🌨 <strong>{weather.precipitationAmount.toFixed(1)} mm</strong></div>
            )}
          </div>
          <span className="loc-panel__risk-badge" style={{ background: RISK_COLORS[level] }}>
            {RISK_LABELS[level]}
          </span>
        </div>
      )}

      {/* Traffic */}
      {traffic && (
        <div className="loc-panel__traffic">
          <span className="loc-panel__traffic-label">Trafikk</span>
          <div className="loc-panel__traffic-bar">
            <div className="loc-panel__traffic-fill"
              style={{ width: `${Math.min(100, traffic.congestionPct)}%`, background: trafficColor(traffic.congestionPct) }} />
          </div>
          <span className="loc-panel__traffic-speed">
            {traffic.roadClosure ? 'Stengt' : `${traffic.currentSpeed}/${traffic.freeFlowSpeed} km/t`}
          </span>
        </div>
      )}

      {/* AI Analysis */}
      <div className="loc-panel__ai">
        <div className="loc-panel__ai-header">
          <span className="loc-panel__ai-label">AI-analyse</span>
          {aiLoading && <div className="loc-panel__ai-dot" />}
        </div>

        {aiLoading && (
          <div className="loc-panel__ai-skeleton">
            {[90, 75, 85, 60, 80].map((w, i) => (
              <div key={i} className="loc-panel__ai-skeleton-line" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {aiError && !aiLoading && (
          <div className="loc-panel__ai-error">Kunne ikke hente analyse: {aiError}</div>
        )}

        {aiText && !aiLoading && (
          <>
            <div className="loc-panel__ai-text">{renderAiText(aiText)}</div>
            <NavLinks toCoords={[lat, lon]} toName={locationName} onNavigate={onNavigate} />
          </>
        )}
      </div>
    </div>
  )
}
