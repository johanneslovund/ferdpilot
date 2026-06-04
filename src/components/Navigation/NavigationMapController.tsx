import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { RouteStep } from '../../services/routeApi'
import { findCurrentStep, remainingDistance } from '../../services/navigationService'

export interface NavInfo {
  stepIdx:    number
  remainDist: number
  remainMin:  number
  eta:        string
  bearing:    number | null
}

interface Props {
  steps:    RouteStep[]
  onUpdate: (info: NavInfo) => void
  onArrive: () => void
}

// ── Angle helpers ─────────────────────────────────────────────────────────────
function smoothAngle(current: number, target: number, factor: number): number {
  let diff = target - current
  while (diff >  180) diff -= 360
  while (diff < -180) diff += 360
  return (current + diff * factor + 360) % 360
}

// ── Dead reckoning: extrapolate position given speed + bearing ────────────────
function deadReckon(lat: number, lon: number, speedMs: number, bearingDeg: number, elapsedSec: number): [number, number] {
  if (elapsedSec <= 0 || speedMs < 0.5) return [lat, lon]
  const dist = Math.min(speedMs * elapsedSec, 300) // cap extrapolation at 300m
  const R = 6371000
  const brRad  = bearingDeg * Math.PI / 180
  const latRad = lat * Math.PI / 180
  const lonRad = lon * Math.PI / 180
  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(dist / R) +
    Math.cos(latRad) * Math.sin(dist / R) * Math.cos(brRad)
  )
  const newLonRad = lonRad + Math.atan2(
    Math.sin(brRad) * Math.sin(dist / R) * Math.cos(latRad),
    Math.cos(dist / R) - Math.sin(latRad) * Math.sin(newLatRad)
  )
  return [newLatRad * 180 / Math.PI, newLonRad * 180 / Math.PI]
}

// ── Nav marker icon (updated cheaply via SVG attribute, not icon recreation) ──
function makeNavIcon(bearing: number): L.DivIcon {
  return L.divIcon({
    className: 'nav-marker',
    html: `<svg width="44" height="44" viewBox="0 0 44 44" style="overflow:visible">
      <circle cx="22" cy="22" r="14" fill="rgba(66,133,244,0.12)" stroke="rgba(66,133,244,0.3)" stroke-width="1"/>
      <path class="nav-arrow" d="M22,6 L18,22 L22,18 L26,22 Z"
        fill="rgba(66,133,244,0.85)"
        transform="rotate(${bearing},22,22)"/>
      <circle cx="22" cy="22" r="8" fill="white"/>
      <circle cx="22" cy="22" r="6" fill="#4285F4"/>
    </svg>`,
    iconSize:   [44, 44],
    iconAnchor: [22, 22],
  })
}

