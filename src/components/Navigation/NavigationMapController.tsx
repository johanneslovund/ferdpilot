import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import { RouteStep } from '../../services/routeApi'
import { findCurrentStep, remainingDistance } from '../../services/navigationService'

export interface NavInfo {
  stepIdx:    number
  remainDist: number
  remainMin:  number
  eta:        string
  bearing:    number | null   // degrees clockwise from North
}

interface Props {
  steps:    RouteStep[]
  onUpdate: (info: NavInfo) => void
  onArrive: () => void
}

export function NavigationMapController({ steps, onUpdate, onArrive }: Props) {
  const map        = useMap()
  const watchId    = useRef<number | null>(null)
  const bearingRef = useRef<number | null>(null)

  // Device orientation → compass heading
  useEffect(() => {
    const handler = (e: DeviceOrientationEvent) => {
      const raw = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading
      if (raw !== undefined && raw !== null) {
        bearingRef.current = raw
      } else if (e.alpha !== null) {
        bearingRef.current = (360 - e.alpha) % 360
      }
    }
    const DOE = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<string>
    }
    if (typeof DOE.requestPermission === 'function') {
      DOE.requestPermission()
        .then(p => { if (p === 'granted') window.addEventListener('deviceorientation', handler, true) })
        .catch(() => {})
    } else {
      window.addEventListener('deviceorientation', handler, true)
    }
    return () => window.removeEventListener('deviceorientation', handler, true)
  }, [])

  useEffect(() => {
    if (!navigator.geolocation || !steps.length) return

    // Rotate the Leaflet map container so direction-of-travel faces "up"
    const applyRotation = (bearing: number) => {
      const container = map.getContainer()
      container.style.transform = `rotate(${-bearing}deg)`
      container.style.transformOrigin = 'center center'
      // Counter-rotate overlays so UI stays upright
      const overlays = container.querySelectorAll<HTMLElement>(
        '.leaflet-control-container, .leaflet-pane.leaflet-shadow-pane, ' +
        '.leaflet-pane.leaflet-marker-pane, .leaflet-pane.leaflet-overlay-pane'
      )
      overlays.forEach(el => {
        el.style.transform = `rotate(${bearing}deg)`
        el.style.transformOrigin = '50% 50%'
      })
    }

    const resetRotation = () => {
      const container = map.getContainer()
      container.style.transform = ''
      container.querySelectorAll<HTMLElement>(
        '.leaflet-control-container, .leaflet-pane'
      ).forEach(el => { el.style.transform = '' })
    }

    // Pause auto-pan while user manually interacts with the map
    let userInteracting = false;
    let interactTimeout: ReturnType<typeof setTimeout> | null = null;
    const onDragStart = () => {
      userInteracting = true;
      if (interactTimeout) clearTimeout(interactTimeout);
    };
    const onDragEnd = () => {
      if (interactTimeout) clearTimeout(interactTimeout);
      interactTimeout = setTimeout(() => { userInteracting = false; }, 6000);
    };
    map.on('dragstart', onDragStart);
    map.on('dragend',   onDragEnd);
    map.on('zoomstart', onDragStart);
    map.on('zoomend',   onDragEnd);

    watchId.current = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lon, speed, heading: gpsHeading } = pos.coords

        // Use GPS heading when moving, fallback to compass
        const bearing = (gpsHeading !== null && !isNaN(gpsHeading) && (speed ?? 0) > 0.5)
          ? gpsHeading
          : bearingRef.current

        if (bearing !== null) applyRotation(bearing)

        const stepIdx = findCurrentStep(lat, lon, steps)
        const remDist = remainingDistance(lat, lon, steps, stepIdx)
        const speedMs = (speed && speed > 1) ? speed : 80 / 3.6
        const remainMin = (remDist / speedMs) / 60
        const etaDate   = new Date(Date.now() + (remDist / speedMs) * 1000)
        const eta       = etaDate.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

        onUpdate({ stepIdx, remainDist: remDist, remainMin, eta, bearing })

        // Keep user centred — only when they're not manually exploring
        if (!userInteracting) {
          map.panTo([lat, lon], { animate: true, duration: 0.4, noMoveStart: true })
        }

        // Auto-end
        if (stepIdx >= steps.length - 2 && remDist < 50) {
          resetRotation()
          onArrive()
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 10000 }
    )

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
      map.off('dragstart', onDragStart)
      map.off('dragend',   onDragEnd)
      map.off('zoomstart', onDragStart)
      map.off('zoomend',   onDragEnd)
      if (interactTimeout) clearTimeout(interactTimeout)
      resetRotation()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps])

  return null
}
