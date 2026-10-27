// Southern African bee forage. Windows are "reported by beekeepers" (SANBI list from the Masehela survey,
// organised by the beekeeper's home province, not ranked by importance) unless marked otherwise.
// Every card needs review by a South African beekeeper or ARC contact before release.

export type Reward = 'nectar' | 'pollen' | 'both';
export interface Source {
  label: string;
  url: string;
}
export interface Plant {
  id: string;
  name: string;
  latin?: string;
  group: 'aloe' | 'tree' | 'fynbos' | 'crop' | 'weed';
  provinces: string[] | 'all';
  months: number[]; // reported flowering months, 1 = Jan
  peak?: number[];
  monthsByProvince?: Record<string, number[]>;
  reward: Reward;
  engage: string; // how bees work the flower
  note?: string;
  birds?: boolean; // mainly bird-pollinated: a showy flower is not always a bee flower
  invasive?: boolean; // listed invasive exotic: use existing stands, never plant
  general?: boolean; // window is a general guide, not from the beekeeper survey
  sources: Source[];
}

const SANBI_LIST: Source = { label: 'SANBI: Plants important to South African beekeepers', url: 'https://www.sanbi.org/wp-content/uploads/2018/04/plants-important-south-african-beekeepers-honey-bee-forage-updated-19-11.pdf' };
const SABIO_CITIZEN: Source = { label: 'SABIO, via The Citizen (2014)', url: 'https://www.citizen.co.za/northcliff-melville-times/news-headlines/2014/09/11/national-honeybee-foraging-week-to-kick-off-toward-sustainable-bee-keeping/' };
const NORTH = ['Gauteng', 'Limpopo', 'Mpumalanga', 'North West', 'Free State'];
const range = (a: number, b: number) => {
  const out: number[] = [];
  for (let m = a; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === b) break;
  }
  return out;
};

