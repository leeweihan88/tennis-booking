// Elo-style skill rating on a 0–7 scale.
// A 1.0 rating gap means the stronger side is expected to win ~91% of the time.
export const MIN_RATING = 0;
export const MAX_RATING = 7;
const SCALE = 1.0;
const PROVISIONAL_MATCHES = 10;

export function expected(a, b) {
  return 1 / (1 + 10 ** ((b - a) / SCALE));
}

// Ratings move faster while a player is new.
export function kFactor(ratedMatches) {
  return ratedMatches < PROVISIONAL_MATCHES ? 0.3 : 0.15;
}

// team1/team2: arrays of { id, rating, rated_matches }. winner: 1 | 2.
// Returns [{ id, delta }]. Doubles use each team's average rating.
export function ratingDeltas(team1, team2, winner) {
  const avg = (t) => t.reduce((s, p) => s + p.rating, 0) / t.length;
  const e1 = expected(avg(team1), avg(team2));
  const s1 = winner === 1 ? 1 : 0;
  const delta = (p, score, exp) => ({ id: p.id, delta: round(kFactor(p.rated_matches) * (score - exp)) });
  return [
    ...team1.map((p) => delta(p, s1, e1)),
    ...team2.map((p) => delta(p, 1 - s1, 1 - e1)),
  ];
}

// Starting rating from the sign-up questionnaire: 4 answers, each 0–3 → 1.0–4.0.
export const QUESTIONS = [
  ['experience', 'How long have you played tennis?',
    ['Less than 1 year', '1–3 years', '3–6 years', 'More than 6 years']],
  ['rally', 'How are your rallies?',
    ['I can hit a few shots in a row', 'I can keep slow rallies going', 'Consistent rallies and I can aim', 'Consistent with pace and spin']],
  ['serve', 'How is your serve?',
    ['Still learning', 'I get it in, little pace', 'Reliable with some pace and placement', 'Strong, with variety']],
  ['matches', 'What match experience do you have?',
    ['None yet', 'Social games', 'Club or league matches', 'Tournaments']],
];

export function startingRating(answers) {
  const total = answers.reduce((s, a) => s + a, 0);
  return 1 + total * 0.25;
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
