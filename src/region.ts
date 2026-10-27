// Region suggestions worked out on the phone. Coordinates are never sent anywhere for this.
// Province: nearest of ~90 reference towns (a simple Voronoi map), so it can be wrong near borders.
// Rainfall and bee zones: hand-drawn approximations to be checked by an expert. Always shown as "Suggested".

export type Rainfall = 'winter' | 'year-round' | 'summer';
export type BeeZone = 'cape' | 'hybrid' | 'african';
export interface RegionGuess {
  province: string | null; // null = looks outside South Africa
  nearest: string;
  rainfall: Rainfall;
  beeZone: BeeZone;
}

// [town, province, lat, lng]
// prettier-ignore
const TOWNS: [string, string, number, number][] = [
  ['Cape Town', 'Western Cape', -33.92, 18.42], ['Stellenbosch', 'Western Cape', -33.93, 18.86], ['Worcester', 'Western Cape', -33.65, 19.44],
  ['George', 'Western Cape', -33.96, 22.46], ['Oudtshoorn', 'Western Cape', -33.59, 22.2], ['Beaufort West', 'Western Cape', -32.35, 22.58],
  ['Vredendal', 'Western Cape', -31.67, 18.5], ['Clanwilliam', 'Western Cape', -32.18, 18.89], ['Swellendam', 'Western Cape', -34.02, 20.44],
  ['Laingsburg', 'Western Cape', -33.2, 20.86], ['Knysna', 'Western Cape', -34.04, 23.05], ['Mossel Bay', 'Western Cape', -34.18, 22.13],
  ['Springbok', 'Northern Cape', -29.66, 17.89], ['Upington', 'Northern Cape', -28.45, 21.26], ['Kimberley', 'Northern Cape', -28.74, 24.77],
  ['Calvinia', 'Northern Cape', -31.47, 19.78], ['De Aar', 'Northern Cape', -30.65, 24.01], ['Kuruman', 'Northern Cape', -27.45, 23.43],
  ['Sutherland', 'Northern Cape', -32.39, 20.66], ['Carnarvon', 'Northern Cape', -30.97, 22.13], ['Prieska', 'Northern Cape', -29.66, 22.75],
  ['Port Nolloth', 'Northern Cape', -29.25, 16.87], ['Kathu', 'Northern Cape', -27.7, 23.05],
  ['Gqeberha', 'Eastern Cape', -33.96, 25.6], ['East London', 'Eastern Cape', -33.02, 27.91], ['Makhanda', 'Eastern Cape', -33.31, 26.53],
  ['Mthatha', 'Eastern Cape', -31.59, 28.78], ['Graaff-Reinet', 'Eastern Cape', -32.25, 24.53], ['Komani', 'Eastern Cape', -31.9, 26.88],
  ['Aliwal North', 'Eastern Cape', -30.69, 26.71], ['Jeffreys Bay', 'Eastern Cape', -34.05, 24.92], ['Cradock', 'Eastern Cape', -32.17, 25.62],
  ['Mount Fletcher', 'Eastern Cape', -30.69, 28.5], ['Port St Johns', 'Eastern Cape', -31.62, 29.54],
  ['Bloemfontein', 'Free State', -29.12, 26.21], ['Bethlehem', 'Free State', -28.23, 28.31], ['Welkom', 'Free State', -27.98, 26.73],
  ['Kroonstad', 'Free State', -27.65, 27.23], ['Sasolburg', 'Free State', -26.81, 27.82], ['Zastron', 'Free State', -30.3, 27.08],
  ['Phuthaditjhaba', 'Free State', -28.52, 28.82], ['Trompsburg', 'Free State', -30.03, 25.78], ['Jacobsdal', 'Free State', -29.13, 24.77],
  ['Durban', 'KwaZulu-Natal', -29.86, 31.02], ['Pietermaritzburg', 'KwaZulu-Natal', -29.6, 30.38], ['Newcastle', 'KwaZulu-Natal', -27.76, 29.93],
  ['Richards Bay', 'KwaZulu-Natal', -28.78, 32.04], ['Ladysmith', 'KwaZulu-Natal', -28.56, 29.78], ['Port Shepstone', 'KwaZulu-Natal', -30.74, 30.45],
  ['Vryheid', 'KwaZulu-Natal', -27.77, 30.79], ['Kokstad', 'KwaZulu-Natal', -30.55, 29.42], ['Jozini', 'KwaZulu-Natal', -27.43, 32.06],
  ['Johannesburg', 'Gauteng', -26.2, 28.05], ['Pretoria', 'Gauteng', -25.75, 28.19], ['Vereeniging', 'Gauteng', -26.67, 27.93],
  ['Krugersdorp', 'Gauteng', -26.1, 27.77], ['Benoni', 'Gauteng', -26.19, 28.32], ['Bronkhorstspruit', 'Gauteng', -25.81, 28.74],
  ['Mbombela', 'Mpumalanga', -25.47, 30.97], ['eMalahleni', 'Mpumalanga', -25.87, 29.23], ['Ermelo', 'Mpumalanga', -26.53, 29.98],
  ['Secunda', 'Mpumalanga', -26.55, 29.17], ['Lydenburg', 'Mpumalanga', -25.1, 30.45], ['Komatipoort', 'Mpumalanga', -25.43, 31.95],
  ['Piet Retief', 'Mpumalanga', -27.01, 30.81], ['Standerton', 'Mpumalanga', -26.93, 29.24],
  ['Polokwane', 'Limpopo', -23.9, 29.45], ['Thohoyandou', 'Limpopo', -22.95, 30.48], ['Musina', 'Limpopo', -22.35, 30.04],
  ['Lephalale', 'Limpopo', -23.68, 27.7], ['Tzaneen', 'Limpopo', -23.83, 30.16], ['Bela-Bela', 'Limpopo', -24.88, 28.29],
  ['Mokopane', 'Limpopo', -24.19, 29.01], ['Phalaborwa', 'Limpopo', -23.94, 31.14], ['Groblersdal', 'Limpopo', -25.17, 29.4],
  ['Mahikeng', 'North West', -25.85, 25.64], ['Rustenburg', 'North West', -25.67, 27.24], ['Potchefstroom', 'North West', -26.71, 27.1],
  ['Klerksdorp', 'North West', -26.87, 26.67], ['Vryburg', 'North West', -26.96, 24.73], ['Brits', 'North West', -25.63, 27.78],
  ['Lichtenburg', 'North West', -26.15, 26.16], ['Christiana', 'North West', -27.91, 25.17], ['Zeerust', 'North West', -25.54, 26.08],
  // Neighbours, so points there are not forced into a province.
  ['Maseru', '', -29.31, 27.48], ['Mokhotlong', '', -29.29, 29.07], ['Mbabane', '', -26.32, 31.14], ['Gaborone', '', -24.65, 25.91],
  ['Maputo', '', -25.97, 32.57], ['Beitbridge', '', -22.22, 30.0], ['Karasburg', '', -28.01, 18.75],
];

