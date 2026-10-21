export interface IntroShot {
  t: [number, number];
  camera: string;
  action: string;
  sfx: string;
  vfx: string;
  rig?: string;
}

export interface Intro {
  music: string;
  line: string;
  card: string;
  shots: IntroShot[];
}

export declare const INTROS: Record<string, Intro>;
