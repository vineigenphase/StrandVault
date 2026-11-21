// Mock data for parallel development (TASKS.md T0). Use this until the real
// catalogue / API lands. Posters are inline SVG data URLs so mocks never touch
// the network (CLAUDE.md §1.3).
import type {
  Aisle, Film, Friend, Look, Provider, ProviderId, RecItem, RicoRes, StaffPick,
} from './types';

const AISLE_HEX: Record<Aisle, string> = {
  action: '#FF8A3D', comedy: '#FFD300', horror: '#FF3B3B', scifi: '#00E5FF',
  drama: '#B388FF', romance: '#FF2E88', animated: '#1DE9B6', cult: '#C6FF00',
};

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');

/** 2:3 placeholder case art in the aisle colour. */
export function mockPoster(title: string, aisle: Aisle): string {
  const c = AISLE_HEX[aisle];
  const words = title.toUpperCase().split(' ');
  const lines: string[] = [];
  for (const w of words) {
    const last = lines[lines.length - 1];
    if (last && (last + ' ' + w).length <= 10) lines[lines.length - 1] = last + ' ' + w;
    else lines.push(w);
  }
  const text = lines
    .slice(0, 4)
    .map((l, i) => `<text x='100' y='${150 + i * 26}' text-anchor='middle'>${esc(l)}</text>`)
    .join('');
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 300'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'>` +
    `<stop offset='0' stop-color='#2A0B45'/><stop offset='1' stop-color='#0B0620'/></linearGradient></defs>` +
    `<rect width='200' height='300' fill='url(#g)'/>` +
    `<rect x='8' y='8' width='184' height='284' fill='none' stroke='${c}' stroke-width='4'/>` +
    `<circle cx='100' cy='70' r='34' fill='none' stroke='${c}' stroke-width='3'/>` +
    `<g fill='${c}' font-family='monospace' font-weight='bold' font-size='22'>${text}</g>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PROVIDER_NAMES: Record<ProviderId, string> = {
  netflix: 'Netflix', prime: 'Prime Video', disney: 'Disney+', apple: 'Apple TV',
  now: 'NOW', iplayer: 'BBC iPlayer', channel4: 'Channel 4', paramount: 'Paramount+', other: 'Other',
};

/** Shorthand: 'netflix' → stream, 'apple:rent' → rent. url left empty so watchUrl() falls back to search. */
const prov = (...specs: string[]): Provider[] =>
  specs.map((s) => {
    const [id, kind = 'stream'] = s.split(':') as [ProviderId, Provider['kind']?];
    return { id, name: PROVIDER_NAMES[id], url: '', kind: kind ?? 'stream' };
  });

type Row = [
  id: number, title: string, year: number, runtime: number, aisle: Aisle, genres: number[],
  rating: number, votes: number, trending: boolean, director: string, cast: string[],
  providers: Provider[], tagline: string, overview: string,
];

const ROWS: Row[] = [
  // action
  [76341, 'Mad Max: Fury Road', 2015, 120, 'action', [28, 12, 878], 7.6, 22000, false, 'George Miller',
    ['Tom Hardy', 'Charlize Theron', 'Nicholas Hoult'], prov('netflix', 'apple:rent'),
    'What a lovely day.', 'In a post-apocalyptic wasteland, a drifter and a rebel warrior flee a tyrant across the desert in a war rig.'],
  [245891, 'John Wick', 2014, 101, 'action', [28, 53], 7.4, 19000, false, 'Chad Stahelski',
    ['Keanu Reeves', 'Michael Nyqvist', 'Alfie Allen'], prov('prime', 'apple:rent'),
    "Don't set him off.", 'An ex-hitman comes out of retirement to track down the gangsters who took everything from him.'],
  [361743, 'Top Gun: Maverick', 2022, 131, 'action', [28, 18], 8.2, 9000, true, 'Joseph Kosinski',
    ['Tom Cruise', 'Miles Teller', 'Jennifer Connelly'], prov('paramount', 'prime:rent'),
    'Feel the need... the need for speed.', 'After thirty years, Maverick is still pushing the envelope as a top naval aviator, training a new squad.'],
  // comedy
  [8363, 'Superbad', 2007, 113, 'comedy', [35], 7.2, 7500, false, 'Greg Mottola',
    ['Jonah Hill', 'Michael Cera', 'Christopher Mintz-Plasse'], prov('netflix'),
    'Come and get some.', 'Two co-dependent high school seniors try to score alcohol for a party before graduation splits them up.'],
  [137, 'Groundhog Day', 1993, 101, 'comedy', [35, 14, 10749], 7.6, 7000, false, 'Harold Ramis',
    ['Bill Murray', 'Andie MacDowell', 'Chris Elliott'], prov('now', 'apple:rent'),
    "He's having the worst day of his life... over and over.", 'A cynical weatherman finds himself living the same day again and again.'],
  [346648, 'Paddington 2', 2017, 103, 'comedy', [35, 10751, 12], 7.6, 2800, true, 'Paul King',
    ['Ben Whishaw', 'Hugh Grant', 'Sally Hawkins'], prov('iplayer', 'netflix'),
    'A little bear goes a long way.', "Paddington takes odd jobs to buy a gift for Aunt Lucy, until it's stolen and he's framed."],
  // horror
  [419430, 'Get Out', 2017, 104, 'horror', [27, 9648, 53], 7.6, 16000, false, 'Jordan Peele',
    ['Daniel Kaluuya', 'Allison Williams', 'Bradley Whitford'], prov('netflix', 'apple:rent'),
    'Just because you are invited, does not mean you are welcome.', "A young man visits his girlfriend's family estate and uncovers a disturbing secret."],
  [493922, 'Hereditary', 2018, 127, 'horror', [27, 9648], 7.3, 8000, false, 'Ari Aster',
    ['Toni Collette', 'Alex Wolff', 'Milly Shapiro'], prov('prime', 'channel4'),
    'Every family tree hides a secret.', 'After their grandmother dies, a family begins to unravel cryptic and terrifying secrets.'],
  [242224, 'The Babadook', 2014, 94, 'horror', [27, 18], 6.5, 4500, false, 'Jennifer Kent',
    ['Essie Davis', 'Noah Wiseman', 'Hayley McElhinney'], prov('channel4'),
    "If it's in a word or it's in a look, you can't get rid of the Babadook.", 'A widowed mother and her son are haunted by a sinister presence from a pop-up book.'],
  // scifi
  [27205, 'Inception', 2010, 148, 'scifi', [28, 878, 12], 8.4, 36000, false, 'Christopher Nolan',
    ['Leonardo DiCaprio', 'Joseph Gordon-Levitt', 'Elliot Page'], prov('netflix', 'prime:rent'),
    'Your mind is the scene of the crime.', 'A thief who steals secrets through dream-sharing is offered a chance to plant an idea instead.'],
  [157336, 'Interstellar', 2014, 169, 'scifi', [12, 18, 878], 8.4, 34000, true, 'Christopher Nolan',
    ['Matthew McConaughey', 'Anne Hathaway', 'Jessica Chastain'], prov('prime', 'apple:rent'),
    'Mankind was born on Earth. It was never meant to die here.', 'Explorers travel through a wormhole in search of a new home for humanity.'],
  [329865, 'Arrival', 2016, 116, 'scifi', [18, 878, 9648], 7.6, 18000, false, 'Denis Villeneuve',
    ['Amy Adams', 'Jeremy Renner', 'Forest Whitaker'], prov('netflix'),
    'Why are they here?', 'A linguist is recruited to communicate with mysterious alien visitors.'],
  // drama
  [496243, 'Parasite', 2019, 133, 'drama', [35, 53, 18], 8.5, 18000, false, 'Bong Joon-ho',
    ['Song Kang-ho', 'Lee Sun-kyun', 'Cho Yeo-jeong'], prov('prime', 'apple:rent'),
    'Act like you own the place.', 'A poor family schemes its way into the lives of a wealthy household.'],
  [244786, 'Whiplash', 2014, 107, 'drama', [18, 10402], 8.4, 15000, false, 'Damien Chazelle',
    ['Miles Teller', 'J.K. Simmons', 'Melissa Benoist'], prov('netflix'),
    'The road to greatness can take you to the edge.', 'A young drummer enrols at a cut-throat conservatory under a ruthless instructor.'],
  [278, 'The Shawshank Redemption', 1994, 142, 'drama', [18, 80], 8.7, 27000, false, 'Frank Darabont',
    ['Tim Robbins', 'Morgan Freeman', 'Bob Gunton'], prov('netflix', 'apple:buy'),
    'Fear can hold you prisoner. Hope can set you free.', 'Two imprisoned men bond over years, finding solace and redemption.'],
  // romance
  [313369, 'La La Land', 2016, 128, 'romance', [35, 18, 10749, 10402], 7.9, 17000, false, 'Damien Chazelle',
    ['Ryan Gosling', 'Emma Stone', 'John Legend'], prov('prime', 'apple:rent'),
    "Here's to the fools who dream.", 'A jazz pianist and an aspiring actress fall in love in Los Angeles.'],
  [76, 'Before Sunrise', 1995, 101, 'romance', [18, 10749], 7.7, 3500, false, 'Richard Linklater',
    ['Ethan Hawke', 'Julie Delpy', 'Andrea Eckert'], prov('apple:rent'),
    'Can the greatest romance of your life last only one night?', 'Two strangers meet on a train and spend one night walking through Vienna.'],
  [4348, 'Pride & Prejudice', 2005, 129, 'romance', [18, 10749], 7.9, 7500, false, 'Joe Wright',
    ['Keira Knightley', 'Matthew Macfadyen', 'Brenda Blethyn'], prov('netflix', 'now'),
    'Sometimes the last person on earth you want to be with is the one person you can’t be without.', 'Sparks fly when spirited Elizabeth Bennet meets the proud Mr Darcy.'],
  // animated
  [129, 'Spirited Away', 2001, 125, 'animated', [16, 10751, 14], 8.5, 16000, false, 'Hayao Miyazaki',
    ['Rumi Hiiragi', 'Miyu Irino', 'Mari Natsuki'], prov('netflix'),
    'The tunnel led Chihiro to a mysterious town...', 'A girl wanders into a world of spirits and must free her parents.'],
  [862, 'Toy Story', 1995, 81, 'animated', [16, 12, 10751, 35], 8.0, 18000, false, 'John Lasseter',
    ['Tom Hanks', 'Tim Allen', 'Don Rickles'], prov('disney'),
    'The adventure takes off!', "A cowboy doll feels threatened when a new space ranger toy becomes the favourite."],
  [324857, 'Spider-Man: Into the Spider-Verse', 2018, 117, 'animated', [16, 28, 12, 878], 8.4, 15000, true, 'Peter Ramsey',
    ['Shameik Moore', 'Jake Johnson', 'Hailee Steinfeld'], prov('netflix', 'disney'),
    'More than one wears the mask.', 'Teen Miles Morales becomes Spider-Man and meets heroes from other dimensions.'],
  // cult ('80s)
  [78, 'Blade Runner', 1982, 117, 'cult', [878, 18, 53], 7.9, 13000, false, 'Ridley Scott',
    ['Harrison Ford', 'Rutger Hauer', 'Sean Young'], prov('prime', 'apple:rent'),
    'Man has made his match... now it’s his problem.', 'A blade runner must pursue and terminate four replicants in Los Angeles, 2019.'],
  [105, 'Back to the Future', 1985, 116, 'cult', [12, 35, 878], 8.3, 19000, true, 'Robert Zemeckis',
    ['Michael J. Fox', 'Christopher Lloyd', 'Lea Thompson'], prov('netflix', 'now'),
    "He's the only kid ever to get into trouble before he was born.", 'A teenager is accidentally sent thirty years into the past in a time-travelling DeLorean.'],
  [2493, 'The Princess Bride', 1987, 98, 'cult', [12, 10751, 14, 35, 10749], 7.7, 5000, false, 'Rob Reiner',
    ['Cary Elwes', 'Robin Wright', 'Mandy Patinkin'], prov('disney'),
    'Heroes. Giants. Villains. Wizards. True Love.', 'A farmhand turned pirate sets out to rescue his true love from a villainous prince.'],
];

export const mockFilms: Film[] = ROWS.map(
  ([id, title, year, runtime, aisle, genres, rating, votes, trending, director, cast, providers, tagline, overview]) => ({
    id, title, year, runtime, overview, tagline,
    poster: mockPoster(title, aisle), genres, aisle, rating, votes, trending,
    cast, director, providers,
  }),
);

export const mockLook: Look = { jacket: '#FF2E88', hair: 'mullet', hairColor: '#3B1F0E', skin: '#E0AC69', shades: true };

export const mockFriends: Friend[] = [
  { userId: '00000000-0000-4000-8000-000000000001', name: 'MAYA', isDemo: true, favId: 27205,
    look: { jacket: '#00E5FF', hair: 'long', hairColor: '#1A1A1A', skin: '#8D5524', shades: false },
    favourites: [27205, 329865, 313369, 129] },
  { userId: '00000000-0000-4000-8000-000000000002', name: 'DEV', isDemo: true, favId: 105,
    look: { jacket: '#FFD300', hair: 'buzz', hairColor: '#2B1B0E', skin: '#C68642', shades: true },
    favourites: [105, 78, 245891, 27205] },
  { userId: '00000000-0000-4000-8000-000000000003', name: 'PRIYA', isDemo: true, favId: 419430,
    look: { jacket: '#B388FF', hair: 'curls', hairColor: '#120A05', skin: '#A86B3C', shades: false },
    favourites: [419430, 493922, 496243] },
  { userId: '00000000-0000-4000-8000-000000000004', name: 'SAM', isDemo: true, favId: 346648,
    look: { jacket: '#1DE9B6', hair: 'flat', hairColor: '#D9A441', skin: '#F1C27D', shades: false },
    favourites: [346648, 137, 862, 27205] },
];

export const mockStaffPicks: StaffPick[] = (() => {
  const m = new Map<number, string[]>();
  for (const f of mockFriends) for (const id of f.favourites) m.set(id, [...(m.get(id) ?? []), f.userId]);
  return [...m.entries()]
    .map(([filmId, userIds]) => ({ filmId, userIds }))
    .sort((a, b) => b.userIds.length - a.userIds.length);
})();

export const mockRecs: RecItem[] = [
  { filmId: 27205, score: 9.1, reason: 'MAYA + 2 OTHERS LOVE THIS', friends: ['MAYA', 'DEV', 'SAM'] },
  { filmId: 105, score: 7.4, reason: "DEV'S #1 PICK", friends: ['DEV'] },
  { filmId: 419430, score: 6.8, reason: "PRIYA'S #1 PICK", friends: ['PRIYA'] },
  { filmId: 329865, score: 5.2, reason: 'MAYA LOVES THIS', friends: ['MAYA'] },
  { filmId: 157336, score: 4.9, reason: 'TRENDING THIS WEEK', friends: [] },
  { filmId: 324857, score: 4.6, reason: 'TRENDING THIS WEEK', friends: [] },
  { filmId: 496243, score: 4.4, reason: "CRITICS' CHOICE", friends: ['PRIYA'] },
  { filmId: 76341, score: 3.9, reason: 'BECAUSE YOU LIKE ACTION', friends: [] },
];

export const mockRicoPick: RicoRes = {
  filmId: 105,
  line: "Back to the Future. Trust me, kid, this one's got legs. Eighty-eight miles an hour of legs.",
  reason: "DEV'S #1 PICK",
  backups: [78, 27205, 2493],
  fallback: true,
};
