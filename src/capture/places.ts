// Where in Nigeria a customer means, from what they actually write: a state,
// its capital or a big city, a neighbourhood, or the short forms people use
// ("PH", "Abj", "Lag", "Ib", "KD"). Rules, not the model, decide the state.

export const STATES = [
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'FCT',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nasarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const
export type State = (typeof STATES)[number]

// Names people use for places in each state, besides the state's own name.
// Capitals and large towns, well-known neighbourhoods of the biggest cities,
// and common short forms. Names that are also everyday words or common names
// are left out ("GRA", "Ado", "Owo" for money, "Saki" for tripe, "Ojo").
const PLACES: Record<State, string[]> = {
  Abia: ['Abia state', 'Umuahia', 'Aba', 'Ohafia', 'Arochukwu'],
  Adamawa: ['Yola', 'Mubi', 'Jimeta'],
  'Akwa Ibom': ['Akwa Ibom', 'AKS', 'Uyo', 'Eket', 'Ikot Ekpene', 'Oron'],
  Anambra: ['Awka', 'Onitsha', 'Nnewi', 'Ekwulobia', 'Ihiala', 'Obosi'],
  Bauchi: ['Azare', 'Misau'],
  Bayelsa: ['Yenagoa', 'Sagbama'],
  Benue: ['Makurdi', 'Gboko', 'Otukpo'],
  Borno: ['Maiduguri', 'Biu', 'Bama'],
  'Cross River': ['Cross River', 'Calabar', 'Ikom', 'Ogoja', 'Obudu'],
  Delta: [
    'Delta state',
    'Asaba',
    'Warri',
    'Sapele',
    'Ughelli',
    'Agbor',
    'Effurun',
    'Abraka',
  ],
  Ebonyi: ['Abakaliki', 'Afikpo'],
  Edo: ['Edo state', 'Benin', 'Benin City', 'Auchi', 'Ekpoma', 'Uromi'],
  Ekiti: ['Ado Ekiti', 'Ikere', 'Ikole', 'Ijero'],
  Enugu: ['Nsukka', 'Coal City', 'Agbani', 'Awgu', 'Independence Layout'],
  FCT: [
    'Abuja',
    'Abj',
    'Buj',
    'The Buj',
    'Federal Capital Territory',
    'Wuse',
    'Garki',
    'Maitama',
    'Asokoro',
    'Gwarinpa',
    'Gwagwalada',
    'Kubwa',
    'Jabi',
    'Utako',
    'Lugbe',
    'Nyanya',
    'Life Camp',
    'Apo',
    'Katampe',
    'Lokogoma',
    'Durumi',
    'Dutse Alhaji',
    'Bwari',
    'Kuje',
    'Gudu',
    'Kado',
    'Wuye',
  ],
  Gombe: ['Gombe state', 'Kumo', 'Billiri'],
  Imo: ['Imo state', 'Owerri', 'Orlu', 'Okigwe', 'Mbaise'],
  Jigawa: ['Dutse', 'Hadejia', 'Kazaure'],
  Kaduna: ['KD', 'Zaria', 'Kafanchan', 'Barnawa', 'Kakuri'],
  Kano: ['Kano city', 'Sabon Gari Kano', 'Nassarawa GRA'],
  Katsina: ['Katsina state', 'Funtua', 'Daura'],
  Kebbi: ['Birnin Kebbi', 'Argungu', 'Yauri'],
  Kogi: ['Lokoja', 'Okene', 'Anyigba', 'Idah', 'Kabba'],
  Kwara: ['Ilorin', 'Offa', 'Omu Aran'],
  Lagos: [
    'Lag',
    'Lasgidi',
    'Eko',
    'Lagos state',
    'Ikeja',
    'Yaba',
    'Surulere',
    'Lekki',
    'Ajah',
    'Victoria Island',
    'VI',
    'Ikoyi',
    'Ikorodu',
    'Epe',
    'Badagry',
    'Festac',
    'Apapa',
    'Mushin',
    'Oshodi',
    'Isolo',
    'Agege',
    'Ogba',
    'Ojodu',
    'Berger',
    'Ketu',
    'Ojota',
    'Maryland',
    'Gbagada',
    'Magodo',
    'Alimosho',
    'Egbeda',
    'Ikotun',
    'Igando',
    'Idimu',
    'Ipaja',
    'Ayobo',
    'Iyana Ipaja',

    'Satellite Town',
    'Amuwo Odofin',
    'Mile 2',
    'Ebute Metta',
    'Obalende',
    'Sangotedo',
    'Chevron',
    'Ikota',
    'Osapa',
    'Agungi',
    'Jakande',
    'Ilupeju',

    'Palmgrove',
    'Ogudu',
    'Ojuelegba',
    'Itire',
    'Akoka',
    'Bariga',
    'Shomolu',
    'Somolu',
    'Ketu',
    'Mile 12',
    'Ikosi',
    'Isheri',
    'Opebi',
    'Allen',
    'Oregun',
    'Alausa',
    'Ijora',
    'Orile',
    'Ajegunle',
    'Abule Egba',
    'Ijaiye',
    'Iju',
  ],
  Nasarawa: ['Lafia', 'Keffi', 'Karu', 'Masaka', 'Mararaba', 'Akwanga'],
  Niger: ['Niger state', 'Minna', 'Bida', 'Suleja', 'Kontagora'],
  Ogun: [
    'Ogun state',
    'Abeokuta',
    'Abk',
    'Ota',
    'Sango Ota',
    'Sango',
    'Mowe',
    'Ibafo',
    'Arepo',
    'Magboro',
    'Ifo',
    'Agbara',
    'Ijebu Ode',
    'Ijebu',
    'Sagamu',
    'Shagamu',
    'Shaggy',
    'Ilaro',
    'Owode',
    'Ogere',
    'Akute',
    'Ojodu Abiodun',
    'Isheri Olofin',
  ],
  Ondo: ['Ondo state', 'Akure', 'Ondo town', 'Ikare', 'Okitipupa'],
  Osun: ['Osogbo', 'Oshogbo', 'Ile Ife', 'Ife', 'Ilesa', 'Ilesha', 'Iwo'],
  Oyo: [
    'Ibadan',
    'Ib',
    'Ibd',
    'Ogbomoso',
    'Oyo town',
    'Iseyin',

    'Bodija',
    'Dugbe',

    'Mokola',
    'Akobo',
    'Ojoo',
    'Iwo Road',
    'Samonda',
    'Agodi',
    'Oluyole',
  ],
  Plateau: ['Jos', 'Bukuru', 'Pankshin'],
  Rivers: [
    'Rivers state',
    'Port Harcourt',
    'PH',
    'PHC',
    'Port Harcout',
    'Portharcourt',
    'Obio Akpor',
    'Rumuokoro',
    'Rumuola',
    'Rumuigbo',
    'Rumuodara',
    'Trans Amadi',
    'Choba',
    'Eleme',
    'Woji',
    'Ada George',
    'Diobu',

    'Okrika',
    'Oyigbo',
    'Elelenwo',
    'Rumuomasi',
  ],
  Sokoto: ['Sokoto state', 'Tambuwal'],
  Taraba: ['Jalingo', 'Wukari'],
  Yobe: ['Damaturu', 'Potiskum', 'Gashua'],
  Zamfara: ['Gusau', 'Kaura Namoda'],
}

// Dots and hyphens vary ("P.H.", "Ile-Ife", "Sango-Ota"); compare without them.
function normal(text: string): string {
  return text.toLowerCase().replace(/\./g, '').replace(/[-_/]/g, ' ')
}

type Alias = { state: State; words: string }

// Every name, longest first, so "Sango Ota" wins over "Ota" and "Benin City"
// over "Benin" where both match at the same spot.
const ALIASES: Alias[] = STATES.flatMap((state) =>
  [state, ...PLACES[state]].map((w) => ({ state, words: normal(w) })),
).sort((a, b) => b.words.length - a.words.length)

const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A name followed by a street word is a street, not a place: "Aminu Kano
// Crescent" is in Abuja and "Enugu Road" can be anywhere.
const STREET =
  '(?!\\s+(?:street|str|st|road|rd|crescent|cres|close|avenue|ave|way|drive|dr|lane|ln)\\b)'
const pattern = (words: string) =>
  new RegExp(`(^|[^a-z0-9])${escape(words)}${STREET}(?=$|[^a-z0-9])`)
const has = (words: string, text: string) => pattern(words).test(text)

export type Place = { state: State; said: string }

// The state a piece of text points to, and the words that showed it. Whole
// words only: "Ogunlana Drive" is not Ogun, and "phone" is not PH.
export function placeIn(text: string): Place | null {
  const t = normal(text)
  if (!t.trim()) return null
  // The place named first wins ("Mowe, after Berger" is Mowe).
  let best: { alias: Alias; at: number } | null = null
  for (const alias of ALIASES) {
    const m = pattern(alias.words).exec(t)
    if (!m) continue
    const at = m.index + m[1]!.length
    if (!best || at < best.at) best = { alias, at }
  }
  return best ? { state: best.alias.state, said: best.alias.words } : null
}

// The state a vendor or customer named, if any ("Port Harcourt" → Rivers).
export function stateOf(text: string): State | null {
  return placeIn(text)?.state ?? null
}

export function sameState(a: string, b: string): boolean {
  const x = stateOf(a)
  return x !== null && x === stateOf(b)
}

// Whether the chat itself names a place in this state, so a state the model
// only imagined is not acted on.
export function chatNames(state: State, chat: string): boolean {
  const t = normal(chat)
  return ALIASES.some((a) => a.state === state && has(a.words, t))
}
