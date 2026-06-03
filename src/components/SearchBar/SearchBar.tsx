import { useState, useRef, useEffect, useCallback } from 'react';
import { searchLocations, GeoResult } from '../../services/geocodeApi';
import './SearchBar.css';

// ── shared address-search hook ────────────────────────────────────────────────
function useAddressSearch() {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen]       = useState(false);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try { const r = await searchLocations(q); setResults(r); setOpen(r.length > 0); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => search(query), 300);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
  }, [query, search]);

  function clear() { setQuery(''); setResults([]); setOpen(false); }
  return { query, setQuery, results, loading, open, setOpen, clear };
}

// ── props ─────────────────────────────────────────────────────────────────────
interface SearchPanelProps {
  onRoute: (from: [number, number], to: [number, number], fromName: string, toName: string) => void;
  onClear: () => void;
  onGpsRequest: () => Promise<[number, number] | null>;
}

// ── component ─────────────────────────────────────────────────────────────────
export function SearchPanel({ onRoute, onClear, onGpsRequest }: SearchPanelProps) {
  const dest = useAddressSearch();                   // Phase 1 — destination search
  const from = useAddressSearch();                   // Phase 2 — start point search

  const [destCoords, setDestCoords] = useState<[number, number] | null>(null);
  const [fromCoords, setFromCoords] = useState<[number, number] | null>(null);
  const [fromGps,    setFromGps]    = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [routing,    setRouting]    = useState(false);

  const pillRef  = useRef<HTMLDivElement>(null);
  const fromRef  = useRef<HTMLDivElement>(null);

  // Phase: 'pill' = single search bar, 'expanded' = full route panel
  const phase = destCoords ? 'expanded' : 'pill';

  // Close dropdowns on outside click
  useEffect(() => {
    function h(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) dest.setOpen(false);
      if (fromRef.current && !fromRef.current.contains(e.target as Node)) from.setOpen(false);
    }
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [dest, from]);

  function selectDest(r: GeoResult) {
    dest.setQuery(r.shortName);
    dest.setOpen(false);
    setDestCoords([r.lat, r.lon]);
    // Default start = Min Posisjon — set label but defer GPS fetch until route is calculated
    if (!fromCoords && !fromGps) {
      setFromGps(true);
      from.setQuery('Min posisjon');
    }
  }

  function selectFrom(r: GeoResult) {
    from.setQuery(r.shortName);
    from.setOpen(false);
    setFromCoords([r.lat, r.lon]);
    setFromGps(false);
  }

  async function handleGps() {
    setGpsLoading(true);
    const c = await onGpsRequest();
    setGpsLoading(false);
    if (c) { setFromGps(true); setFromCoords(c); from.setQuery('Min posisjon'); }
  }

  async function handleRoute() {
    if (!destCoords) return;
    let start = fromCoords;
    if (!start) {
      setGpsLoading(true);
      const gps = await onGpsRequest();
      setGpsLoading(false);
      if (!gps) return;
      start = gps;
      setFromGps(true); setFromCoords(gps); from.setQuery('Min posisjon');
    }
    setRouting(true);
    await onRoute(start, destCoords, fromGps ? 'Min posisjon' : (from.query || 'Start'), dest.query);
    setRouting(false);
  }

  function clearAll() {
    dest.clear(); from.clear();
    setDestCoords(null); setFromCoords(null); setFromGps(false);
    onClear();
  }

  // ── Phase 1: single pill ────────────────────────────────────────────────────
  if (phase === 'pill') {
    return (
      <div className="search-pill-wrap" ref={pillRef}>
        <div className="search-pill">
          <span className="search-pill__icon">⌕</span>
          <input
            className="search-pill__input"
            type="text"
            placeholder="Søk her"
            value={dest.query}
            onChange={(e) => { dest.setQuery(e.target.value); }}
            onFocus={() => dest.results.length > 0 && dest.setOpen(true)}
            autoComplete="off"
            spellCheck={false}
          />
          {dest.query && (
            <button className="search-pill__clear" onClick={() => dest.clear()}>×</button>
          )}
        </div>

        {dest.open && (
          <div className="search-dropdown" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0 }}>
            {dest.loading
              ? <div className="search-dropdown__loading">Søker…</div>
              : dest.results.map((r, i) => (
                  <div key={i} className="search-dropdown__item" onMouseDown={() => selectDest(r)}>
                    <div className="search-dropdown__main">{r.shortName}</div>
                    <div className="search-dropdown__sub">{r.displayName}</div>
                  </div>
                ))
            }
          </div>
        )}
      </div>
    );
  }

  // ── Phase 2: expanded panel (destination set) ───────────────────────────────
  return (
    <div className="search-panel">
      {/* Destination row — always filled */}
      <div className="search-field" style={{ borderColor: 'rgba(137,207,240,0.3)' }}>
        <span className="search-field__label">Til</span>
        <span className="search-field__sep" />
        <input
          className="search-field__input"
          value={dest.query}
          onChange={(e) => { dest.setQuery(e.target.value); if (!e.target.value) { setDestCoords(null); onClear(); } }}
          onFocus={() => dest.results.length > 0 && dest.setOpen(true)}
          autoComplete="off" spellCheck={false}
          style={{ color: '#89cff0' }}
        />
        {dest.open && (
          <div className="search-dropdown">
            {dest.results.map((r, i) => (
              <div key={i} className="search-dropdown__item" onMouseDown={() => selectDest(r)}>
                <div className="search-dropdown__main">{r.shortName}</div>
                <div className="search-dropdown__sub">{r.displayName}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Start row — when in GPS mode show label; tap × to switch to text */}
      <div className="search-field" ref={fromRef}>
        <span className="search-field__label">Fra</span>
        <span className="search-field__sep" />
        {fromGps ? (
          /* GPS mode — show label, × lets user type instead */
          <span className="search-field__input" style={{ color: '#89cff0', cursor: 'default' }}>
            {gpsLoading ? 'Henter posisjon…' : 'Min posisjon'}
          </span>
        ) : (
          <input
            className="search-field__input"
            placeholder="Startsted…"
            value={from.query}
            onChange={(e) => { setFromCoords(null); from.setQuery(e.target.value); }}
            onFocus={() => from.results.length > 0 && from.setOpen(true)}
            autoComplete="off" spellCheck={false}
          />
        )}
        {fromGps
          ? <button className="search-field__clear" onClick={() => { setFromGps(false); setFromCoords(null); from.clear(); }}>×</button>
          : from.query
            ? <button className="search-field__clear" onClick={() => { setFromCoords(null); from.clear(); }}>×</button>
            : <button className="search-field__gps" onClick={handleGps} disabled={gpsLoading}>
                {gpsLoading ? '…' : 'GPS'}
              </button>
        }
        {from.open && (
          <div className="search-dropdown">
            {from.loading
              ? <div className="search-dropdown__loading">Søker…</div>
              : from.results.map((r, i) => (
                  <div key={i} className="search-dropdown__item" onMouseDown={() => selectFrom(r)}>
                    <div className="search-dropdown__main">{r.shortName}</div>
                    <div className="search-dropdown__sub">{r.displayName}</div>
                  </div>
                ))
            }
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="search-actions">
        <button className="search-go" onClick={handleRoute} disabled={routing}>
          {routing ? 'Beregner…' : 'Beregn rute'}
        </button>
        <button className="search-close" onClick={clearAll} title="Tøm søk">×</button>
      </div>
    </div>
  );
}
