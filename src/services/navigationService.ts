import { RouteStep } from './routeApi'

// Arrow glyphs for maneuver types
export function maneuverArrow(type: string, modifier?: string): string {
  if (type === 'arrive')   return '⚑'
  if (type === 'depart')   return '▶'
  if (type === 'ferry')    return '⛴'
  if (type === 'roundabout' || type === 'rotary') return '↻'

  const mod = modifier ?? ''
  if (mod === 'left')         return '↰'
  if (mod === 'right')        return '↱'
  if (mod === 'slight left')  return '↖'
  if (mod === 'slight right') return '↗'
  if (mod === 'sharp left')   return '⬅'
  if (mod === 'sharp right')  return '➡'
  if (mod === 'uturn')        return '↩'
  return '↑'
}

// Format distance in Norwegian style
export function fmtDistance(metres: number): string {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1).replace('.', ',')} km`
  if (metres >= 100)  return `${Math.round(metres / 10) * 10} m`
  return `${Math.round(metres)} m`
}

// Format duration
export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h} t ${m} min` : `${h} t`
}

// Haversine distance between two lat/lon points (metres)
export function distanceBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Find which step index we're currently on based on GPS position
export function findCurrentStep(
  lat: number, lon: number,
  steps: RouteStep[]
): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < steps.length; i++) {
    const d = distanceBetween(lat, lon, steps[i].lat, steps[i].lon)
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }
  // If we're past the closest step start, look one ahead
  if (bestIdx < steps.length - 1) {
    const distToNext = distanceBetween(lat, lon, steps[bestIdx + 1].lat, steps[bestIdx + 1].lon)
    if (distToNext < bestDist) bestIdx++
  }
  return bestIdx
}

// Calculate remaining distance from current position to end
export function remainingDistance(
  lat: number, lon: number,
  steps: RouteStep[],
  currentStep: number
): number {
  let total = distanceBetween(lat, lon, steps[currentStep].lat, steps[currentStep].lon)
  for (let i = currentStep; i < steps.length; i++) {
    total += steps[i].distance
  }
  return total
}
