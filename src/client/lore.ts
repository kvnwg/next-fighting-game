/**
 * Who the fighters are: the epithet the fighter select shows under their name in the story tab,
 * their backstory (a few short paragraphs) and the line they're known by. Flavour only; their kits
 * live in shared/characters.ts.
 */
import type { CharacterId } from '../shared/characters';

export interface Lore {
  epithet: string;
  story: string[];
  quote: string;
}

export const LORE: Record<CharacterId, Lore> = {
  ronin: {
    epithet: 'The Nameless Blade',
    story: [
      'He was Kagemori Jūrō, sword master to House Asaya, and his only pupil was the house’s heir: a boy of fourteen who could never get the draw right. When the shogun’s army surrounded the castle, every retainer swore to follow their lord into death. The boy gave his teacher one last order instead: take my little sister out through the water gate, and live.',
      'Jūrō obeyed. Behind him the castle burned and every sworn man died with honour. He carried the girl for three days through the rain, and on the third night the fever took her in his arms. The registers name him the only Asaya retainer who broke his oath. He has never once argued with them.',
      'He scraped the crest from his sword guard and gave his name to the river. The smoke that still rises from his blade, he says, is that castle, not yet finished burning. Every dawn he practises the one draw his pupil never mastered, and every coin he wins goes to a temple that keeps a small grave swept.',
    ],
    quote: 'Your name won’t be remembered. Neither will mine.',
  },
  juggernaut: {
    epithet: 'The Unmoving Wall',
    story: [
      'The mason-priests of Khal Dur carved him from the mountain itself, bound him in gold and gave him one command: hold the Pass of Seven Bells. For three hundred years nothing tried. Then the Ashen Host came over the snow, forty thousand strong, and the valley’s soldiers threw down their spears and ran.',
      'The Warden did not run. He stood in the throat of the pass for nine days and nine nights with a hammer forged from the great bell of the gate. The snow turned red to the knee. On the tenth morning the Host broke and turned for home, and in the valley below they rang the six bells that were left for a hundred years.',
      'The valley is empty now and the pass is a trade road, but nothing has tested him since. So he walked down to the duelling grounds, planted his feet in the ring and asked the one thing he wants to know.',
    ],
    quote: 'Move me.',
  },
  duelist: {
    epithet: 'The Green Flourish',
    story: [
      'Lucien Vaire was born in the gutters of Saint-Ombre and grew up stealing purses outside the city’s great fencing academy. He learned the sword through its windows, copying every lesson with a broom handle in the alley, until at sixteen he stole a real rapier and challenged the academy’s champion in the market square.',
      'He lost, badly. But old Master Ysolde, who had watched from the steps, saw a boy who had taught himself a style no one had taught him, and took him in to the fury of every noble family in the city. He swept her floors in the green livery of the servants by day and outfenced her heirs by night.',
      'Six years later he won the Queen’s Tournament, the first commoner ever to do it, then won it twice more and turned down the knighthood. He still wears the servant’s green. A title, he says, would only ruin the cape.',
    ],
    quote: 'Shall we dance?',
  },
  lancer: {
    epithet: 'Storm of the North',
    story: [
      'Arvid was a stable boy at the hold of Valdheim, and Astrid was the jarl’s daughter who loved thunderstorms. On storm nights she climbed the old watchtower to see the lightning walk across the fjord, and he climbed after her with a cloak, every time, for eleven years. They were to be married in the spring, whatever her father said.',
      'That winter the grey cough took her, and the healers gave her until the thaw. There was an old story: plant a spear on the summit of Mount Hjalm at the height of a storm, and the sky will grant one wish. Arvid took her father’s golden spear and climbed for three days through the ice. His horse died on the second. On the third he drove the spear into the peak and wished that nothing would ever take her from him. The lightning came down the shaft and into his heart, and never left.',
      'He ran down the mountain with the storm still inside him and found her waiting at the window. She had watched it strike from her bed; she knew what it was. She took his hand anyway, because she would rather go that way than any other, and the lightning went through her before he could pull away. Her braid is tied to his spear now. He fights only because when the storm finally spends itself in a duel, for a moment, it is quiet enough to remember her voice.',
    ],
    quote: 'Stand, or be struck.',
  },
  shade: {
    epithet: 'The Unseen',
    story: [
      'The Hollow Hand of Varrow raised him from the age of four. He had a number, Nine, instead of a name, and two knives instead of toys, and he learned to stand in the blind side of a candle flame before he learned to read. He was the best they ever made.',
      'At sixteen they sent him to kill a merchant and his whole household. He found the merchant’s daughter awake, six years old, holding a candle, and she asked him very politely whether he was a ghost. He put the knives away. The guild finished the job without him and came for him next. He met them in their own hall, and that night the hall burned with every master of the Hollow Hand inside.',
      'He carried the girl to a temple in the hills and never told her his name, because he did not have one. Every coin he wins in the duelling rings goes to that temple. Once a year he watches her teach the village children to read, from somewhere she will never see him.',
    ],
    quote: 'You never heard me.',
  },
  reaper: {
    epithet: 'Hollow Harvest',
    story: [
      'Toma grew rice in the Kurosawa valley with his wife Ayame and their two small sons, and he sang to the boys every night while they fell asleep. At harvest, Lord Itagaki set fire to the whole valley to starve a rival’s army marching through, and his soldiers barred the village gate from the outside so that no one would carry the grain away.',
      'Toma died last, hacking at the gate bar with his reaping sickle while the smoke rolled over the fields. Under the harvest moon something rose from the ash wearing his white burial robe, the sickle on a chain at its hip. It went to Itagaki’s castle first. It took nine years, and the lord’s guards say that at the end there was only a soft hush in the dark, like wind through stalks.',
      'Now it walks from duel to duel, taking a little life back with every cut, as if it could ever fill what was emptied. Those who have faced it swear that under the hush, very faintly, it is humming a lullaby.',
    ],
    quote: 'Shhh…',
  },
  monk: {
    epithet: 'The Last Teacher',
    story: [
      'Master Genkai of Kōzan temple taught a hundred disciples the way of the open hand. When the warlord Oda Kurogane marched on the temple for its grain, all hundred went down to hold the bridge at Ume. The abbot ordered Genkai, their teacher, to stay behind and keep the lamps lit. They held the bridge until sunset. None came back up the mountain.',
      'He kept the lamps lit for forty years. Then, at eighty, he walked down to the castle of Kurogane’s son, alone, and went through sixty guards with his bare hands without killing one of them. He knelt before the young lord and asked for a single thing: the names of the hundred, written down in a book.',
      'The names are carved into the temple steps now, one for every step. Genkai walks the duelling grounds looking for someone worth teaching, and he teaches the only way he still knows: by breaking their guard, their stance and their pride, one patient blow at a time.',
    ],
    quote: 'I have outlived braver men. Come.',
  },
  paladin: {
    epithet: 'Oath of Bronze',
    story: [
      'The Order of Bronze swore to stand between the town of Hollowmere and the wolves, and for three generations it kept that oath. Then the Wolf King came out of the north with ten thousand spears, and the Order’s grand masters sold him the keys to the gate in exchange for their own lives.',
      'Ser Aldric was the youngest knight in the fortress. He refused the order to stand down, barred himself in the gatehouse and held it alone for a day and a night while two thousand townsfolk escaped across the lake on rafts. At dawn the Wolf King himself came to break the gate. Aldric met him on the bridge and killed him in single combat, and the leaderless army scattered into the hills.',
      'The Order cast him out for disobedience. The people of Hollowmere gave him the bronze shield he carries, struck with the town’s whirlpool seal. He has kept the oath ever since, gate or no gate. He salutes every opponent and offers mercy once, and some say the light that strikes his raised sword is the oath itself, still keeping watch.',
    ],
    quote: 'By oath, I stand.',
  },
};
