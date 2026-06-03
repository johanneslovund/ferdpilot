// ── Types ─────────────────────────────────────────────────────────────────────

export interface FerryStep {
  name: string
  departureName: string
  destinationName: string
  departureLat: number
  departureLon: number
  ferryDurationMin: number
  driveTimeToFerryMin: number
  driveDistanceToFerryKm: number
}

export interface RouteStep {
  instruction: string          // Norwegian instruction text
  maneuverType: string         // 'turn','depart','arrive','ferry','roundabout', etc.
  maneuverModifier?: string    // 'left','right','straight','slight left', etc.
  name: string                 // road/ferry name
  distance: number             // metres to next step
  duration: number             // seconds for this step
  lat: number                  // step start latitude
  lon: number                  // step start longitude
  mode: string                 // 'driving' | 'ferry'
}

export interface RouteResult {
  coordinates: [number, number][]  // [lat, lon]
  distanceKm: number
  durationMin: number
  ferries: FerryStep[]
  steps: RouteStep[]
}

// ── Norwegian instruction generation ─────────────────────────────────────────

function toNorwegian(type: string, modifier: string | undefined, name: string): string {
  const road = name ? ` på ${name}` : ''

  if (type === 'depart')  return `Start${road}`
  if (type === 'arrive')  return 'Du har nådd destinasjonen'
  if (type === 'ferry')   return `Ta ferjen${name ? ` (${name})` : ''}`

  if (type === 'roundabout' || type === 'rotary')
    return `Ta avkjørselen i rundkjøringen${road}`

  const mod = modifier ?? ''
  if (type === 'turn' || type === 'new name' || type === 'fork' ||
      type === 'end of road' || type === 'continue' || type === 'merge') {
    if (mod === 'left')        return `Sving til venstre${road}`
    if (mod === 'right')       return `Sving til høyre${road}`
    if (mod === 'slight left') return `Hold til venstre${road}`
    if (mod === 'slight right')return `Hold til høyre${road}`
    if (mod === 'sharp left')  return `Ta en skarp venstre sving${road}`
    if (mod === 'sharp right') return `Ta en skarp høyre sving${road}`
    if (mod === 'uturn')       return `Snu${road}`
    return `Fortsett rett frem${road}`
  }

  return name ? `Fortsett på ${name}` : 'Fortsett rett frem'
}

// ── Main fetch ────────────────────────────────────────────────────────────────

interface OsrmStep {
  mode: string
  name: string
  duration: number
  distance: number
  maneuver: { type: string; modifier?: string; location: [number, number] }
}

export async function fetchRoute(
  from: [number, number],
  to: [number, number]
): Promise<RouteResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from[1]},${from[0]};${to[1]},${to[0]}` +
    `?overview=full&geometries=geojson&steps=true`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Kunne ikke hente rute')
  const data = await res.json() as {
    routes: Array<{
      geometry: { coordinates: [number, number][] }
      distance: number
      duration: number
      legs: Array<{ steps: OsrmStep[] }>
    }>
  }
  const route = data.routes[0]

  const ferries: FerryStep[] = []
  const steps:   RouteStep[] = []
  let cumTimeSec = 0
  let cumDistM   = 0

  for (const leg of route.legs ?? []) {
    for (const step of leg.steps ?? []) {
      const [lon, lat] = step.maneuver.location

      // Parse ferry crossings
      if (step.mode === 'ferry') {
        const parts = step.name.split(/\s*[-–]\s*/)
        ferries.push({
          name:                    step.name,
          departureName:           parts[0]?.trim() ?? step.name,
          destinationName:         parts[1]?.trim() ?? '',
          departureLon:            lon,
          departureLat:            lat,
          ferryDurationMin:        step.duration / 60,
          driveTimeToFerryMin:     cumTimeSec / 60,
          driveDistanceToFerryKm:  cumDistM / 1000,
        })
      }

      // Build step
      steps.push({
        instruction:      toNorwegian(step.maneuver.type, step.maneuver.modifier, step.name),
        maneuverType:     step.maneuver.type,
        maneuverModifier: step.maneuver.modifier,
        name:             step.name,
        distance:         step.distance,
        duration:         step.duration,
        lat,
        lon,
        mode:             step.mode,
      })

      cumTimeSec += step.duration
      cumDistM   += step.distance
    }
  }

  return {
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
    distanceKm:  route.distance / 1000,
    durationMin: route.duration / 60,
    ferries,
    steps,
  }
}
