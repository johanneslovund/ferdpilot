import { useState, useEffect, useCallback } from 'react';
import { TileLayer } from 'react-leaflet';

export function RainViewerLayer() {
  const [tileUrl, setTileUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      if (!res.ok) return;
      const data = await res.json() as { radar: { past: Array<{ path: string }> } };
      const frames = data.radar?.past ?? [];
      if (!frames.length) return;
      const path = frames[frames.length - 1].path;
      setTileUrl(`https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/6/1_1.png`);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  if (!tileUrl) return null;

  return (
    <TileLayer
      key={tileUrl}
      url={tileUrl}
      opacity={0.6}
      tileSize={256}
      // RainViewer radar tiles exist for zoom 0–12.
      // minNativeZoom=0: don't hide at any low zoom (no "zoom not supported" tile)
      // maxNativeZoom=12: tiles above zoom 12 are scaled up by Leaflet automatically
      minNativeZoom={0}
      maxNativeZoom={12}
      maxZoom={18}
      zIndex={400}
      attribution='Nedbørradar &copy; <a href="https://www.rainviewer.com">RainViewer</a>'
    />
  );
}
