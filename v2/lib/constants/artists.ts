// Artists shown during onboarding. Twelve portraits — a curated, opinionated
// mix of eras + languages so the tap pattern meaningfully discriminates.
// Keep `query` lowercase (matches D1 tasteVector key exactly).

export interface OnboardingArtist {
  query: string;
  name: string;
  era: string;
  tint: string;
  lang: 'hindi' | 'telugu' | 'both';
}

export const ONBOARDING_ARTISTS: OnboardingArtist[] = [
  { query: 'arijit singh',       name: 'Arijit Singh',       era: '2010s',       tint: '#F59E0B', lang: 'hindi' },
  { query: 'sid sriram',         name: 'Sid Sriram',         era: 'New wave',    tint: '#E11D74', lang: 'telugu' },
  { query: 'thaman s',           name: 'Thaman S',           era: 'Mass',        tint: '#4F39E8', lang: 'telugu' },
  { query: 'pritam',             name: 'Pritam',             era: 'Kingmaker',   tint: '#F43F9D', lang: 'hindi' },
  { query: 'a. r. rahman',       name: 'A. R. Rahman',       era: 'Master',      tint: '#8B5CF6', lang: 'both' },
  { query: 'devi sri prasad',    name: 'Devi Sri Prasad',    era: 'Hitmaker',    tint: '#FBBF24', lang: 'telugu' },
  { query: 'shreya ghoshal',     name: 'Shreya Ghoshal',     era: 'Voice',       tint: '#F472B6', lang: 'both' },
  { query: 'anirudh ravichander',name: 'Anirudh',            era: 'Crossover',   tint: '#4F39E8', lang: 'both' },
  { query: 'diljit dosanjh',     name: 'Diljit Dosanjh',     era: 'Punjabi pop', tint: '#F59E0B', lang: 'hindi' },
  { query: 'sanu',               name: 'Kumar Sanu',         era: '90s gold',    tint: '#C2410C', lang: 'hindi' },
  { query: 'ilaiyaraaja',        name: 'Ilaiyaraaja',        era: 'Legend',      tint: '#8B5CF6', lang: 'both' },
  { query: 'jubin nautiyal',     name: 'Jubin Nautiyal',     era: 'Contemporary',tint: '#E11D74', lang: 'hindi' },
];