export function suggestRegion(lat: number, lng: number): RegionGuess {
  const k = Math.cos((lat * Math.PI) / 180);
  let best = TOWNS[0];
  let bestD = Infinity;
  for (const t of TOWNS) {
    const d = (t[2] - lat) ** 2 + ((t[3] - lng) * k) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  const outside = !best[1] || lat > -22 || lat < -35.2 || lng < 16.3 || lng > 33;
  return { province: outside ? null : best[1], nearest: best[0], rainfall: rainfallZone(lat, lng), beeZone: beeZone(lat, lng) };
}

/** Winter rainfall in the west and south-west, year-round along the southern coast, summer elsewhere. */
export function rainfallZone(lat: number, lng: number): Rainfall {
  if (lng < 20.5 && lat < -29.5) return 'winter';
  if (lat < -33.2 && lng >= 20.5 && lng < 26) return 'year-round';
  return 'summer';
}

/** Cape bees in the south-western and southern Cape; a hybrid belt north of it; African bees elsewhere. */
export function beeZone(lat: number, lng: number): BeeZone {
  if ((lat < -32 && lng < 20.5) || (lat < -33.3 && lng < 26)) return 'cape';
  if ((lat < -30 && lng < 27.5) || (lat < -28.5 && lng < 19)) return 'hybrid';
  return 'african';
}

/** Fallback when an apiary has no location: broad defaults per province. */
export function zonesForProvince(province?: string): { rainfall: Rainfall; beeZone: BeeZone } {
  if (province === 'Western Cape') return { rainfall: 'winter', beeZone: 'cape' };
  if (province === 'Eastern Cape' || province === 'Northern Cape') return { rainfall: 'summer', beeZone: 'hybrid' };
  return { rainfall: 'summer', beeZone: 'african' };
}

export const RAINFALL_LABEL: Record<Rainfall, string> = { winter: 'Winter rainfall', 'year-round': 'Year-round rainfall', summer: 'Summer rainfall' };
export const BEE_ZONE_LABEL: Record<BeeZone, string> = { cape: 'Cape bee zone', hybrid: 'Cape and African hybrid zone', african: 'African bee zone' };
