export type MapId = 'moon-shrine' | 'ember-dojo' | 'snow-court';

export interface MapData {
  id: MapId;
  name: string;
  blurb: string;
}

export const MAPS: Record<MapId, MapData> = {
  'moon-shrine': { id: 'moon-shrine', name: 'Moon Shrine', blurb: 'Moonlit stone ring under the torii' },
  'ember-dojo': { id: 'ember-dojo', name: 'Ember Dojo', blurb: 'Sunset courtyard, lanterns lit' },
  'snow-court': { id: 'snow-court', name: 'Snow Court', blurb: 'Quiet garden in the first snow' },
};

export const MAP_IDS = Object.keys(MAPS) as MapId[];
