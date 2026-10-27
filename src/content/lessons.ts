// Honeyguide Academy: twelve short lessons from "should I?" to a working hive.
// Written in Honeyguide's own words. Each lesson must be reviewed by a named South African
// beekeeper before release; until then the app labels it "awaiting expert review".

export interface Question {
  q: string;
  options: string[];
  answer: number;
  why: string;
}
export interface Lesson {
  id: string;
  n: number;
  title: string;
  minutes: number;
  intro: string;
  points: string[];
  task?: { label: string; href: string };
  quiz: Question[];
  sources?: { label: string; url: string }[];
}

const SANBI_BEE = { label: 'SANBI: the Cape honeybee', url: 'https://www.sanbi.org/animal-of-the-week/cape-honeybee/' };
const UF_CAPE = { label: 'University of Florida: Cape honey bee', url: 'https://ask.ifas.ufl.edu/publication/IN916' };
const DOA = { label: 'Department of Agriculture honeybee brochure', url: 'https://old.dalrrd.gov.za/doaDev/sideMenu/plantHealth/docs/Honey%20Bee%20brochure.pdf' };
const PIRK = { label: 'Pirk et al. 2014, colony losses in South Africa', url: 'https://repository.up.ac.za/bitstream/handle/2263/42079/Pirk_Survey_2014.pdf?sequence=1' };
const ARC = { label: 'ARC-PPRI beekeeping research', url: 'https://www.arc.agric.za/arc-ppri/Pages/Insect%20Ecology/Beekeeping-Research-an-Development.aspx' };

