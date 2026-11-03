// The prologue's script (docs/histoire-proposition.md §2; only the waking under the stake is validated, the lines are
// provisional): its beats in order, where each is played, what moves it on, the lines, and where things stand in the
// places it borrows. Hand-written, pure (tested); src/prologue.ts plays it in RoomScene.

export type Beat =
  | 'noir' // black, three captions
  | 'pieu' // lying under the stake, the rat on him; F pulls it
  | 'rat' // he follows the rat through the crypt, past the emptied sarcophagi
  | 'goule' // the ghoul turns from its meal: claws
  | 'rai' // the Dawn's ray across the crypt: the mist; then out up the stairs
  | 'necropole' // the grave field, the crossbowman on watch, back turned
  | 'poids' // his blood carried, heavy: the rat to the refuge's stairs
  | 'refuge' // dark, the basin dry, le Rongé a beast
  | 'cercueils' // the blood poured, le Rongé lucid: the chiefs' coffins
  | 'cercueil' // the rat gone: he lies in his coffin (F)
  | 'fin'; // the title, then the save begins
export const BEATS: readonly Beat[] = ['noir', 'pieu', 'rat', 'goule', 'rai', 'necropole', 'poids', 'refuge', 'cercueils', 'cercueil', 'fin'];

/** What happens, as the scene tells it. */
export type Event = 'captions' | 'stake' | 'ghoul' | 'ghoulDead' | 'out' | 'guardDead' | 'up' | 'poured' | 'coffins' | 'lay';
const NEXT: Partial<Record<Beat, [Event, Beat]>> = {
  noir: ['captions', 'pieu'], pieu: ['stake', 'rat'], rat: ['ghoul', 'goule'], goule: ['ghoulDead', 'rai'], rai: ['out', 'necropole'],
  necropole: ['guardDead', 'poids'], poids: ['up', 'refuge'], refuge: ['poured', 'cercueils'], cercueils: ['coffins', 'cercueil'], cercueil: ['lay', 'fin'],
};
/** The beat after `event` in `beat`: the next one when it is the event that moves it on, else the same. */
export const after = (beat: Beat, event: Event): Beat => (NEXT[beat]?.[0] === event ? NEXT[beat]![1] : beat);

/** Where a beat is played. */
export const place = (beat: Beat) => (BEATS.indexOf(beat) <= BEATS.indexOf('rai') ? 'hall' : BEATS.indexOf(beat) <= BEATS.indexOf('poids') ? 'necropolis' : 'refuge');

/** Dead during the prologue, he re-forms in the crypt's sarcophagus, no line said: standing, the stake already out;
 *  the ghoul still there if it was alive, else the ray to cross again (the necropolis is laid out afresh). */
export const reform = (beat: Beat): Beat => (BEATS.indexOf(beat) <= BEATS.indexOf('goule') ? 'rat' : 'rai');

/** Whether he may leave by exit `exit` (RoomScene.leave) in `beat`: the crypt's stairs once the ghoul is dead, the
 *  necropolis' way up to the refuge once the crossbowman is (his blood carried), never the refuge's stairs down. */
export const leaves = (beat: Beat, exit: number) => (beat === 'rai' && exit === -1) || (beat === 'poids' && exit === -1);

// The voice (`hud.title`) and the spoken lines (`hud.say`), as written in the proposal (provisional).
export const LINES = {
  noir: ['Les humains ont gagné.', 'Là-haut, le jour ne se couche plus.', "Toi, ils n'ont pas pris la peine de t'enfermer."],
  chalk: ['SANS MAISON.', 'PAS DE CIRE.'],
  stake: ['Le bois a pourri.', 'Combien d\'années ?'],
  seal: 'Eux, on les a emportés.',
  blood: 'Son sang est mort. Il en reste assez.',
  light: 'La lumière. Elle n\'a pas changé.',
  tomb: 'Le monde est devenu une tombe. Tant mieux : tu sais y vivre.',
  heavy: 'Ça pèse.',
  beast: 'Grrr... sang...',
  ronge: ['...Un autre.', 'Sans maison. Ça se sent.', 'Ici, c\'est chez moi. Verse, et c\'est chez nous.', 'Au fond, un cercueil. Il n\'est à personne.',
    'Quand tu tomberas en cendres, c\'est là que tu reviendras.', 'Tout le monde revient. Pas toujours entier.'],
  houses: ['Rat.', 'Brume.', 'Loup.', 'Chauve-souris.'],
  nobles: ['Les nobles du sang. Enchaînés sous la cathédrale.', 'Ils ne t\'ont jamais regardé.'],
  ratGone: 'Ce rat-là n\'est pas d\'ici.',
  title: 'DRACUL',
  skip: 'Échap encore : passer le prologue',
} as const;

/** How long a line stays up: long enough to read it twice. */
export const readMs = (text: string) => 1600 + 55 * text.length;

type P = { x: number; y: number };
/** The crypt (layout 'hall', src/crypt.data.ts), room px. His sarcophagus (the top-left one: BOXES [73, 220, 46, 14]):
 *  where he lies, where he stands up; the three others, emptied, their wax seals broken; the rat's way, stop by stop;
 *  the ghoul at its meal; the ray across the floor (y from, to; the mist's 43 px cross it); the rat's slit beside it. */
export const CRYPT = {
  lie: { x: 96, y: 224 }, rise: { x: 96, y: 246 },
  seals: [{ x: 392, y: 227 }, { x: 104, y: 377 }, { x: 380, y: 377 }] as P[],
  way: [{ x: 160, y: 262 }, { x: 368, y: 258 }, { x: 330, y: 352 }] as P[], // past the top-right sarcophagus, toward the ghoul
  hide: { x: 316, y: 404 }, // the slab the rat slips under
  ghoul: { x: 262, y: 420 }, meal: { x: 248, y: 428 },
  ray: [500, 526] as [number, number], slit: { x: 22, y: 488 }, beyond: { x: 22, y: 540 },
  stairs: { x: 240, y: 580 },
};
/** The necropolis, around its doors (where the redesign may move them): the crossbowman's post on the parvis in front
 *  of the refuge's stairs, his back to the field (his lantern at his feet, off his left so the way up stays dark); where
 *  the rat waits for him to be dead; two ghouls in the graves, off the way. Offsets from DOORS.refuge, DOORS.hall. */
export const NECROPOLIS = { guard: { dx: 4, dy: 76 }, lantern: { dx: -26, dy: 80 }, wait: { dx: 70, dy: 140 }, ghouls: [{ dx: -60, dy: -230 }, { dx: -380, dy: 20 }] }; // ~180 px off the rat's way
/** The refuge (src/refuge.data.ts): the four chiefs' shut coffins on their catafalques (the mockup's: rat, brume, loup,
 *  chauve-souris), floor points in front of each; his own coffin, open; the baked light turned down (its candles dead). */
export const REFUGE = {
  coffins: [{ x: 704, y: 320 }, { x: 704, y: 384 }, { x: 976, y: 320 }, { x: 976, y: 384 }] as P[],
  sign: { x: 704, y: 290 }, // the rat's sign, on its lid
  mine: { x: 838, y: 262 }, bed: { x: 838, y: 238 },
  torch: 0.12,
};
/** The blood the prologue's dead leave (T.blood.drops would give 1 and 2): the ghoul a little, the crossbowman a heavy
 *  bag (of the 400 bag: three quarters, he walks 13 % slower). Poured, le Rongé drinks it all: nothing banked. */
export const SPOILS = { ghoul: 40, crossbow: 300 };