// ── Component ─────────────────────────────────────────────────────────────────
export function NavigationMapController({ steps, onUpdate, onArrive }: Props) {
  const map = useMap()

  // Persisted refs — no re-renders on update
  const gpsFixRef     = useRef({ lat: 0, lon: 0, speedMs: 0, bearing: 0, ts: 0, valid: false })
  const bearingRef    = useRef<number>(0)
  const watchId       = useRef<number | null>(null)
  const rafId         = useRef<number | null>(null)
  const markerRef     = useRef<L.Marker | null>(null)
  const lastTouchRef  = useRef(0)
  const lastNavUpdate = useRef(0)
  const lastPanRef    = useRef(0)
  const speedBufRef   = useRef<number[]>([])
  const zoomThrottle  = useRef(0)

  // Device orientation → compass bearing
  useEffect(() => {
    const h = (e: DeviceOrientationEvent) => {
      const raw = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading
      const b = raw !== undefined && raw !== null ? raw : e.alpha !== null ? (360 - e.alpha) % 360 : null
      if (b !== null) bearingRef.current = smoothAngle(bearingRef.current, b, 0.08)
    }
    const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }
    if (typeof DOE.requestPermission === 'function') {
      DOE.requestPermission?.().then(p => { if (p === 'granted') window.addEventListener('deviceorientation', h, true) }).catch(() => {})
    } else {
      window.addEventListener('deviceorientation', h, true)
    }
    return () => window.removeEventListener('deviceorientation', h, true)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation || !steps.length) return

    // Touch detection
    const container = map.getContainer()
    const onTouch = () => { lastTouchRef.current = Date.now() }
    container.addEventListener('touchstart', onTouch, { passive: true })
    container.addEventListener('touchmove',  onTouch, { passive: true })
    map.on('dragstart', onTouch)
    map.on('zoomstart', onTouch)

    // ── 60fps rAF animation loop ──────────────────────────────────────────────
    const loop = () => {
      const fix = gpsFixRef.current
      if (fix.valid) {
        const now    = Date.now()
        const elapsed = (now - fix.ts) / 1000
        const [eLat, eLon] = deadReckon(fix.lat, fix.lon, fix.speedMs, fix.bearing, elapsed)

        // Update marker position at 60fps via setLatLng (pure DOM, no React)
        if (!markerRef.current) {
          markerRef.current = L.marker([eLat, eLon], {
            icon: makeNavIcon(fix.bearing),
            zIndexOffset: 900,
          }).addTo(map)
        } else {
          markerRef.current.setLatLng([eLat, eLon])
          // Update arrow direction cheaply via SVG transform attribute
          const arrow = markerRef.current.getElement()?.querySelector('.nav-arrow')
          if (arrow) arrow.setAttribute('transform', `rotate(${fix.bearing},22,22)`)
        }

        // Throttled map pan: ~5fps (every 200ms), smooth Leaflet animation
        const userIdle = now - lastTouchRef.current > 6000
        if (userIdle && now - lastPanRef.current > 200) {
          lastPanRef.current = now
          const bounds  = map.getBounds()
          const latSpan = (bounds.getNorth() - bounds.getSouth()) * 0.30
          const lonSpan = (bounds.getEast()  - bounds.getWest())  * 0.30
          const inner   = L.latLngBounds(
            [bounds.getSouth() + latSpan, bounds.getWest() + lonSpan],
            [bounds.getNorth() - latSpan, bounds.getEast() - lonSpan]
          )
          if (!inner.contains([eLat, eLon])) {
            // Smooth 0.5s pan — short enough not to lag, long enough to be smooth
            map.panTo([eLat, eLon], { animate: true, duration: 0.5, easeLinearity: 0.9, noMoveStart: true })
          }
        }
      }
      rafId.current = requestAnimationFrame(loop)
    }
    rafId.current = requestAnimationFrame(loop)

    // ── GPS watch: receives real fixes ────────────────────────────────────────
    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, speed, heading: gpsHeading } = pos.coords
        const now = Date.now()

        // Smooth position
        const prev = gpsFixRef.current
        const sLat = prev.valid ? prev.lat * 0.55 + lat * 0.45 : lat
        const sLon = prev.valid ? prev.lon * 0.55 + lon * 0.45 : lon

        // Smoothed speed
        const rawMs = speed && speed > 0.5 ? speed : 0
        speedBufRef.current.push(rawMs)
        if (speedBufRef.current.length > 5) speedBufRef.current.shift()
        const avgMs = speedBufRef.current.reduce((s,v) => s+v,0) / speedBufRef.current.length

        // Bearing: GPS heading at >8 km/h, compass otherwise
        const speedKmh = avgMs * 3.6
        if (gpsHeading !== null && !isNaN(gpsHeading) && speedKmh > 8) {
          bearingRef.current = smoothAngle(bearingRef.current, gpsHeading, 0.3)
        }

        gpsFixRef.current = { lat: sLat, lon: sLon, speedMs: avgMs, bearing: bearingRef.current, ts: now, valid: true }

        // ── Navigation metrics (throttled to ~1/sec, no speed fluctuation) ───
        if (now - lastNavUpdate.current > 800) {
          lastNavUpdate.current = now
          const stepIdx  = findCurrentStep(sLat, sLon, steps)
          const remDist  = remainingDistance(sLat, sLon, steps, stepIdx)
          const remMin   = avgMs > 0.5 ? remDist / avgMs / 60 : 0
          const etaDate  = new Date(now + (avgMs > 0.5 ? remDist / avgMs * 1000 : 0))
          const eta      = etaDate.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
          onUpdate({ stepIdx, remainDist: remDist, remainMin: remMin, eta, bearing: bearingRef.current })

          // Dynamic zoom (throttled)
          const userIdle = now - lastTouchRef.current > 6000
          if (userIdle && now - zoomThrottle.current > 3000) {
            const distToNext = steps[stepIdx]?.distance ?? remDist
            const z = distToNext < 80 ? 18 : distToNext < 200 ? 17 : distToNext < 600 ? 16
              : distToNext < 3000 ? 15 : distToNext < 10000 ? 14 : 13
            if (Math.abs(map.getZoom() - z) >= 1) {
              zoomThrottle.current = now
              map.setZoom(z, { animate: true })
            }
          }

          if (stepIdx >= steps.length - 2 && remDist < 50) onArrive()
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    )

    return () => {
      if (rafId.current)   cancelAnimationFrame(rafId.current)
      if (watchId.current) navigator.geolocation.clearWatch(watchId.current)
      markerRef.current?.remove()
      markerRef.current = null
      container.removeEventListener('touchstart', onTouch)
      container.removeEventListener('touchmove',  onTouch)
      map.off('dragstart', onTouch)
      map.off('zoomstart', onTouch)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps])

  return null
}