export const PLANTS: Plant[] = [
  {
    id: 'aloe-spotted', name: 'Spotted aloe', latin: 'Aloe greatheadii var. davyana', group: 'aloe', provinces: NORTH,
    months: range(5, 9), peak: range(6, 8), reward: 'both',
    engage: 'The key indigenous bee plant of the summer-rainfall north. Beekeepers move hives to "aloe fields" in winter for build-up, queen rearing and honey. The nectar is dilute (about 19 to 20% sugar) and bees cannot reach the nectar held in the swollen flower base.',
    note: 'Insects gave 36 to 51% fruit set against 55% with all pollinators, so honeybees matter to this aloe.',
    sources: [SANBI_LIST, { label: 'Human and Nicolson, University of Pretoria', url: 'https://repository.up.ac.za/handle/2263/26143' }, { label: 'Symes et al., University of Pretoria', url: 'https://repository.up.ac.za/handle/2263/11580' }],
  },
  {
    id: 'aloe-mountain', name: 'Mountain aloe', latin: 'Aloe marlothii', group: 'aloe', provinces: ['Limpopo', 'Mpumalanga', 'KwaZulu-Natal', 'North West', 'Gauteng'],
    months: range(5, 9), reward: 'nectar', birds: true,
    engage: 'Beekeepers use it for winter nectar, but birds are its main pollinators. Insects added only 3 to 4% of fruit set.',
    sources: [SANBI_LIST, { label: 'Symes et al., University of Pretoria', url: 'https://repository.up.ac.za/handle/2263/11580' }],
  },
  {
    id: 'aloe-red', name: 'Red aloe', latin: 'Aloe ferox', group: 'aloe', provinces: ['Western Cape', 'Eastern Cape'],
    months: range(6, 8), reward: 'nectar', birds: true,
    engage: 'Winter nectar for bees, but sunbirds dominate. One Eastern Cape stand fed 16 bird species, and the nectar is low in sugar.',
    sources: [SANBI_LIST, { label: 'Kuiper et al.', url: 'https://informahealthcare.com/doi/abs/10.1071/MU14054' }],
  },
  {
    id: 'sweet-thorn', name: 'Sweet thorn', latin: 'Vachellia karroo', group: 'tree', provinces: 'all',
    months: range(10, 1), peak: range(10, 1), reward: 'both',
    engage: 'Yellow pompom flowers rich in both nectar and pollen, giving a pleasant honey. It can flower several times in the rainy season; beekeepers also report it from September to March.',
    note: 'Can turn invasive on overgrazed land.',
    sources: [SANBI_LIST, { label: 'PlantZAfrica (SANBI)', url: 'https://pza.sanbi.org/node/9637' }],
  },
  {
    id: 'saligna', name: 'Saligna gum', latin: 'Eucalyptus grandis', group: 'tree', provinces: 'all', invasive: true,
    months: range(5, 7), monthsByProvince: { 'Eastern Cape': range(5, 7), Mpumalanga: range(2, 6), 'Western Cape': range(9, 5) }, reward: 'both',
    engage: 'Long-season forage, and a main pollen source in one Cape-bee study. Its flowering window varies a lot by province.',
    note: 'Listed invasive exotic: use existing stands, never plant it.',
    sources: [SANBI_LIST, { label: 'Rhodes University thesis', url: 'https://researchrepository.ru.ac.za/handle/20.500.14915/6656' }],
  },
  {
    id: 'ericas', name: 'Ericas and buchu', latin: 'Erica spp., Agathosma spp.', group: 'fynbos', provinces: ['Western Cape', 'Eastern Cape'],
    months: range(4, 10), reward: 'both',
    engage: 'Core winter-rainfall forage. At one Eastern Cape site Cape bees worked 54 plants and took about 60% of their pollen from fynbos, with nectar volume highest early in the morning.',
    sources: [SANBI_LIST, { label: 'Rhodes University thesis', url: 'https://researchrepository.ru.ac.za/handle/20.500.14915/6656' }],
  },
  {
    id: 'proteas', name: 'Proteas', latin: 'Protea spp.', group: 'fynbos', provinces: ['Western Cape', 'Eastern Cape'],
    months: range(5, 12), reward: 'both',
    engage: 'Part of the fynbos winter and spring flow in the Cape. Many proteas are also visited by sugarbirds and sunbirds.',
    sources: [SANBI_LIST],
  },
  {
    id: 'mesembs', name: 'Vygies (mesembs)', latin: 'Aizoaceae', group: 'fynbos', provinces: ['Western Cape', 'Eastern Cape', 'Northern Cape'],
    months: range(8, 2), reward: 'both',
    engage: 'Open, daisy-like flowers that many bees can work. They open in sun and close in dull weather.',
    sources: [SANBI_LIST],
  },
  {
    id: 'canola', name: 'Canola', latin: 'Brassica napus', group: 'crop', provinces: ['Western Cape'],
    months: range(6, 9), reward: 'both',
    engage: 'SABIO names canola a high-value crop forage. Many beekeepers depend on growers agreeing to hive placement.',
    note: 'Agree spray timing with the grower before you place hives.',
    sources: [SANBI_LIST, SABIO_CITIZEN, { label: 'SANBI honeybee brochure', url: 'https://www.sanbi.org/wp-content/uploads/2018/04/honbeybees-sa-brochure-28-may-eng-proof_0.pdf' }],
  },
  {
    id: 'lucerne', name: 'Lucerne', latin: 'Medicago sativa', group: 'crop', provinces: ['Northern Cape', 'Free State', 'Western Cape', 'Eastern Cape', 'North West'],
    months: range(9, 3), reward: 'both',
    engage: 'Named alongside canola as high-value crop forage.',
    note: 'Agree spray timing with the grower before you place hives.',
    sources: [SANBI_LIST, SABIO_CITIZEN],
  },
  {
    id: 'winter-weed', name: 'Winter weed', latin: 'Senecio apiifolius', group: 'weed', provinces: ['Gauteng', 'Free State', 'Mpumalanga', 'North West'],
    months: range(4, 8), reward: 'both',
    engage: 'An indigenous weed that supplies winter pollen and nectar inland.',
    sources: [SANBI_LIST],
  },
  {
    id: 'citrus', name: 'Citrus orchards', latin: 'Citrus spp.', group: 'crop', provinces: ['Limpopo', 'Mpumalanga', 'Eastern Cape', 'Western Cape', 'KwaZulu-Natal'],
    months: range(8, 10), reward: 'nectar', general: true,
    engage: 'Orchards give a short, strong spring nectar flow. Placement is usually agreed with the grower.',
    note: 'Window is a general guide: blossom timing varies by variety and area, so ask the grower.',
    sources: [SANBI_LIST],
  },
  {
    id: 'sunflower', name: 'Sunflower', latin: 'Helianthus annuus', group: 'crop', provinces: ['Free State', 'North West', 'Limpopo', 'Mpumalanga', 'Gauteng'],
    months: range(1, 3), reward: 'both', general: true,
    engage: 'Large summer crop fields with open heads that bees work for nectar and pollen.',
    note: 'Window is a general guide: it follows the planting date. Pollinating sunflowers coincided with higher colony losses in one South African survey, so watch colony health.',
    sources: [SANBI_LIST, { label: 'Pirk et al. 2014 colony loss survey', url: 'https://repository.up.ac.za/bitstream/handle/2263/42079/Pirk_Survey_2014.pdf?sequence=1' }],
  },
];

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function plantMonths(p: Plant, province?: string) {
  return (province && p.monthsByProvince?.[province]) || p.months;
}
export function plantsForProvince(province?: string) {
  return PLANTS.filter((p) => p.provinces === 'all' || !province || p.provinces.includes(province));
}
export const getPlant = (id: string) => PLANTS.find((p) => p.id === id);

export type Outlook = 'flow' | 'steady' | 'dearth' | 'pollen-gap';
/** What the next weeks look like from the plants tagged at an apiary (or the province's list). */
export function outlookFor(plants: Plant[], province: string | undefined, date = new Date(), weeks = 8) {
  const months = new Set<number>();
  for (let w = 0; w < weeks; w += 2) months.add(new Date(date.getTime() + w * 7 * 86400000).getMonth() + 1);
  const byMonth = [...months].map((m) => {
    const blooming = plants.filter((p) => plantMonths(p, province).includes(m));
    const nectar = blooming.filter((p) => p.reward !== 'pollen' && !p.birds).length + blooming.filter((p) => p.birds).length * 0.5;
    const pollen = blooming.filter((p) => p.reward !== 'nectar').length;
    let kind: Outlook = 'steady';
    if (nectar < 1) kind = 'dearth';
    else if (pollen === 0) kind = 'pollen-gap';
    else if (nectar >= 2) kind = 'flow';
    return { month: m, blooming, kind };
  });
  const now = byMonth[0];
  const ahead = byMonth.slice(1);
  const dearthAhead = ahead.some((x) => x.kind === 'dearth');
  const flowAhead = ahead.some((x) => x.kind === 'flow');
  return { byMonth, now, dearthAhead, flowAhead };
}

export const OUTLOOK_TEXT: Record<Outlook, string> = {
  flow: 'Flow: several nectar plants in bloom',
  steady: 'Steady: some forage in bloom',
  dearth: 'Dearth: little or no nectar in bloom',
  'pollen-gap': 'Pollen gap: nectar but little pollen',
};
