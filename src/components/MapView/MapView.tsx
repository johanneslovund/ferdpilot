import { useRef, useEffect } from 'react';
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GridWeather, riskLevel, RISK_COLORS, RISK_LABELS } from '../../types/weather';
import { CanvasHeatmapLayer } from './CanvasHeatmapLayer';
import { TrafficLayer } from './TrafficLayer';
import { RouteLayer } from './RouteLayer';
import { RainViewerLayer } from './RainViewerLayer';
import { ElevationOverlayLayer } from './ElevationOverlayLayer';
import { WebcamLayer } from './WebcamLayer';
import { HazardLayer } from './HazardLayer';
import { UserLocationLayer } from './UserLocationLayer';
import { NavigationOverlay } from '../Navigation/NavigationOverlay';
import { RouteStep } from '../../services/routeApi';
import { Webcam } from '../../services/webcamService';
import { Hazard } from '../../services/hazardService';
import { ElevationLegend } from '../Legend/ElevationLegend';
import { WeatherLegend } from '../Legend/WeatherLegend';
import { RouteResult } from '../../services/routeApi';
import { MapStyleSelector, MapStyle, MAP_TILES } from './MapStyleSelector';
import './MapView.css';

// ── helpers ───────────────────────────────────────────────────────────────────

const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e)       { if (!isTouchDevice()) onMapClick(e.latlng.lat, e.latlng.lng); },
    contextmenu(e) { onMapClick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

interface FlyToProps {
  target: { lat: number; lon: number; zoom?: number; duration?: number } | null;
}
function FlyTo({ target }: FlyToProps) {
  const map  = useMap();
  const prev = useRef<typeof target>(null);
  if (target && target !== prev.current) {
    prev.current = target;
    map.flyTo([target.lat, target.lon], target.zoom ?? 10, { duration: target.duration ?? 1.4 });
  }
  return null;
}

// Better red pin using SVG
function PinMarker({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  const ref = useRef<L.Marker | null>(null);

  useEffect(() => {
    const icon = L.divIcon({
      className: '',
      html: `<svg width="28" height="38" viewBox="0 0 28 38" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 24 14 24s14-14.667 14-24C28 6.268 21.732 0 14 0z"
          fill="#E53935" stroke="white" stroke-width="2"/>
        <circle cx="14" cy="14" r="5" fill="white"/>
      </svg>`,
      iconSize:    [28, 38],
      iconAnchor:  [14, 38],
      popupAnchor: [0, -38],
    });
    const marker = L.marker([lat, lon], { icon, zIndexOffset: 1000 }).addTo(map);
    ref.current = marker;
    return () => { marker.remove(); };
  }, [lat, lon, map]);

  return null;
}

// ── types ─────────────────────────────────────────────────────────────────────

export interface MapToggles {
  traffic:   boolean;
  webcam:    boolean;
  vaer:      boolean;
  elevation: boolean;
  hazards:   boolean;
}

interface MapViewProps {
  data:          GridWeather[];
  toggles:       MapToggles;
  onToggle:      (key: keyof MapToggles) => void;
  flyTarget:     { lat: number; lon: number; zoom?: number; duration?: number } | null;
  routeResult:   RouteResult | null;
  onMapClick:    (lat: number, lon: number) => void;
  webcams:       Webcam[];
  hazards:       Hazard[];
  pinLocation:      { lat: number; lon: number } | null;
  mapStyle:         MapStyle;
  onMapStyle:       (s: MapStyle) => void;
  onResetGps:       () => void;
  navSteps?:        RouteStep[];
  onStopNavigation?: () => void;
}

// ── component ─────────────────────────────────────────────────────────────────

export function MapView({
  data, toggles, onToggle, flyTarget, routeResult,
  onMapClick, webcams, hazards, pinLocation,
  mapStyle, onMapStyle, onResetGps,
  navSteps, onStopNavigation,
}: MapViewProps) {
  const tiles = MAP_TILES[mapStyle];

  return (
    <div className="map-container">
      <MapContainer center={[65.0, 15.0]} zoom={5}
        style={{ height: '100%', width: '100%' }} zoomControl>
        <MapClickHandler onMapClick={onMapClick} />
        <UserLocationLayer />
        <TileLayer
          key={mapStyle}
          url={tiles.url}
          attribution={tiles.attribution}
          maxZoom={19}
          subdomains="abcd"
        />

        {toggles.elevation && <ElevationOverlayLayer data={data} />}
        <TrafficLayer visible={toggles.traffic} />
        <CanvasHeatmapLayer data={data} />
        {toggles.vaer    && <RainViewerLayer />}
        {toggles.webcam  && <WebcamLayer cameras={webcams} />}
        {toggles.hazards && <HazardLayer hazards={hazards} />}

        {routeResult && <RouteLayer coordinates={routeResult.coordinates} gridData={data} />}

        {data.map((w) => {
          const level = riskLevel(w.riskScore);
          return (
            <CircleMarker key={`${w.lat},${w.lon}`} center={[w.lat, w.lon]} radius={5}
              pathOptions={{ fillColor: RISK_COLORS[level], fillOpacity: 0.9, color: '#000', weight: 1 }}>
              <Tooltip className="vf-tooltip">
                <strong>{w.name}</strong><br />
                {RISK_LABELS[level]} — {(w.riskScore * 100).toFixed(0)}% risiko<br />
                {w.airTemperature > 0 ? '+' : ''}{w.airTemperature.toFixed(1)}°C
                &nbsp;·&nbsp;{w.windSpeed.toFixed(0)} m/s
                {w.precipitationAmount > 0 && <> · {w.precipitationAmount.toFixed(1)} mm</>}
              </Tooltip>
            </CircleMarker>
          );
        })}

        {pinLocation && <PinMarker lat={pinLocation.lat} lon={pinLocation.lon} />}
        <FlyTo target={flyTarget} />
      </MapContainer>

      {/* In-app navigation overlay */}
      {navSteps && navSteps.length > 0 && onStopNavigation && (
        <NavigationOverlay steps={navSteps} onStop={onStopNavigation} />
      )}

      {/* Map style selector — top right */}
      {!navSteps?.length && <MapStyleSelector value={mapStyle} onChange={onMapStyle} />}

      {/* GPS reset button — bottom right above toggles */}
      <button className="map-reset-btn" onClick={onResetGps} title="Gå til min posisjon">
        ◎
      </button>

      {/* Toggle strip */}
      <div className="map-toggles-wrap">
        <div className="map-toggles">
          <button className={`map-toggle-btn${toggles.traffic ? ' map-toggle-btn--active' : ''}`}
            onClick={() => onToggle('traffic')}>
            {toggles.traffic ? 'Skjul trafikk' : 'Trafikk'}
          </button>
          <button className={`map-toggle-btn${toggles.webcam ? ' map-toggle-btn--active' : ''}`}
            onClick={() => onToggle('webcam')}>
            Webcam
          </button>
          <button className={`map-toggle-btn${toggles.vaer ? ' map-toggle-btn--active' : ''}`}
            onClick={() => onToggle('vaer')}>
            Vær
          </button>
          <button className={`map-toggle-btn${toggles.elevation ? ' map-toggle-btn--active' : ''}`}
            onClick={() => onToggle('elevation')}>
            Høydekart
          </button>
          <button className={`map-toggle-btn${toggles.hazards ? ' map-toggle-btn--active' : ''}`}
            onClick={() => onToggle('hazards')}>
            Farer
          </button>
        </div>
      </div>

      {toggles.vaer      && <WeatherLegend  offset={false} />}
      {toggles.elevation && <ElevationLegend offset={toggles.vaer} />}
    </div>
  );
}
