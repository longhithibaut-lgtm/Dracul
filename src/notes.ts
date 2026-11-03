// Les notes (docs/histoire-proposition.md §3): words left in the world, a paper, a carving, a chalk line, a ledger page,
// read with F where they lie and kept for good in le journal (save.ts `notes`: words, not loot, never lost at death),
// reread with N or at the refuge's lectern. Texts and places are provisional (docs/decisions.md): none tells what the
// user has not validated. Pure data and rules; journal.ts draws them.
import type { Place } from './world.ts';
import * as Nec from './necropolis.data.ts';

/** A note: its title, what it is written on (`on`), its text (paragraphs), where it lies (a floor point of `place`, the
 *  hero reads it from there); `baked`: drawn in the place's art (the catacombs' vignettes), else journal.ts draws a
 *  paper for `paper` ones; `when`: only once Vesna is freed; `spot`: the necropolis' note spot it lies on, once its plan
 *  has them (necropolis.data.ts NOTES, by its vignettes), else at x, y. */
export type Note = { id: string; title: string; on: string; text: string[]; place: Place; x: number; y: number; paper?: boolean; baked?: boolean; when?: 'vesna'; spot?: string };

export const NOTES: Note[] = [
  // ---- la nécropole: on its plan's note spots by its vignettes when it has them (`spot`), else where x, y say ----
  { id: 'marche', title: 'La première marche', on: 'gravé dans la pierre, sous des griffures', text: ['NE DESCENDS PAS LES MAINS VIDES.'], place: 'necropolis', x: 262, y: 122 },
  { id: 'ordonnance', title: 'Ordonnance arrachée', on: 'tombée d\u2019un poteau, piétinée, la cire du sceau cassée', paper: true,
    text: ['Les sans-maison ne se scellent pas.', 'Un pieu, de la chaux, la fosse.', 'Ne pas gaspiller la cire.'], place: 'necropolis', x: 300, y: 200, spot: 'parvis' },
  { id: 'dessin', title: "Un dessin d'enfant", on: 'sous une croûte de pain, parmi les offrandes d\u2019un sanctuaire abandonné', paper: true,
    text: ['« Maman dit que la nuit c’était noir. Je l’ai dessinée. »', 'La feuille est toute noire, frottée au charbon.'], place: 'necropolis', x: 590, y: 1020, spot: 'sanctuaire' },
  { id: 'peage', title: 'Le péage du pont', on: 'au bout du pont', text: ['PÉAGE : UNE DENT.', 'Des dizaines de crocs sont plantés dans le bois du garde-corps.'], place: 'necropolis', x: 1300, y: 1166, spot: 'peage' },
  { id: 'ensemble', title: 'Gravé à la galerie', on: 'à la bouche de la galerie', text: ['ON SE CACHE ENSEMBLE.'], place: 'necropolis', x: 3276, y: 130 },
  { id: 'registre', title: 'Registre de la fosse, folio 3', on: 'une page arrachée, au camp de l’Ordre', paper: true,
    text: ['Reçus ce jour : onze. Un pieu chacun, de la chaux.', 'Rendus à la fosse : onze.', 'Le frère portier demande des pieux neufs. Réponse : reprendre les anciens.'], place: 'necropolis', x: 3200, y: 1000, spot: 'camp' },
  // ---- the interiors ----
  { id: 'cire', title: 'La craie d’un autre sarcophage', on: 'sur un autre couvercle de la crypte que le tien', text: ['SANS MAISON. PAS DE CIRE.'], place: 'hall', x: 412, y: 380 },
  { id: 'releve', title: 'Carnet de relève', on: 'oublié sur une marche de la nef', paper: true,
    text: ['Relève de la nef. Deux frères, une lanterne, un chien.', 'On ne s’assied pas. On n’éteint pas.', 'Frère Anselme s’est assis.'], place: 'nave', x: 150, y: 420 },
  { id: 'tri', title: 'La craie de l\u2019ossuaire', on: 'sur un pilier, à hauteur d’homme', text: ['CROCS À GAUCHE.', 'LE RESTE À DROITE.'], place: 'ossuary', x: 284, y: 412 },
  // ---- les catacombes (their vignettes, baked: tools/art/rooms/catacombs.mjs) ----
  { id: 'seau', title: 'Carnet du frère au seau', on: 'sur le mort au fond du puits, à côté de son seau', baked: true,
    text: ['Troisième nuit à descendre le seau.', 'Elle chante, en bas. Le Prieur dit que c’est l’écho.', 'Je ne descends plus jusqu’au fond.'], place: 'catacombs', x: 2600, y: 254 },
  { id: 'lent', title: 'Un billet de V.', on: 'serré dans la patte d’un rat mort, au pied des flèches d’os', baked: true,
    text: ['T’es lent, gamin. Plus bas.', '— V.'], place: 'catacombs', x: 230, y: 334 },
  { id: 'cordons', title: 'Un autre billet de V.', on: 'sur le petit autel des rats, parmi les dents et les boutons', baked: true,
    text: ['La grosse au plafond, coupe-lui les cordons. Elle les aime.', '— V.'], place: 'catacombs', x: 1996, y: 530 },
  { id: 'ancetre', title: 'Au charbon, sous les bougies', on: 'une tour griffonnée sur la dalle, une goutte rouge à son sommet', baked: true,
    text: ['L’ANCÊTRE SAIGNE ENCORE.'], place: 'catacombs', x: 252, y: 196 },
  { id: 'gardien', title: 'Carnet du gardien', on: 'sous la chaise, face à la grille', baked: true,
    text: ['Elle parle au mur.', 'Elle dit qu’elle a envoyé un rat ronger un pieu, là-haut.', 'Quel pieu.'], place: 'catacombs', x: 2300, y: 1040 },
  { id: 'jours', title: 'Les jours', on: 'grattés dans la dalle, au pied du reliquaire où elle était enfermée', baked: true, when: 'vesna',
    text: ['Des traits, par paquets de cinq. Des milliers.', 'Le dernier paquet n’en a que quatre.'], place: 'catacombs', x: 2440, y: 778 },
];
// shortcut: the redesigned necropolis' note spots read only if its data exports NOTES, else the x, y above; drop those once it is merged
const SPOTS = (Nec as unknown as { NOTES?: { id: string; x: number; y: number }[] }).NOTES ?? [];
for (const n of NOTES) { const s = SPOTS.find((s) => s.id === n.spot); if (s) [n.x, n.y] = [s.x, s.y]; }
export const BY_ID: Record<string, Note> = Object.fromEntries(NOTES.map((n) => [n.id, n]));

/** The notes lying in `place` now (`vesna`: she is freed). */
export const lying = (place: string, vesna: boolean) => NOTES.filter((n) => n.place === place && (!n.when || vesna));

/** The note of `list` within `reach` of floor point p, the nearest; or none. */
export function at(list: readonly Note[], p: { x: number; y: number }, reach: number) {
  let best: Note | undefined, bd = reach;
  for (const n of list) { const d = Math.hypot(n.x - p.x, n.y - p.y); if (d < bd) [best, bd] = [n, d]; }
  return best;
}

/** Note `id` read: into the journal (`found`, the order they were read in) if new. Returns whether it was new. */
export function keep(found: string[], id: string) {
  if (found.includes(id)) return false;
  found.push(id);
  return true;
}
