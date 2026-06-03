import { FerryStep } from './routeApi';

const ET_CLIENT = 'Vinterfoere-App';
const ENTUR_GEO = 'https://api.entur.io/geocoder/v1/autocomplete';
const ENTUR_GQL = 'https://api.entur.io/journey-planner/v3/graphql';

export interface FerryDeparture {
  time: Date;
  destination: string;
}

export interface FerryAnalysis {
  ferry: FerryStep
  stopName: string
  etaToFerry: Date          // when user arrives at ferry terminal
  departures: FerryDeparture[]
  nextFerry: FerryDeparture | null
  minutesEarly: number | null  // positive = arrive before ferry, negative = miss it
  requiredSpeedKmh: number | null  // speed needed to catch the soonest missed ferry
  speedLimitKmh: number            // assumed speed limit
}

// ── Entur geocoder: find NSR stop ID for a terminal name ────────────────────
async function findFerryStopId(terminalName: string): Promise<{ id: string; name: string } | null> {
  try {
    const q = encodeURIComponent(terminalName + ' ferjekai');
    const res = await fetch(`${ENTUR_GEO}?text=${q}&size=5&layers=venue`, {
      headers: { 'ET-Client-Name': ET_CLIENT },
    });
    if (!res.ok) return null;
    const data = await res.json() as { features: Array<{ properties: { id: string; name: string } }> };
    const hit = data.features.find(f => f.properties.id?.startsWith('NSR:StopPlace:'));
    return hit ? { id: hit.properties.id, name: hit.properties.name } : null;
  } catch { return null; }
}

// ── Entur GQL: get departures after a given time ────────────────────────────
async function getDepartures(stopId: string, after: Date): Promise<FerryDeparture[]> {
  const query = `{
    stopPlace(id: "${stopId}") {
      estimatedCalls(
        numberOfDepartures: 14
        startTime: "${after.toISOString()}"
        timeRange: 28800
      ) {
        aimedDepartureTime
        expectedDepartureTime
        destinationDisplay { frontText }
      }
    }
  }`;
  try {
    const res = await fetch(ENTUR_GQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'ET-Client-Name': ET_CLIENT },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];
    const { data } = await res.json() as {
      data: { stopPlace: { estimatedCalls: Array<{
        aimedDepartureTime: string;
        expectedDepartureTime: string | null;
        destinationDisplay: { frontText: string };
      }> } | null }
    };
    return (data.stopPlace?.estimatedCalls ?? []).map(c => ({
      time: new Date(c.expectedDepartureTime ?? c.aimedDepartureTime),
      destination: c.destinationDisplay.frontText,
    }));
  } catch { return []; }
}

// ── Main: analyse all ferries in a route ───────────────────────────────────
export async function analyseFerries(
  ferries: FerryStep[],
  departureTime: Date = new Date()
): Promise<FerryAnalysis[]> {
  const results: FerryAnalysis[] = [];

  for (const ferry of ferries) {
    const stopInfo = await findFerryStopId(ferry.departureName);
    if (!stopInfo) continue;

    const etaToFerry = new Date(
      departureTime.getTime() + ferry.driveTimeToFerryMin * 60 * 1000
    );

    // Fetch departures from 90 min before ETA (to show up to 2 earlier) through 8h after
    const fetchFrom = new Date(etaToFerry.getTime() - 90 * 60 * 1000);
    const allDeps = await getDepartures(stopInfo.id, fetchFrom);
    if (!allDeps.length) continue;

    // Filter by direction — keep only departures toward the route's destination
    const destName = ferry.destinationName.toLowerCase();
    const departures = destName
      ? allDeps.filter(d => d.destination.toLowerCase().includes(destName.split(' ')[0]))
      : allDeps;

    // Fall back to all if filtering removed everything
    const finalDeps = departures.length ? departures : allDeps;

    // Next ferry the user can realistically catch (departing after ETA - 2 min grace)
    const nextFerry = finalDeps.find(d => d.time >= new Date(etaToFerry.getTime() - 2 * 60 * 1000)) ?? null;

    let minutesEarly: number | null = null;
    let requiredSpeedKmh: number | null = null;
    const speedLimitKmh = 80; // typical Norwegian main-road limit to ferries

    if (nextFerry) {
      minutesEarly = (nextFerry.time.getTime() - etaToFerry.getTime()) / 60000;

      // If just missing the next ferry (within 20 min), calculate required speed
      if (minutesEarly < 0 && minutesEarly > -20) {
        // Time available to CATCH this ferry = ferry_time - departure_time
        const hoursAvailable = (nextFerry.time.getTime() - departureTime.getTime()) / 3600000;
        if (hoursAvailable > 0) {
          const required = ferry.driveDistanceToFerryKm / hoursAvailable;
          if (required <= speedLimitKmh + 40) {
            requiredSpeedKmh = Math.round(required);
          }
        }
      }
    }

    results.push({
      ferry,
      stopName:        stopInfo.name,
      etaToFerry,
      departures:      finalDeps,   // full list — RouteReport slices 2+3
      nextFerry,
      minutesEarly,
      requiredSpeedKmh,
      speedLimitKmh,
    });
  }

  return results;
}
