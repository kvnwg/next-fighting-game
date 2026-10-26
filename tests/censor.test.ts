/** Moderation: CrazyGames' word list, whole words only, in names and chat. */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { defaultCensor, startServer } from '../src/server/app';
import { createCensor } from '../src/server/censor';
import { PROTOCOL_VERSION, ServerMsg } from '../src/shared/protocol';

const censor = defaultCensor();

describe('censor', () => {
  it('stars out whole words and phrases, never parts of a word', () => {
    expect(censor.clean('pain in the ass')).toBe('pain in the ***');
    expect(censor.clean('there is an assassin')).toBe('there is an assassin');
    expect(censor.clean('the horde is coming')).toBe('the horde is coming');
    expect(censor.clean('Scunthorpe grass class')).toBe('Scunthorpe grass class');
  });

  it('sees through punctuation, case, leetspeak, stretching and spacing', () => {
    expect(censor.clean('you are an ASS.')).toBe('you are an ****');
    expect(censor.clean('sh1t')).toBe('****');
    expect(censor.clean('oh $#!+')).toBe('oh ****');
    expect(censor.clean('fuuuuck')).toBe('*******');
    expect(censor.clean('f u c k off')).toMatch(/^\* \* \* \* /);
    expect(censor.clean('  spaced   out  ')).toBe('  spaced   out  ');
  });

  it("leaves the game's own words alone", () => {
    expect(censor.clean('watch for the thrust, then hit the dummy')).toBe('watch for the thrust, then hit the dummy');
    expect(censor.clean('gg wp, nice deflect')).toBe('gg wp, nice deflect');
  });

  it('checks names however they are joined up', () => {
    for (const n of ['FuckYou', 'Fuck_You', 'fuck you', 'Fuckyou']) expect(censor.allowed(n)).toBe(false);
    for (const n of ['Kevin', 'Assassin99', 'Glasses', 'Wanderer1234']) expect(censor.allowed(n)).toBe(true);
  });

  it('reads the list one entry per line', () => {
    const c = createCensor('badword\nvery bad phrase\n\n');
    expect(c.clean('a badword here')).toBe('a ******* here');
    expect(c.clean('a very bad phrase!')).toBe('a **** *** *******');
    expect(c.clean('a very bad idea')).toBe('a very bad idea');
  });

  it('ships the whole list', () => {
    const n = fs.readFileSync(new URL('../src/server/blocklist.txt', import.meta.url), 'utf8').split('\n').filter(Boolean).length;
    expect(n).toBeGreaterThan(40000);
  });
});

describe('moderated server', () => {
  it('renames a blocked name and stars out chat', async () => {
    const s = await startServer({ port: 0, dataFile: null });
    try {
      const ws = new WebSocket(`ws://localhost:${s.port}/ws`);
      const msgs: ServerMsg[] = [];
      ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
      await new Promise((r) => ws.once('open', r));
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, name: 'Fuck_You', char: 'ronin' }));
      const until = async <T>(f: () => T | undefined) => {
        for (let i = 0; i < 200; i++) {
          const v = f();
          if (v) return v;
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error('timed out');
      };
      const welcome = await until(() => msgs.find((m) => m.t === 'welcome'));
      expect(welcome.t === 'welcome' && welcome.profile.name).toMatch(/^Wanderer\d{4}$/);
      await until(() => msgs.find((m) => m.t === 'notice' && /isn't allowed/.test(m.text)));
      ws.send(JSON.stringify({ t: 'chat', text: 'what the shit' }));
      const chat = await until(() => msgs.find((m) => m.t === 'chat' && !m.sys));
      expect(chat.t === 'chat' && chat.text).toBe('what the ****');
      ws.close();
    } finally {
      await s.close();
    }
  });
});
