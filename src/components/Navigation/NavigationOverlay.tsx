import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { RouteStep } from '../../services/routeApi'
import {
  maneuverArrow,
  fmtDistance,
  fmtDuration,
  findCurrentStep,
  remainingDistance,
} from '../../services/navigationService'
import './NavigationOverlay.css'

interface Props {
  steps: RouteStep[]
  onStop: () => void
}

export function NavigationOverlay({ steps, onStop }: Props) {
  const map = useMap()
  const [currentStep, setCurrentStep] = useState(0)
  const [remainDist,  setRemainDist]  = useState(0)
  const [remainMin,   setRemainMin]   = useState(0)
  const [eta,         setEta]         = useState('')
  const watchId = useRef<number | null>(null)

  useEffect(() => {
    if (!navigator.geolocation || !steps.length) return

    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lon, speed } = pos.coords
        const stepIdx = findCurrentStep(lat, lon, steps)
        const remDist = remainingDistance(lat, lon, steps, stepIdx)

        // Estimate remaining time: use speed if available, else 80 km/h average
        const speedMs = speed && speed > 0 ? speed : 80 / 3.6
        const remSec  = remDist / speedMs
        const remMin  = remSec / 60

        const etaDate = new Date(Date.now() + remSec * 1000)
        const etaStr  = etaDate.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })

        setCurrentStep(stepIdx)
        setRemainDist(remDist)
        setRemainMin(remMin)
        setEta(etaStr)

        // Pan map to follow user
        map.panTo([lat, lon], { animate: true, duration: 0.5 })

        // Auto-end navigation on arrival (within 50 m of last step)
        if (stepIdx >= steps.length - 2 && remDist < 50) {
          onStop()
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 2000 }
    )

    return () => {
      if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    }
  }, [steps, map, onStop])

  if (!steps.length) return null

  const step     = steps[currentStep]
  const nextStep = steps[currentStep + 1]
  const distToStep = currentStep < steps.length - 1 ? step.distance : 0

  return (
    <div className="nav-overlay">
      {/* Main instruction card */}
      <div className="nav-instruction">
        <div className="nav-instruction__arrow">
          {maneuverArrow(step.maneuverType, step.maneuverModifier)}
        </div>
        <div className="nav-instruction__text">
          <div className="nav-instruction__distance">
            {fmtDistance(distToStep)}
          </div>
          <div className="nav-instruction__desc">{step.instruction}</div>
        </div>
        <button className="nav-instruction__stop" onClick={onStop}>
          Stopp
        </button>
      </div>

      {/* Status bar */}
      <div className="nav-status">
        <div className="nav-status__item">
          <span className="nav-status__value">{fmtDistance(remainDist)}</span>
          <span className="nav-status__label">Gjenstår</span>
        </div>
        <div className="nav-status__divider" />
        <div className="nav-status__item">
          <span className="nav-status__value">{fmtDuration(remainMin)}</span>
          <span className="nav-status__label">Tid</span>
        </div>
        <div className="nav-status__divider" />
        <div className="nav-status__item">
          <span className="nav-status__value">{eta || '--:--'}</span>
          <span className="nav-status__label">ETA</span>
        </div>
      </div>

      {/* Next step hint */}
      {nextStep && (
        <div className="nav-next">
          Deretter: {maneuverArrow(nextStep.maneuverType, nextStep.maneuverModifier)}{' '}
          {nextStep.instruction}
        </div>
      )}
    </div>
  )
}
