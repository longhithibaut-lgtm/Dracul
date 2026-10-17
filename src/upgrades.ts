import { T } from './tuning.ts';
import type { Kind } from './gifts.ts';

// The level-ups of the horde mode: small upgrades that stack, offered three at a time when the blood bar fills (the
// survivor side). Apart from the Rat house's gifts (gifts.ts), the big reward at the end of a room (the Hades side).
// What they are called, say and look like; their effects live in RoomScene, their numbers in T.ups.

const U = T.ups, pc = (k: number) => `${Math.round(k * 100)} %`;
type Up = { name: string; kind: Kind; text: string; icon: string[] }; // kind: the card's band; icon: 7x7, S silver s grey r d blood
const DEFS = {
  reach: { name: 'Griffes longues', kind: 'griffes', text: `Tes griffes portent ${U.reach} px plus loin et balaient ${U.arc} degrés de plus.`, icon: [
    'S......',
    '.S..S..',
    '..S..S.',
    '...S..S',
    '....S..',
    '.....S.',
    'rrrrrrr'] },
  claw: { name: 'Griffes acérées', kind: 'griffes', text: `Tes griffes infligent ${U.claw} dégât de plus.`, icon: [
    '...S...',
    '...S...',
    '..SSs..',
    '..SSs..',
    '.SSSss.',
    '.Ssrss.',
    '...r...'] },
  frenzy: { name: 'Frénésie', kind: 'griffes', text: `Tes griffes frappent ${pc(U.frenzy)} plus vite.`, icon: [
    'S.S.S..',
    '.S.S.S.',
    '..S.S.S',
    '.......',
    'r.r.r..',
    '.r.r.r.',
    '..d.d.d'] },
  finisher: { name: 'Coup de grâce', kind: 'griffes', text: `Le 3e coup de ton enchaînement inflige ${U.finisher} dégât de plus.`, icon: [
    'S.S.S..',
    'S.S.S..',
    'S.S.S..',
    '.......',
    '.rrrrr.',
    '..rrr..',
    '...r...'] },
  shards: { name: "Gerbe d'éclats", kind: 'tir', text: `Tu lances ${U.shards} éclat de plus, en éventail.`, icon: [
    '.....SS',
    '..r....',
    '.....SS',
    'rr.....',
    '.....SS',
    '..r....',
    '.......'] },
  shotRate: { name: 'Main leste', kind: 'tir', text: `Tes éclats partent ${pc(U.shotRate)} plus souvent.`, icon: [
    '....SS.',
    '...SrS.',
    '..rr...',
    '.d.....',
    '....SS.',
    '...SrS.',
    '..rr...'] },
  glyphRadius: { name: 'Grand sceau', kind: 'glyphe', text: `Ton glyphe est plus grand de ${U.glyphRadius} px.`, icon: [
    '.SSSSS.',
    'S.....S',
    'S.rrr.S',
    'S..r..S',
    'S.....S',
    '.SSSSS.',
    '.......'] },
  glyphRate: { name: 'Sceau pressé', kind: 'glyphe', text: `Ton glyphe revient ${pc(U.glyphRate)} plus vite.`, icon: [
    '..SSS..',
    '.S.r.S.',
    'S..r..S',
    'S..rr.S',
    'S.....S',
    '.S...S.',
    '..SSS..'] },
  mist: { name: 'Brume vive', kind: 'brume', text: `Ta brume se recharge ${pc(U.mist)} plus vite.`, icon: [
    '.SS..S.',
    'S..SS.S',
    '.......',
    '.SS..S.',
    'S..SS.S',
    '.......',
    'rrr.rrr'] },
  speed: { name: 'Foulée nocturne', kind: 'talent', text: `Tu marches ${pc(U.speed)} plus vite.`, icon: [
    '...SS..',
    '...SS..',
    '..SSSr.',
    '.S.SS..',
    '...S.S.',
    '..S...S',
    'rr..rr.'] },
  magnet: { name: 'Appel du sang', kind: 'talent', text: `Les gouttes de sang viennent à toi de ${pc(U.magnet)} plus loin.`, icon: [
    'r.....r',
    '.......',
    '..SSS..',
    '.S.r.S.',
    '..SSS..',
    '.......',
    'r.....r'] },
  vigor: { name: 'Sang épais', kind: 'talent', text: `+${U.vigor} sang maximum, et tu regagnes ${U.vigor} sang.`, icon: [
    '...S...',
    '..SrS..',
    '.SrrrS.',
    'SrrSrrS',
    'SrSSSrS',
    '.SrSrS.',
    '..SSS..'] },
  feast: { name: 'Festin', kind: 'talent', text: `Ta morsure rend ${U.feast} sang de plus.`, icon: [
    'SSSSSSS',
    '.S...S.',
    '.S...S.',
    '.......',
    '..rrr..',
    '.rrrrr.',
    '..ddd..'] },
} satisfies Record<string, Up>;
export type UpId = keyof typeof DEFS;
export const UPS: Record<UpId, Up> = DEFS;
export const UP_IDS = Object.keys(UPS) as UpId[];
/** Levels taken of each upgrade; an upgrade not taken is absent. */
export type Levels = Partial<Record<UpId, number>>;

/** The upgrades that may still be offered: below the top level. */
export const open = (levels: Levels) => UP_IDS.filter((id) => (levels[id] ?? 0) < U.max);
