import { useState, useCallback, useRef, useEffect } from 'react';
import { useWeatherGrid } from './hooks/useWeatherGrid';
import { MapView, MapToggles } from './components/MapView/MapView';
import { MapStyle } from './components/MapView/MapStyleSelector';
import { SearchPanel } from './components/SearchBar/SearchBar';
import { SplashScreen } from './components/SplashScreen/SplashScreen';
import { RouteReport } from './components/RouteReport/RouteReport';
import { LocationPanel } from './components/LocationPanel/LocationPanel';
import { fetchRoute, RouteResult } from './services/routeApi';
import { analyzeRoute, RouteAnalysis } from './services/routeAnalysis';
import { fetchTrafficFlow, TrafficFlow } from './services/trafficFlow';
import { reverseGeocode, nearestWeather } from './services/locationAnalysis';
import { generateLocalAnalysis, generateRouteAnalysis } from './services/localAnalysis';
import { fetchWebcams, Webcam } from './services/webcamService';
import { fetchHazards, Hazard } from './services/hazardService';
import { analyseFerries, FerryAnalysis } from './services/ferryService';
import { GridWeather } from './types/weather';
import './styles/global.css';

interface PanelState {
  lat: number; lon: number
  locationName: string
  weather: GridWeather | null
  traffic: TrafficFlow | null
  aiText: string | null
  aiError: string | null
  aiLoading: boolean
}

