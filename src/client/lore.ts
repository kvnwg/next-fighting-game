/**
 * Who the fighters are: the epithet the fighter select shows under their name in the story tab,
 * their backstory (two short paragraphs) and the line they're known by. Flavour only; their kits
 * live in shared/characters.ts.
 */
import type { CharacterId } from '../shared/characters';

export interface Lore {
  epithet: string;
  story: [string, string];
  quote: string;
}

export const LORE: Record<CharacterId, Lore> = {
  ronin: {
    epithet: 'The Nameless Blade',
    story: [
      'He served a house whose name was struck from the records the night it fell. Every retainer was sworn to follow their lord into death; he alone walked out through the burning gate with his sword still sheathed, and the shame of that walk is the only thing he carries besides the blade.',
      'He has given away his name, his crest, even his face under the straw kasa. What is left is the draw: one cut, practised every dawn until the steel steams in the cold. He fights for rice, for passage, for nothing at all, and he tells every opponent the same thing, because he means it.',
    ],
    quote: 'Your name won’t be remembered. Neither will mine.',
  },
  juggernaut: {
    epithet: 'The Unmoving Wall',
    story: [
      'Priests who are a thousand years dust raised him from quarry stone and bound him in gold to guard a mountain gate. His orders were simple: let nothing through. The city behind the gate emptied, crumbled and was forgotten. The Warden was not told, so he stayed.',
      'When the duelling grounds were built across the old road, he walked into the ring and planted his feet, and no one has made him leave since. He does not hate the ones who come at him. He is only doing what he was made for, and he has not yet met anything that could move him.',
    ],
    quote: 'Move me.',
  },
  duelist: {
    epithet: 'The Green Flourish',
    story: [
      'The youngest pupil of a famous fencing master, and the only one ever thrown out of the academy: he beat the master in front of the whole school with a feint he had been forbidden to use. He took the green practice cape on his way out and has worn nothing else since.',
      'He tours the duelling grounds with a rapier, a hat with too many feathers and a gift for making people swing at the wrong thing. Every fight is a performance and every opponent a partner, right up to the moment he takes their blade aside and runs them through.',
    ],
    quote: 'Shall we dance?',
  },
  lancer: {
    epithet: 'Storm of the North',
    story: [
      'The northern riders tell of a knight who climbed the highest peak in a thunderstorm to plant a golden spear on the summit, and of the lightning that came down the shaft and never left him. He walked down the mountain alone, his horse dead behind him and the storm inside his armour.',
      'The charge never settles. Only a worthy fight quiets it for a while, so he hunts the strongest fighters he can find, holds them at the end of his spear and calls the sky down where they stand. Those who close the distance find he has simply vaulted over them.',
    ],
    quote: 'Stand, or be struck.',
  },
  shade: {
    epithet: 'The Unseen',
    story: [
      'Raised by a guild that does not exist, in a city that pretends not to need one, he was given a number instead of a name and two knives instead of toys. He learned to step into the blind side of a candle flame, then into the blind side of a man.',
      'The guild burned the night he refused a contract on a child. He walked out of the smoke with the knives they had given him and sells the one thing he knows to the duelling rings, where at least the mark knows a fight is coming. Most of them still never see him.',
    ],
    quote: 'You never heard me.',
  },
  reaper: {
    epithet: 'Hollow Harvest',
    story: [
      'There was a farmer who reaped for a lord, and the lord burned the fields at harvest to starve a rival. The farmer lay down in the ashes with his family, and something got up in his place: a robe full of mist, a face like an empty lantern, and the sickle on its chain.',
      'The Wraith takes back what was taken, a little life from every cut, and gathers in those who run from him the way he once gathered wheat. He does not speak. Those who have faced him say there is only a soft hush, like wind through the stalks, just before the chain bites.',
    ],
    quote: 'Shhh…',
  },
  monk: {
    epithet: 'The Last Teacher',
    story: [
      'His temple trained a hundred disciples in the open hand. When war came up the valley they all went down to meet it, and he was the one told to stay behind and keep the lamps lit. He kept them lit for forty years. None of his students came back.',
      'Now he walks from duel to duel, looking for someone worth teaching, and teaches the only way he still can: by breaking their guard, their stance and their pride, one patient blow at a time. Most of his fights are won before the other fighter knows they have begun.',
    ],
    quote: 'I have outlived braver men. Come.',
  },
  paladin: {
    epithet: 'Oath of Bronze',
    story: [
      'The Order of Bronze swore to stand between the weak and the wolves, and for three generations it did. When the order’s own masters sold the fortress they were sworn to keep, one knight refused to lower his shield, held the gate alone for a day and a night, and was cast out with his oath unbroken.',
      'He keeps it still. He salutes every opponent, offers mercy once, and fights as if the gate were at his back. Some say the light that strikes his raised sword is a blessing. He says it is only the oath, keeping watch.',
    ],
    quote: 'By oath, I stand.',
  },
};
