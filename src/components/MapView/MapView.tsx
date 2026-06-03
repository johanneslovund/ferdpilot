import { useRef, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { GridWeather } from '../../types/weather';
import { TrafficLayer } from './TrafficLayer';
import { RouteLayer } from './RouteLayer';
import { RainViewerLayer } from './RainViewerLayer';
import { ElevationOverlayLayer } from './ElevationOverlayLayer';
import { WebcamLayer } from './WebcamLayer';
import { HazardLayer } from './HazardLayer';
import { UserLocationLayer } from './UserLocationLayer';
import { NavigationOverlay } from '../Navigation/NavigationOverlay';
import { NavigationMapController, NavInfo } from '../Navigation/NavigationMapController';
import { RouteStep } from '../../services/routeApi';
import { Webcam } from '../../services/webcamService';
import { Hazard } from '../../services/hazardService';
import { ElevationLegend } from '../Legend/ElevationLegend';
import { WeatherLegend } from '../Legend/WeatherLegend';
import { RouteResult } from '../../services/routeApi';
import { MapStyleSelector, MapStyle, MAP_TILES } from './MapStyleSelector';
import { CompassButton } from './CompassButton';
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
      // viewBox has 4px padding all round so path stroke is never clipped
      html: `<svg width="20" height="28" viewBox="-4 -4 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 0C4.477 0 0 4.477 0 10c0 6.667 10 17 10 17s10-10.333 10-17C20 4.477 15.523 0 10 0z"
          fill="#E53935" stroke="white" stroke-width="1.5"/>
        <circle cx="10" cy="10" r="3.5" fill="white"/>
      </svg>`,
      iconSize:    [20, 28],
      iconAnchor:  [10, 28],
      popupAnchor: [0, -28],
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
  onSelectAlt?:  (alt: import('../../services/routeApi').AlternateRoute) => void;
  webcams:       Webcam[];
  hazards:       Hazard[];
  pinLocation:      { lat: number; lon: number } | null;
  mapStyle:         MapStyle;
  onMapStyle:       (s: MapStyle) => void;
  onResetGps:       () => void;
  compassBearing?:  number | null;
  lockMode?:        'north' | 'heading';
  onToggleLock?:    () => void;
  navSteps?:         RouteStep[];
  navInfo?:          NavInfo | null;
  navDestination?:   string;
  onNavInfo?:        (info: NavInfo) => void;
  onStopNavigation?: () => void;
  navFerries?:       import('../../services/ferryService').FerryAnalysis[];
  routeStartTime?:   Date;
}

// ── component ─────────────────────────────────────────────────────────────────

export function MapView({
  data, toggles, onToggle, flyTarget, routeResult,
  onMapClick, onSelectAlt, webcams, hazards, pinLocation,
  mapStyle, onMapStyle, onResetGps,
  compassBearing, lockMode = 'north', onToggleLock,
  navSteps, navInfo, onNavInfo, onStopNavigation, navFerries, routeStartTime, navDestination,
}: MapViewProps) {
  const tiles = MAP_TILES[mapStyle];

  return (
    <div className="map-container">
      <MapContainer center={[65.0, 15.0]} zoom={5}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...{ rotate: true, touchRotate: true } as any}
        style={{ height: '100%', width: '100%' }} zoomControl>
        <MapClickHandler onMapClick={onMapClick} />
        <UserLocationLayer />
        {/* Compass — inside MapContainer to access useMap() */}
        {onToggleLock && (
          <CompassButton bearing={compassBearing ?? null} lockMode={lockMode} onToggle={onToggleLock} />
        )}
        <TileLayer
          key={mapStyle}
          url={tiles.url}
          attribution={tiles.attribution}
          maxZoom={19}
          subdomains="abcd"
        />

        {toggles.elevation && <ElevationOverlayLayer data={data} />}
        <TrafficLayer visible={toggles.traffic} />
{toggles.vaer    && <RainViewerLayer />}
        {toggles.webcam  && <WebcamLayer cameras={webcams} />}
        {toggles.hazards && <HazardLayer hazards={hazards} />}

        {routeResult && (
          <RouteLayer
            coordinates={routeResult.coordinates}
            gridData={data}
            alternates={routeResult.alternates}
            onSelectAlt={onSelectAlt}
          />
        )}

        {/* Weather station dots removed — heatmap shows risk visually */}

        {pinLocation && <PinMarker lat={pinLocation.lat} lon={pinLocation.lon} />}
        <FlyTo target={flyTarget} />

        {/* Navigation map controller — must be inside MapContainer */}
        {navSteps && navSteps.length > 0 && onNavInfo && onStopNavigation && (
          <NavigationMapController
            steps={navSteps}
            onUpdate={onNavInfo}
            onArrive={onStopNavigation}
          />
        )}
      </MapContainer>

      {/* Navigation UI overlay — outside MapContainer (no useMap needed) */}
      {navSteps && navSteps.length > 0 && onStopNavigation && (
        <NavigationOverlay
          steps={navSteps} navInfo={navInfo ?? null} onStop={onStopNavigation}
          ferryAnalyses={navFerries} routeStartTime={routeStartTime}
          destination={navDestination}
        />
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
            Trafikk
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