export const LESSONS: Lesson[] = [
  {
    id: 'l1', n: 1, title: 'Is beekeeping for you?', minutes: 5,
    intro: 'Bees are rewarding, but they are livestock. Before you buy anything, be honest about time, cost, stings and the people around you.',
    points: [
      'Time: in the active season a colony needs a look every two to three weeks, plus time for harvest, repairs and record keeping.',
      'Cost: a hive, protective gear, a smoker and a hive tool come first. Get your own quotes; prices vary a lot.',
      'Stings happen, even in a good suit. Most cause pain and local swelling. If a sting has ever caused swelling of the face or throat, trouble breathing or dizziness, see a doctor before you keep bees.',
      'African bees, found across most of South Africa, defend their nest hard. Hives need to be well away from neighbours, paths, children and animals.',
      'You can start without owning a hive: join a club, help an experienced beekeeper for a season, and learn before you buy.',
    ],
    task: { label: 'Read the Safety page', href: '/safety' },
    quiz: [
      { q: 'A sting once made your throat swell. What should you do first?', options: ['Buy a thicker suit', 'See a doctor before working bees', 'Only work bees at night'], answer: 1, why: 'Throat swelling is a sign of a severe allergic reaction. Get medical advice before you risk another sting.' },
      { q: 'How often does a colony usually need checking in the active season?', options: ['Every day', 'Every two to three weeks', 'Once a year'], answer: 1, why: 'Regular but not constant checks. Opening a hive too often disturbs the colony.' },
      { q: 'What is the best low-cost first step?', options: ['Buy ten hives', 'Help an experienced beekeeper for a season', 'Catch a swarm alone'], answer: 1, why: 'Hands-on time with a mentor teaches more than anything you can buy.' },
    ],
  },
  {
    id: 'l2', n: 2, title: 'Meet South African bees', minutes: 6,
    intro: 'South Africa has two native honeybee subspecies, and keeping them apart is one of the most important rules in local beekeeping.',
    points: [
      'The Cape bee (Apis mellifera capensis) is native to the fynbos belt of the south-western and southern Cape.',
      'The African bee (Apis mellifera scutellata) lives across the rest of the country. It is defensive and swarms and absconds readily.',
      'Where the two ranges meet, a band of hybrid bees runs north of the fynbos belt.',
      'Cape bee workers can lay eggs that hatch into females. If Cape workers get into an African colony, they can take over its reproduction until the host colony dwindles and dies.',
      'This "capensis problem" spread after Cape colonies were moved north by people. Never move Cape bees or their used equipment into African-bee country.',
    ],
    task: { label: 'Set the bee type on your hives', href: '/apiaries' },
    quiz: [
      { q: 'Where is the Cape bee native?', options: ['Limpopo', 'The fynbos belt of the south-western and southern Cape', 'KwaZulu-Natal coast'], answer: 1, why: 'Cape bees belong to the fynbos region; African bees cover most of the rest of the country.' },
      { q: 'What makes Cape workers dangerous to African colonies?', options: ['They sting more', 'They can lay female eggs and take over reproduction', 'They steal all the pollen'], answer: 1, why: 'Cape workers can reproduce inside African colonies, which then dwindle.' },
      { q: 'How does the problem usually spread?', options: ['On the wind', 'People moving Cape bees and equipment north', 'Through flowers'], answer: 1, why: 'Moving colonies and used equipment is how it spreads, so it is up to beekeepers to stop it.' },
    ],
    sources: [SANBI_BEE, UF_CAPE, PIRK],
  },
  {
    id: 'l3', n: 3, title: 'The law', minutes: 5,
    intro: 'Beekeeping in South Africa is regulated under the Agricultural Pests Act. The rules protect everyone\'s bees from disease.',
    points: [
      'Anyone who keeps bees must register with the Department of Agriculture. You get a permanent registration number; the registration itself lasts 24 months and must be renewed, or you can be deregistered.',
      'Mark every hive clearly and legibly with your registration number. Honeyguide labels can carry it.',
      'Keep records of your apiaries and colonies. Your Honeyguide log is a good start.',
      'American foulbrood is a notifiable disease: if you suspect it, report it to your provincial Department of Agriculture.',
      'There are rules about moving bees, especially Cape bees. Check with your provincial office before you move colonies between regions.',
      'This lesson is general information, not legal advice. Confirm the current rules with the Department.',
    ],
    task: { label: 'Add your registration number', href: '/more' },
    quiz: [
      { q: 'What should go on every hive?', options: ['Your phone number', 'Your beekeeper registration number', 'The queen\'s age'], answer: 1, why: 'Hives are marked with the beekeeper\'s registration number.' },
      { q: 'You suspect American foulbrood. What now?', options: ['Move the hive away quietly', 'Report it to the provincial Department of Agriculture', 'Swap in frames from a healthy hive'], answer: 1, why: 'AFB is notifiable. Moving the hive or swapping frames spreads it.' },
      { q: 'How long does a beekeeper registration last before renewal?', options: ['One year', '24 months', 'For life'], answer: 1, why: 'Registration lasts 24 months. The registration number itself stays the same.' },
    ],
    sources: [
      { label: 'Control measures: registration of beekeepers (GN R.858 of 2013)', url: 'https://source.acts.co.za/agricultural-pests-act-1983/r858_2__registration_of_beekee.php' },
      { label: 'Control measures: marking of beehives', url: 'https://source.acts.co.za/agricultural-pests-act-1983/r858_3__marking_of_beehives.php' },
      DOA,
    ],
  },
  {
    id: 'l4', n: 4, title: 'Hives and kit', minutes: 5,
    intro: 'You need a hive, protection and a few tools. Buy good protection first.',
    points: [
      'Langstroth hives use removable rectangular frames in stacked boxes. They are the most common in commercial beekeeping and parts are easy to find.',
      'Top-bar hives (such as the Kenyan top-bar) use bars without frames in one long box. They are cheaper and can be made at home, but honey yields are usually lower.',
      'Protection: a veil, a full suit or jacket, gloves and boots. With African bees, a full suit is wise.',
      'A smoker calms bees by masking their alarm scent. Use dry, cool-burning fuel such as dry grass, pine needles or hessian.',
      'A hive tool pries apart boxes and frames that bees glue together with propolis.',
      'Keep hive parts standard, so boxes and frames fit each other.',
    ],
    quiz: [
      { q: 'What does smoke do?', options: ['Kills mites', 'Masks the bees\' alarm scent', 'Makes honey taste better'], answer: 1, why: 'Smoke interferes with the alarm pheromone, so fewer bees join a defence.' },
      { q: 'Which hive uses bars without frames?', options: ['Langstroth', 'Kenyan top-bar', 'Nucleus box'], answer: 1, why: 'Top-bar hives hang comb from bars, with no frames.' },
      { q: 'Why keep parts standard?', options: ['It looks neater', 'Boxes and frames fit each other', 'The law requires one brand'], answer: 1, why: 'Interchangeable parts make inspections, splits and harvests easier.' },
    ],
  },
  {
    id: 'l5', n: 5, title: 'Choosing a site', minutes: 5,
    intro: 'A good site keeps bees healthy and people safe.',
    points: [
      'Shelter from strong wind, and shade in the hottest part of the day.',
      'Water close by, so bees do not visit neighbours\' pools and taps.',
      'Distance from people, roads, paths and animals. African bees defend a wide area.',
      'Written or recorded permission from the landowner.',
      'Security against theft and honey badgers: hive stands, straps and discreet placement help.',
      'Forage within a few kilometres: tag what grows near each apiary in Honeyguide.',
    ],
    task: { label: 'Add an apiary with its forage', href: '/apiary/new' },
    quiz: [
      { q: 'Why give bees a water source?', options: ['Bees do not need water', 'So they don\'t use neighbours\' pools and taps', 'To drown pests'], answer: 1, why: 'Bees need water, especially in heat. A close source keeps them away from people.' },
      { q: 'What helps against honey badgers?', options: ['Bright paint', 'Hive stands and straps', 'Leaving the lid loose'], answer: 1, why: 'Honey badgers tip and open hives; raised, strapped hives are harder to raid.' },
      { q: 'What should you get before placing hives on someone\'s land?', options: ['Their permission', 'A fence', 'Nothing'], answer: 0, why: 'Always have the landowner\'s permission, and record it.' },
    ],
  },
  {
    id: 'l6', n: 6, title: 'Getting your first bees', minutes: 5,
    intro: 'You can catch a swarm or buy a colony. Where the bees come from matters.',
    points: [
      'Swarms are common in spring. An empty hive with old comb (a bait hive) often attracts one.',
      'Buy colonies or nucleus colonies from a registered, experienced beekeeper who can tell you their history.',
      'Ask about disease. Never accept bees or used equipment from a hive with foulbrood.',
      'In African-bee country, do not bring in Cape bees.',
      'Move a new colony at night, when the bees are home, and keep it shaded.',
    ],
    quiz: [
      { q: 'When are swarms most common?', options: ['Spring', 'Mid-winter', 'Never in South Africa'], answer: 0, why: 'Colonies build up and swarm in spring.' },
      { q: 'Who is the safest seller?', options: ['Anyone online', 'A registered, experienced beekeeper', 'Whoever is cheapest'], answer: 1, why: 'A known source can tell you the bees\' type and disease history.' },
      { q: 'When should you move a colony?', options: ['Midday', 'At night, with the bees home', 'In rain'], answer: 1, why: 'At night the foragers are home, so none are lost.' },
    ],
  },
  {
    id: 'l7', n: 7, title: 'Handling bees calmly', minutes: 5,
    intro: 'Calm, short, well-timed inspections keep bees settled and you safe.',
    points: [
      'Pick a warm, calm, dry day, around the middle of the day, when many foragers are out.',
      'Light the smoker well, puff gently at the entrance, wait a minute, then open slowly.',
      'Stand to the side, out of the flight path, and move slowly.',
      'Keep inspections short and purposeful: know what you want to check before you open.',
      'Repeated disturbance can make colonies abscond, so do not open hives more than you need to.',
      'If the bees build up and keep coming at you, close up and try another day.',
    ],
    quiz: [
      { q: 'Best time to open a hive?', options: ['Cold early morning', 'A warm, calm, dry day around midday', 'During a thunderstorm'], answer: 1, why: 'Many foragers are out and the colony is calmer.' },
      { q: 'Where should you stand?', options: ['In front of the entrance', 'To the side, out of the flight path', 'On the hive'], answer: 1, why: 'Blocking the flight path upsets returning foragers.' },
      { q: 'What can frequent opening lead to?', options: ['More honey', 'Absconding', 'Nothing'], answer: 1, why: 'Disturbance is one reason colonies abscond.' },
    ],
    sources: [PIRK],
  },
  {
    id: 'l8', n: 8, title: 'Your first inspection', minutes: 6,
    intro: 'Honeyguide\'s Inspect flow follows the order an experienced beekeeper thinks in.',
    points: [
      'Colony: how calm or defensive are they?',
      'Queen: you rarely need to see her. Eggs mean she was laying in the last three days.',
      'Brood: count frames with brood and look at the pattern. Solid is good; patchy can mean a problem.',
      'Stores and space: frames of honey and pollen, and whether they need more room.',
      'Pests and disease: beetles, wax moth, chalkbrood, and any sign of foulbrood.',
      'Actions and photos: what you did, and a photo of a brood frame to compare next time.',
    ],
    task: { label: 'Log an inspection', href: '/inspect' },
    quiz: [
      { q: 'You saw eggs but not the queen. What does that tell you?', options: ['The colony is queenless', 'A queen was laying in the last three days', 'Nothing'], answer: 1, why: 'Eggs hatch in about three days, so fresh eggs mean a laying queen.' },
      { q: 'A solid brood pattern usually means…', options: ['A healthy, laying queen', 'Disease', 'Too much honey'], answer: 0, why: 'Solid brood points to a good queen and a healthy colony.' },
      { q: 'Why photograph a brood frame?', options: ['For social media', 'To compare the colony over time', 'Bees like the flash'], answer: 1, why: 'Photos show how the colony is changing between inspections.' },
    ],
  },
  {
    id: 'l9', n: 9, title: 'The beekeeping year', minutes: 6,
    intro: 'Seasons are reversed from northern-hemisphere books, and South Africa\'s regions behave very differently.',
    points: [
      'Spring (September to November): build-up and swarm season. Give space and watch for swarm cells.',
      'Summer: the main flows in many areas. Keep supers on and water close.',
      'Autumn: check stores before winter and keep weaker colonies tight against beetles.',
      'Winter in the summer-rainfall north: aloes, especially spotted aloe, carry many colonies from about June to August.',
      'Winter in the Cape: fynbos (ericas, proteas, buchu) and canola provide forage.',
      'Open the Forage page to see the reported calendar for your province.',
    ],
    task: { label: 'Open the forage calendar', href: '/forage' },
    quiz: [
      { q: 'When is swarm season?', options: ['September to November', 'June to August', 'Only in summer'], answer: 0, why: 'Spring build-up brings swarming.' },
      { q: 'What carries many northern colonies in winter?', options: ['Canola', 'Aloes', 'Sunflowers'], answer: 1, why: 'Spotted aloe is a key winter plant in the summer-rainfall north.' },
      { q: 'Which forage matters in the Cape winter?', options: ['Fynbos', 'Mopane', 'Maize'], answer: 0, why: 'Ericas, proteas and buchu are core winter-rainfall forage.' },
    ],
  },
  {
    id: 'l10', n: 10, title: 'Pests and disease', minutes: 7,
    intro: 'Know what to look for, protect the colony, and report what must be reported. Honeyguide never gives chemical doses.',
    points: [
      'Small hive beetle: present across sub-Saharan Africa. It exploits weak colonies and the comb left behind after absconding.',
      'Wax moth: larvae tunnel through stored or abandoned comb. Strong colonies keep it out.',
      'Varroa: monitor and record. South African bees have so far coped without chemical treatment, according to University of Pretoria researchers.',
      'Chalkbrood: larvae turn chalky white. Log sightings.',
      'American foulbrood: sunken, discoloured cappings, coffee-coloured larvae and dark scales in cells. It is notifiable: report it, don\'t move the hive, and clean your tools.',
      'Capensis parasitism: Cape workers taking over African colonies. Prevent it by never moving Cape bees north.',
      'Also watch for ants, honey badgers and the bee pirate wasp.',
    ],
    task: { label: 'Try the Hive Doctor', href: '/play/doctor' },
    quiz: [
      { q: 'What do small hive beetles exploit?', options: ['Strong, busy colonies', 'Weak colonies and comb left after absconding', 'Only empty boxes in shops'], answer: 1, why: 'Beetles take over where bees can\'t defend the comb.' },
      { q: 'Which disease must be reported?', options: ['Chalkbrood', 'American foulbrood', 'Wax moth'], answer: 1, why: 'AFB is notifiable in South Africa.' },
      { q: 'Honeyguide\'s advice on chemical treatments is…', options: ['Use the strongest dose', 'Ask your extension officer or a vet', 'Mix your own'], answer: 1, why: 'The app identifies and refers. Treatment decisions need an expert.' },
    ],
    sources: [DOA, PIRK],
  },
  {
    id: 'l11', n: 11, title: 'Harvest and sell', minutes: 5,
    intro: 'Good honey starts in the hive and ends in a clean, labelled jar.',
    points: [
      'Take only capped honey: bees cap it once it is ripe and dry enough to keep.',
      'Always leave the colony enough stores, especially before a dearth or winter.',
      'Extract in a clean, bee-proof space with food-grade equipment and containers.',
      'Store honey sealed, cool and dry so it does not absorb water and ferment.',
      'If you sell honey, check the current South African food labelling and honey grading rules first.',
      'Log each harvest in Honeyguide; batch records come in a later update.',
    ],
    quiz: [
      { q: 'Which honey should you take?', options: ['Uncapped honey', 'Capped honey', 'Honey from brood frames'], answer: 1, why: 'Capped honey is ripe and dry enough to keep.' },
      { q: 'Why store honey sealed and dry?', options: ['So it does not absorb water and ferment', 'To keep it warm', 'It doesn\'t matter'], answer: 0, why: 'Honey draws moisture from the air, and wet honey can ferment.' },
      { q: 'Before selling, you should…', options: ['Check labelling and grading rules', 'Add sugar', 'Skip labels'], answer: 0, why: 'Food sold to the public must meet labelling and grading rules.' },
    ],
  },
  {
    id: 'l12', n: 12, title: 'Growing safely', minutes: 5,
    intro: 'Once your first colony thrives, grow slowly and keep good records.',
    points: [
      'Splits: divide a strong colony in spring to make a second one and reduce swarming.',
      'Swarm control: give space in time, and check for swarm cells during build-up.',
      'Records: your inspection log shows which colonies do well, and helps catch disease early.',
      'Join a club or association and keep a mentor; South Africa\'s beekeeping community is generous with help.',
      'Grow only as fast as your time, skills and forage allow.',
    ],
    task: { label: 'See your rank and quests', href: '/play' },
    quiz: [
      { q: 'What does a split do?', options: ['Makes a new colony and reduces swarming', 'Kills the queen', 'Doubles the honey at once'], answer: 0, why: 'Splitting a strong colony makes a second one and eases swarm pressure.' },
      { q: 'Why keep records?', options: ['They show which colonies do well and catch problems early', 'The bees read them', 'No reason'], answer: 0, why: 'Records turn guesses into decisions.' },
      { q: 'How fast should you grow?', options: ['As fast as possible', 'As your time, skills and forage allow', 'Ten hives a month'], answer: 1, why: 'Over-expanding leads to neglected colonies.' },
    ],
    sources: [ARC],
  },
];

export const getLesson = (id: string) => LESSONS.find((l) => l.id === id);