export default function App() {
  const { data } = useWeatherGrid();

  const [toggles, setToggles] = useState<MapToggles>({
    traffic: true, webcam: false, vaer: false, elevation: false, hazards: false,
  });
  const [mapStyle, setMapStyle] = useState<MapStyle>(
    () => (localStorage.getItem('vf-mapStyle') as MapStyle) ?? 'light'
  );

  // Apply data-mode to root so CSS variables respond to map style
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', mapStyle);
  }, [mapStyle]);
  const [navInfo, setNavInfo] = useState<import('./components/Navigation/NavigationMapController').NavInfo | null>(null);
  const [flyTarget, setFlyTarget] = useState<{
    lat: number; lon: number; zoom?: number; duration?: number
  } | null>(null);
  const [routeResult,    setRouteResult]    = useState<RouteResult | null>(null);
  const [routeAnalysis,  setRouteAnalysis]  = useState<RouteAnalysis | null>(null);
  const [routeAnalysisText, setRouteAnalysisText] = useState<string | undefined>(undefined);
  const [ferryAnalyses, setFerryAnalyses]         = useState<FerryAnalysis[]>([]);
  const [routeStartTime, setRouteStartTime]       = useState<Date | undefined>(undefined);
  const [navigating,     setNavigating]           = useState(false);
  const [routeFrom, setRouteFrom] = useState<[number,number] | null>(null);
  const [routeTo,   setRouteTo]   = useState<[number,number] | null>(null);
  const [routeToName, setRouteToName] = useState('');
  const [panel,      setPanel]      = useState<PanelState | null>(null);
  const [pinLocation, setPinLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [webcams,    setWebcams]    = useState<Webcam[]>([]);
  const [hazards,    setHazards]    = useState<Hazard[]>([]);
  const webcamsFetched = useRef(false);
  const gpsRef         = useRef<[number, number] | null>(null);

  // Prefetch GPS immediately
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { gpsRef.current = [p.coords.latitude, p.coords.longitude]; },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Fetch hazards once on mount
  useEffect(() => { fetchHazards().then(setHazards).catch(() => {}); }, []);

  // Splash reveal → zoom to GPS
  const handleSplashReveal = useCallback(() => {
    const pos = gpsRef.current;
    if (pos) setFlyTarget({ lat: pos[0], lon: pos[1], zoom: 13, duration: 3.5 });
    else     setFlyTarget({ lat: 65.0, lon: 15.0, zoom: 6, duration: 3.5 });
  }, []);

  function onToggle(key: keyof MapToggles) {
    setToggles(t => ({ ...t, [key]: !t[key] }));
    if (key === 'webcam' && !webcamsFetched.current) {
      webcamsFetched.current = true;
      fetchWebcams().then(setWebcams).catch(() => {});
    }
  }

  const handleGpsRequest = useCallback((): Promise<[number, number] | null> =>
    new Promise(resolve => {
      if (gpsRef.current) { resolve(gpsRef.current); return; }
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        p => { const c: [number,number] = [p.coords.latitude, p.coords.longitude]; gpsRef.current = c; resolve(c); },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }), []);

  // GPS reset button
  const handleResetGps = useCallback(async () => {
    const pos = gpsRef.current ?? await handleGpsRequest();
    if (pos) setFlyTarget({ lat: pos[0], lon: pos[1], zoom: 13, duration: 1.5 });
  }, [handleGpsRequest]);

  const handleRoute = useCallback(async (from: [number,number], to: [number,number], fromName = 'Start', toName = 'Mål') => {
    try {
      const result = await fetchRoute(from, to);
      setRouteResult(result);
      setRouteFrom(from); setRouteTo(to); setRouteToName(toName);
      const mid = result.coordinates[Math.floor(result.coordinates.length / 2)];
      setFlyTarget({ lat: mid[0], lon: mid[1] });
      const now = new Date();
      setRouteStartTime(now);
      setRouteAnalysis(analyzeRoute(result.coordinates, data));
      setRouteAnalysisText(generateRouteAnalysis(fromName, toName, data, result.coordinates));
      // Analyse ferries async — don't block route display
      if (result.ferries.length > 0) {
        analyseFerries(result.ferries).then(setFerryAnalyses).catch(() => {});
      } else {
        setFerryAnalyses([]);
      }
    } catch { /* ignore */ }
  }, [data]);

  const handleClear = useCallback(() => {
    setRouteResult(null); setRouteAnalysis(null); setRouteAnalysisText(undefined);
    setRouteFrom(null); setRouteTo(null); setRouteToName('');
    setFerryAnalyses([]); setRouteStartTime(undefined); setNavigating(false);
  }, []);

  const handleMapClick = useCallback(async (lat: number, lon: number) => {
    const wx = nearestWeather(lat, lon, data);
    setPinLocation({ lat, lon });
    setPanel({ lat, lon, locationName: `${lat.toFixed(3)}°N ${lon.toFixed(3)}°Ø`, weather: wx, traffic: null, aiText: null, aiError: null, aiLoading: true });

    const [name, traffic] = await Promise.all([
      reverseGeocode(lat, lon),
      fetchTrafficFlow(lat, lon),
    ]);

    const analysis = generateLocalAnalysis(name, wx, traffic);
    setPanel(p => p ? { ...p, locationName: name, traffic, aiText: analysis, aiError: null, aiLoading: false } : null);
  }, [data]);

  return (
    <>
      <SplashScreen onReveal={handleSplashReveal} />

      {!navigating && <SearchPanel onRoute={handleRoute} onClear={handleClear} onGpsRequest={handleGpsRequest} />}

      {routeResult && routeAnalysis && !navigating && (
        <RouteReport
          analysis={routeAnalysis} route={routeResult}
          routeAnalysisText={routeAnalysisText}
          ferryAnalyses={ferryAnalyses}
          routeStartTime={routeStartTime}
          onNavigate={() => {
            setNavigating(true);
            handleClear();            // reset route report + minimise search
            const pos = gpsRef.current;
            if (pos) setFlyTarget({ lat: pos[0], lon: pos[1], zoom: 16, duration: 1 });
          }}
          fromCoords={routeFrom} toCoords={routeTo} toName={routeToName}
          onClose={handleClear}
        />
      )}

      {panel && (
        <LocationPanel
          {...panel} aiLoading={panel.aiLoading}
          onClose={() => { setPanel(null); setPinLocation(null); }}
        />
      )}

      <MapView
        data={data} toggles={toggles} onToggle={onToggle}
        flyTarget={flyTarget} routeResult={routeResult}
        onMapClick={handleMapClick} webcams={webcams} hazards={hazards}
        pinLocation={pinLocation} mapStyle={mapStyle}
        onMapStyle={(s) => { setMapStyle(s); localStorage.setItem('vf-mapStyle', s); }}
        navInfo={navInfo} onNavInfo={setNavInfo}
        onResetGps={handleResetGps}
        navSteps={navigating && routeResult ? routeResult.steps : undefined}
        onStopNavigation={() => setNavigating(false)}
      />
    </>
  );
}
