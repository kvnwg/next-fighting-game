/** DOM user interface: HUD, menus, overlays. Pure presentation; App drives it. */
import { CHARACTERS, CHARACTER_IDS, CharacterDef, CharacterId, Perilous } from '../shared/characters';
import { GAME_SUBTITLE, GAME_TITLE } from '../shared/config';
import { ARENA_MAPS, MAPS } from '../shared/maps';
import { BotDifficulty, LeaderboardEntry, MatchMode, ProfileView, RosterEntry, ServerMsg } from '../shared/protocol';
import { PLACEMENT_MATCHES, RankInfo, TIERS, rankOf } from '../shared/ranks';
import { settings } from './settings';

const h = (html: string): HTMLElement => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
};

export const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function rankBadge(r: RankInfo, small = false): string {
  const label = r.placed ? r.label : small ? 'Unranked' : r.label;
  return `<span class="rank-badge ${small ? 'small' : ''}" style="--rank:${r.color}"><i></i>${esc(label)}</span>`;
}

const PERILOUS_TIP: Record<Perilous, string> = {
  thrust: 'Perilous THRUST — deflect it, or dodge into it for a Mikiri Counter',
  sweep: 'Perilous SWEEP — jump over it',
  grab: 'Perilous GRAB — dodge or jump away',
};

export interface UIHandlers {
  onEnter(name: string): void;
  onRanked(): void;
  onPractice(diff: BotDifficulty): void;
  onCancelQueue(): void;
  onSelectChar(id: CharacterId): void;
  onLeaderboard(): void;
  onChat(text: string): void;
  onChallengeReply(from: string, accept: boolean): void;
  onForfeit(): void;
  onSettingsChanged(): void;
  onModalChange(open: boolean): void;
  createPreview(container: HTMLElement): Preview;
}

export interface Preview {
  el: HTMLElement;
  setChar(id: CharacterId): void;
  dispose(): void;
}

interface Floater {
  el: HTMLElement;
  x: number;
  y: number;
  z: number;
  life: number;
  max: number;
}

export class UI {
  readonly root: HTMLElement;
  private title: HTMLElement;
  private hud: HTMLElement;
  private modal: HTMLElement;
  private chatLog: HTMLElement;
  private chatInput: HTMLInputElement;
  private plates = new Map<string, HTMLElement>();
  private plateLayer: HTMLElement;
  private floatLayer: HTMLElement;
  private floaters: Floater[] = [];
  private bannerTimer = 0;
  private toastBox: HTMLElement;
  private feed: HTMLElement;
  private preview: Preview | null = null;
  private challengeFrom: string | null = null;
  modalOpen: string | null = null;
  chatOpen = false;
  private els: Record<string, HTMLElement> = {};

  constructor(
    parent: HTMLElement,
    private readonly handlers: UIHandlers,
    private readonly offline = false,
  ) {
    const touchOnly = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
    this.root = h(`<div id="ui"></div>`);
    parent.appendChild(this.root);

    this.title = h(`
      <div class="title-screen">
        <div class="title-box">
          <h1 class="logo">${GAME_TITLE}</h1>
          <div class="subtitle">${GAME_SUBTITLE}</div>
          <label class="field"><span>Your name</span><input id="name-input" maxlength="16" autocomplete="off" spellcheck="false" /></label>
          <button class="btn big" id="enter-btn">${offline ? 'Play' : 'Enter the Grounds'}</button>
          <div class="title-status" id="title-status">${
            touchOnly
              ? 'This game needs a keyboard and mouse. Open it on a computer to play.'
              : offline
                ? 'Single player: roam the lobby, spar, practice, and climb ranked against AI opponents. Progress saves in this browser.'
                : ''
          }</div>
          <div class="title-hint">WASD move · Mouse aim · LMB attack · RMB heavy · F guard/deflect · Shift dodge · Space jump · E perilous · R ability · Tab lock-on</div>
        </div>
      </div>`);
    this.root.appendChild(this.title);
    const nameInput = this.title.querySelector<HTMLInputElement>('#name-input')!;
    nameInput.value = settings.name;
    const enter = () => this.handlers.onEnter(nameInput.value.trim());
    this.title.querySelector('#enter-btn')!.addEventListener('click', enter);
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enter();
    });

    this.hud = h(`
      <div class="hud hidden">
        <div class="plates"></div>
        <div class="floaters"></div>
        <div class="lock-reticle hidden"></div>
        <div class="top-left">
          <div class="profile-card"></div>
          <div class="net-info"><span id="online">0 online</span> · <span id="ping">-- ms</span><span id="fps"></span></div>
        </div>
        <div class="top-center">
          <div class="zone-indicator hidden">SAFE ZONE · PvP disabled</div>
          <div class="match-bar hidden">
            <div class="pips left"></div><div class="match-timer">0:00</div><div class="pips right"></div>
          </div>
          <div class="target-panel hidden">
            <div class="target-name"></div>
            <div class="bar hp"><div class="fill"></div></div>
            <div class="posture"><div class="fill"></div></div>
          </div>
        </div>
        <div class="top-right">
          <div class="menu-buttons">
            <button class="btn ranked" id="btn-ranked">${offline ? '⚔ Ranked vs AI [K]' : '⚔ Ranked [K]'}</button>
            <div class="practice-group">
              <button class="btn" id="btn-practice">Practice vs Bot [P]</button>
              <select id="practice-diff"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select>
            </div>
            <button class="btn small" id="btn-chars">Characters [C]</button>
            <button class="btn small" id="btn-ladder">Ladder [L]</button>
            <button class="btn small" id="btn-help">Help [H]</button>
            <button class="btn small danger hidden" id="btn-forfeit">Forfeit</button>
          </div>
          <div class="queue-panel hidden">
            <div class="queue-title">${offline ? 'Finding an opponent near your rating…' : 'Searching for a ranked duel…'}</div>
            <div class="queue-time">0:00</div>
            <div class="queue-count"></div>
            <button class="btn small" id="btn-cancel">Cancel</button>
          </div>
          <div class="feed"></div>
        </div>
        <div class="center">
          <div class="banner hidden"></div>
          <div class="subbanner hidden"></div>
        </div>
        <div class="toasts"></div>
        <div class="prompt hidden"></div>
        <div class="challenge-popup hidden"></div>
        <div class="death-overlay hidden"><div class="death-title">SLAIN</div><div class="death-sub"></div></div>
        <div class="bottom-left">
          <div class="chat">
            <div class="chat-log"></div>
            <input class="chat-input hidden" maxlength="140" placeholder="Say something… (Enter to send, Esc to cancel)" />
          </div>
        </div>
        <div class="bottom-center">
          <div class="self-name"></div>
          <div class="posture self"><div class="fill"></div></div>
          <div class="bar hp self"><div class="fill"></div><span class="val"></span></div>
        </div>
        <div class="bottom-right">
          <div class="skill" id="sk-dodge"><div class="cd"></div><div class="key">Shift</div><div class="name">Dodge</div><div class="charges"></div></div>
          <div class="skill" id="sk-special"><div class="cd"></div><div class="key">E</div><div class="name"></div></div>
          <div class="skill" id="sk-ability"><div class="cd"></div><div class="key">R</div><div class="name"></div></div>
        </div>
        <div class="click-hint hidden">Click the game to capture the mouse</div>
        <div class="esc-hint hidden">Esc: free the cursor</div>
      </div>`);
    this.root.appendChild(this.hud);
    this.modal = h(`<div class="modal hidden"></div>`);
    this.root.appendChild(this.modal);

    const q = <T extends HTMLElement>(sel: string) => this.hud.querySelector<T>(sel)!;
    this.plateLayer = q('.plates');
    this.floatLayer = q('.floaters');
    this.toastBox = q('.toasts');
    this.feed = q('.feed');
    this.chatLog = q('.chat-log');
    this.chatInput = q<HTMLInputElement>('.chat-input');
    for (const [k, sel] of Object.entries({
      profile: '.profile-card',
      online: '#online',
      ping: '#ping',
      fps: '#fps',
      zone: '.zone-indicator',
      matchBar: '.match-bar',
      pipsL: '.pips.left',
      pipsR: '.pips.right',
      timer: '.match-timer',
      target: '.target-panel',
      targetName: '.target-name',
      targetHp: '.target-panel .hp .fill',
      targetPo: '.target-panel .posture .fill',
      queue: '.queue-panel',
      queueTime: '.queue-time',
      queueCount: '.queue-count',
      banner: '.banner',
      subbanner: '.subbanner',
      prompt: '.prompt',
      challenge: '.challenge-popup',
      death: '.death-overlay',
      deathSub: '.death-sub',
      selfName: '.self-name',
      selfHp: '.bar.hp.self .fill',
      selfHpVal: '.bar.hp.self .val',
      selfPo: '.posture.self .fill',
      selfPoBox: '.posture.self',
      skDodge: '#sk-dodge',
      skSpecial: '#sk-special',
      skAbility: '#sk-ability',
      reticle: '.lock-reticle',
      clickHint: '.click-hint',
      escHint: '.esc-hint',
      menuButtons: '.menu-buttons',
      btnRanked: '#btn-ranked',
      btnPractice: '#btn-practice',
      btnForfeit: '#btn-forfeit',
    })) {
      this.els[k] = q(sel);
    }

    q('#btn-ranked').addEventListener('click', () => this.handlers.onRanked());
    q('#btn-practice').addEventListener('click', () => this.handlers.onPractice(q<HTMLSelectElement>('#practice-diff').value as BotDifficulty));
    q('#btn-cancel').addEventListener('click', () => this.handlers.onCancelQueue());
    q('#btn-chars').addEventListener('click', () => this.toggleModal('chars'));
    q('#btn-ladder').addEventListener('click', () => this.toggleModal('ladder'));
    q('#btn-help').addEventListener('click', () => this.toggleModal('help'));
    // two-step confirm (native confirm() dialogs are blocked in some embeds)
    const forfeit = q<HTMLButtonElement>('#btn-forfeit');
    let armedUntil = 0;
    forfeit.addEventListener('click', () => {
      if (performance.now() < armedUntil) {
        armedUntil = 0;
        forfeit.textContent = 'Forfeit';
        this.handlers.onForfeit();
        return;
      }
      armedUntil = performance.now() + 3000;
      forfeit.textContent = 'Click again to forfeit';
      setTimeout(() => {
        if (performance.now() >= armedUntil) forfeit.textContent = 'Forfeit';
      }, 3100);
    });
    this.chatInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        const text = this.chatInput.value.trim();
        if (text) this.handlers.onChat(text);
        this.closeChat();
      } else if (e.key === 'Escape') this.closeChat();
    });
    // keep the buttons from stealing keyboard focus (space/enter would click them)
    this.hud.querySelectorAll('button, select').forEach((b) => b.addEventListener('mouseup', () => (b as HTMLElement).blur()));
  }

  // ------------------------------------------------------------------ title

  setTitleStatus(text: string, error = false): void {
    const el = this.title.querySelector<HTMLElement>('#title-status')!;
    el.textContent = text;
    el.classList.toggle('error', error);
  }

  showGame(): void {
    this.title.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  showTitle(): void {
    this.title.classList.remove('hidden');
    this.hud.classList.add('hidden');
  }

  // ------------------------------------------------------------------ profile & lobby chrome

  setProfile(p: ProfileView): void {
    const r = rankOf(p.mmr, p.placements);
    const games = p.wins + p.losses;
    this.els.profile.innerHTML = `
      <div class="pc-name">${esc(p.name)}</div>
      <div>${rankBadge(r)}</div>
      <div class="pc-stats">${r.placed ? `${p.mmr} MMR · ` : ''}${p.wins}W ${p.losses}L${games ? ` · ${Math.round((p.wins / games) * 100)}%` : ''}${p.streak > 1 ? ` · 🔥${p.streak}` : ''}</div>
      ${r.placed ? `<div class="pc-progress"><div style="width:${Math.round(r.progress * 100)}%;background:${r.color}"></div></div>` : `<div class="pc-progress"><div style="width:${(p.placements / PLACEMENT_MATCHES) * 100}%;background:#8b93a1"></div></div>`}`;
  }

  setNetInfo(online: number, ping: number, fps: number | null): void {
    this.els.online.textContent = this.offline ? 'single player' : `${online} online`;
    this.els.ping.textContent = this.offline ? 'offline' : `${Math.round(ping)} ms`;
    this.els.fps.textContent = fps !== null ? ` · ${fps} fps` : '';
  }

  setLobbyMode(inLobby: boolean): void {
    this.els.menuButtons.classList.toggle('in-match', !inLobby);
    for (const id of ['btnRanked', 'btnPractice']) (this.els[id] as HTMLButtonElement).disabled = !inLobby;
    this.els.btnForfeit.classList.toggle('hidden', inLobby);
    if (!inLobby) this.els.queue.classList.add('hidden');
  }

  setQueue(searching: boolean, since: number, count: number, serverNow: number): void {
    this.els.queue.classList.toggle('hidden', !searching);
    (this.els.btnRanked as HTMLButtonElement).disabled = searching;
    if (!searching) return;
    const s = Math.max(0, Math.floor((serverNow - since) / 1000));
    this.els.queueTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.els.queueCount.textContent = count > 1 ? `${count} players searching` : 'Waiting for another player…';
  }

  setZone(inSafe: boolean | null): void {
    this.els.zone.classList.toggle('hidden', !inSafe);
  }

  setClickHint(show: boolean, locked: boolean, fallback = false): void {
    // without pointer lock the cursor stays free: mouse movement over the game still looks around
    this.els.clickHint.classList.toggle('hidden', !show || fallback);
    this.els.escHint.classList.toggle('hidden', !locked);
  }

  practiceDifficulty(): BotDifficulty {
    return this.hud.querySelector<HTMLSelectElement>('#practice-diff')!.value as BotDifficulty;
  }

  // ------------------------------------------------------------------ combat HUD

  setSelf(name: string, char: CharacterDef, hp: number, posture: number, broken: boolean): void {
    this.els.selfName.textContent = `${name} · ${char.name}`;
    const hpPct = Math.max(0, hp / char.stats.hp) * 100;
    (this.els.selfHp as HTMLElement).style.width = `${hpPct}%`;
    this.els.selfHpVal.textContent = `${Math.ceil(hp)} / ${char.stats.hp}`;
    this.setPosture(this.els.selfPo, posture / char.stats.posture);
    this.els.selfPoBox.classList.toggle('broken', broken);
  }

  private setPosture(fill: HTMLElement, frac: number): void {
    const f = Math.max(0, Math.min(1, frac));
    fill.style.width = `${f * 100}%`;
    fill.style.background = f > 0.8 ? '#ff4a2a' : f > 0.5 ? '#ff9a2a' : '#ffd24a';
  }

  setTarget(t: { name: string; char: CharacterDef; hp: number; posture: number; rank?: RankInfo } | null): void {
    this.els.target.classList.toggle('hidden', !t);
    if (!t) return;
    this.els.targetName.innerHTML = `${esc(t.name)} <span class="muted">· ${t.char.name}</span> ${t.rank ? rankBadge(t.rank, true) : ''}`;
    this.els.targetHp.style.width = `${Math.max(0, t.hp / t.char.stats.hp) * 100}%`;
    this.setPosture(this.els.targetPo, t.posture / t.char.stats.posture);
  }

  setSkills(char: CharacterDef, now: number, readyAt: { dodge: number[]; special: number; ability: number }, dodgeCd: number): void {
    const set = (el: HTMLElement, readyTime: number, cd: number, name: string, title: string) => {
      const left = Math.max(0, readyTime - now);
      const cdEl = el.querySelector<HTMLElement>('.cd')!;
      cdEl.style.height = `${Math.min(1, left / cd) * 100}%`;
      el.classList.toggle('ready', left <= 0);
      el.querySelector('.name')!.textContent = left > 0 ? `${(left / 1000).toFixed(1)}s` : name;
      el.title = title;
    };
    const charges = readyAt.dodge;
    const ready = charges.filter((t) => t <= now).length;
    const nextReady = ready > 0 ? 0 : Math.min(...charges);
    set(this.els.skDodge, nextReady, dodgeCd, 'Dodge', 'Dodge (i-frames). Dodge INTO a perilous thrust for a Mikiri Counter.');
    this.els.skDodge.querySelector('.charges')!.textContent = charges.length > 1 ? `${ready}/${charges.length}` : '';
    set(this.els.skSpecial, readyAt.special, char.special.cooldown, char.special.name, `${char.special.name}: ${PERILOUS_TIP[char.special.perilous!]}`);
    set(this.els.skAbility, readyAt.ability, char.ability.cooldown, char.ability.name, `${char.ability.name}: ${char.ability.description}`);
  }

  setMatch(m: Extract<ServerMsg, { t: 'match' }> | null, serverNow: number): void {
    this.els.matchBar.classList.toggle('hidden', !m);
    if (!m) return;
    const pips = (n: number) => Array.from({ length: 2 }, (_, i) => `<i class="${i < n ? 'won' : ''}"></i>`).join('');
    const me = m.you;
    this.els.pipsL.innerHTML = pips(m.scores[me]);
    this.els.pipsR.innerHTML = pips(m.scores[me === 0 ? 1 : 0]);
    let secs = 0;
    if (m.phase === 'fight') secs = Math.max(0, Math.ceil((m.endsAt - serverNow) / 1000));
    this.els.timer.textContent = m.phase === 'fight' ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : `R${m.round}`;
    this.els.timer.classList.toggle('urgent', m.phase === 'fight' && secs <= 10);
  }

  setDeath(text: string | null): void {
    this.els.death.classList.toggle('hidden', text === null);
    if (text !== null) this.els.deathSub.textContent = text;
  }

  setPrompt(text: string | null): void {
    this.els.prompt.classList.toggle('hidden', !text);
    if (text) this.els.prompt.innerHTML = text;
  }

  setReticle(x: number | null, y = 0): void {
    this.els.reticle.classList.toggle('hidden', x === null);
    if (x !== null) this.els.reticle.style.transform = `translate(${x}px, ${y}px)`;
  }

  banner(text: string, sub = '', ms = 1600, cls = ''): void {
    const b = this.els.banner;
    const s = this.els.subbanner;
    b.className = `banner ${cls}`;
    b.textContent = text;
    s.textContent = sub;
    s.classList.toggle('hidden', !sub);
    // restart the pop animation
    void b.offsetWidth;
    b.classList.add('pop');
    clearTimeout(this.bannerTimer);
    if (ms > 0) {
      this.bannerTimer = window.setTimeout(() => {
        b.classList.add('hidden');
        s.classList.add('hidden');
      }, ms);
    }
  }

  hideBanner(): void {
    this.els.banner.classList.add('hidden');
    this.els.subbanner.classList.add('hidden');
  }

  toast(text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    const el = h(`<div class="toast ${kind}">${esc(text)}</div>`);
    this.toastBox.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  killFeed(killer: string, victim: string, how: string): void {
    const el = h(`<div class="feed-row">${killer ? `<b>${esc(killer)}</b> ` : ''}<span class="muted">${esc(how)}</span> <b>${esc(victim)}</b></div>`);
    this.feed.prepend(el);
    while (this.feed.children.length > 5) this.feed.lastElementChild!.remove();
    setTimeout(() => el.remove(), 7000);
  }

  // ------------------------------------------------------------------ nameplates & floating text

  plate(id: string, show: boolean, x = 0, y = 0, name = '', hpFrac = 1, color = '#fff', sub = ''): void {
    let el = this.plates.get(id);
    if (!show) {
      if (el) el.style.display = 'none';
      return;
    }
    if (!el) {
      el = h(`<div class="plate"><div class="plate-name"></div><div class="plate-hp"><div></div></div></div>`);
      this.plateLayer.appendChild(el);
      this.plates.set(id, el);
    }
    el.style.display = '';
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    const n = el.firstElementChild as HTMLElement;
    const label = sub ? `${esc(name)} <span class="plate-sub">${esc(sub)}</span>` : esc(name);
    if (n.dataset.label !== label) {
      n.innerHTML = label;
      n.dataset.label = label;
    }
    n.style.color = color;
    ((el.lastElementChild as HTMLElement).firstElementChild as HTMLElement).style.width = `${Math.max(0, hpFrac) * 100}%`;
  }

  removePlate(id: string): void {
    this.plates.get(id)?.remove();
    this.plates.delete(id);
  }

  clearPlates(): void {
    for (const el of this.plates.values()) el.remove();
    this.plates.clear();
  }

  floatText(text: string, x: number, y: number, z: number, cls: string): void {
    const el = h(`<div class="floater ${cls}">${esc(text)}</div>`);
    this.floatLayer.appendChild(el);
    this.floaters.push({ el, x, y, z, life: 1.0, max: 1.0 });
    if (this.floaters.length > 30) {
      const f = this.floaters.shift()!;
      f.el.remove();
    }
  }

  updateFloaters(dt: number, project: (x: number, y: number, z: number) => { x: number; y: number } | null): void {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += dt * 0.9;
      const p = project(f.x, f.y, f.z);
      if (f.life <= 0 || !p) {
        if (f.life <= 0) {
          f.el.remove();
          this.floaters.splice(i, 1);
        } else f.el.style.display = 'none';
        continue;
      }
      f.el.style.display = '';
      f.el.style.opacity = String(Math.min(1, f.life * 2.5));
      f.el.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -50%)`;
    }
  }

  // ------------------------------------------------------------------ chat

  chat(name: string, text: string, sys = false): void {
    const el = h(`<div class="chat-line ${sys ? 'sys' : ''}">${sys ? '' : `<b>${esc(name)}:</b> `}${esc(text)}</div>`);
    this.chatLog.appendChild(el);
    while (this.chatLog.children.length > 40) this.chatLog.firstElementChild!.remove();
    this.chatLog.scrollTop = this.chatLog.scrollHeight;
    el.classList.add('fresh');
    setTimeout(() => el.classList.remove('fresh'), 8000);
  }

  openChat(): void {
    this.chatOpen = true;
    this.chatInput.classList.remove('hidden');
    this.chatLog.classList.add('open');
    this.chatInput.focus();
  }

  closeChat(): void {
    this.chatOpen = false;
    this.chatInput.value = '';
    this.chatInput.blur();
    this.chatInput.classList.add('hidden');
    this.chatLog.classList.remove('open');
  }

  // ------------------------------------------------------------------ challenge

  showChallenge(from: string, name: string, char: CharacterId): void {
    this.challengeFrom = from;
    const el = this.els.challenge;
    el.innerHTML = `<div><b>${esc(name)}</b> (${CHARACTERS[char].name}) challenges you to a duel!</div>
      <div class="row"><button class="btn small" data-a="1">Accept [Y]</button><button class="btn small danger" data-a="0">Decline [N]</button></div>`;
    el.classList.remove('hidden');
    el.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => this.answerChallenge((b as HTMLElement).dataset.a === '1')),
    );
    setTimeout(() => {
      if (this.challengeFrom === from) this.hideChallenge();
    }, 15000);
  }

  answerChallenge(accept: boolean): boolean {
    if (!this.challengeFrom) return false;
    this.handlers.onChallengeReply(this.challengeFrom, accept);
    this.hideChallenge();
    return true;
  }

  hideChallenge(): void {
    this.challengeFrom = null;
    this.els.challenge.classList.add('hidden');
  }

  // ------------------------------------------------------------------ modals

  toggleModal(kind: 'chars' | 'ladder' | 'help'): void {
    if (this.modalOpen === kind) this.closeModal();
    else this.openModal(kind);
  }

  closeModal(): void {
    if (!this.modalOpen) return;
    this.modalOpen = null;
    this.modal.classList.add('hidden');
    this.preview?.dispose();
    this.preview = null;
    this.modal.innerHTML = '';
    this.handlers.onModalChange(false);
  }

  private frame(title: string, body: string, wide = false): void {
    this.preview?.dispose();
    this.preview = null;
    this.modal.innerHTML = `<div class="modal-box ${wide ? 'wide' : ''}"><div class="modal-head"><h2>${title}</h2><button class="btn small close">✕ Esc</button></div><div class="modal-body">${body}</div></div>`;
    this.modal.classList.remove('hidden');
    this.modal.querySelector('.close')!.addEventListener('click', () => this.closeModal());
  }

  openModal(kind: 'chars' | 'ladder' | 'help', currentChar: CharacterId = settings.char): void {
    this.modalOpen = kind;
    this.handlers.onModalChange(true);
    if (kind === 'chars') this.renderChars(currentChar);
    else if (kind === 'ladder') {
      this.frame('Ranked Ladder', `<div class="ladder">Loading…</div>`);
      this.handlers.onLeaderboard();
    } else this.renderHelp();
  }

  private renderChars(selected: CharacterId): void {
    const cards = CHARACTER_IDS.map((id) => {
      const c = CHARACTERS[id];
      return `<button class="char-card ${id === selected ? 'sel' : ''}" data-id="${id}" style="--c1:${c.palette.primary};--c2:${c.palette.accent}">
        <div class="cc-swatch"></div><div class="cc-name">${c.name}</div><div class="cc-weapon">${c.weapon}</div></button>`;
    }).join('');
    this.frame('Choose your fighter', `<div class="char-select"><div class="char-grid">${cards}</div><div class="char-detail"></div></div>`, true);
    const detail = this.modal.querySelector<HTMLElement>('.char-detail')!;
    const show = (id: CharacterId) => {
      const c = CHARACTERS[id];
      const bar = (label: string, v: number) => `<div class="rating"><span>${label}</span><div>${'<i class="on"></i>'.repeat(v)}${'<i></i>'.repeat(5 - v)}</div></div>`;
      const atkRow = (name: string, dmg: number, extra = '') => `<li><b>${esc(name)}</b> <span class="muted">${dmg} dmg${extra}</span></li>`;
      detail.innerHTML = `
        <div class="cd-top">
          <div class="cd-preview"></div>
          <div class="cd-info">
            <h3>${c.name} <span class="muted">· ${c.weapon}</span></h3>
            <div class="role">${c.role}</div>
            <p>${esc(c.description)}</p>
            <div class="cd-stats">HP ${c.stats.hp} · Posture ${c.stats.posture} · Speed ${c.stats.speed}</div>
            ${bar('Power', c.ratings.power)}${bar('Speed', c.ratings.speed)}${bar('Reach', c.ratings.reach)}${bar('Defense', c.ratings.defense)}${bar('Difficulty', c.ratings.difficulty)}
          </div>
        </div>
        <div class="moves">
          <div><h4>Light chain [LMB]</h4><ul>${c.lights.map((l) => atkRow(l.name, l.damage * (l.hits ?? 1))).join('')}</ul></div>
          <div><h4>Heavy [RMB]</h4><ul>${atkRow(c.heavy.name, c.heavy.damage, c.heavy.feintable ? ' · feint with F' : '')}</ul>
            <h4>Perilous [E]</h4><ul>${atkRow(c.special.name, c.special.damage, ` · ${c.special.cooldown / 1000}s`)}<li class="tip">${PERILOUS_TIP[c.special.perilous!]}</li></ul></div>
          <div><h4>Ability [R] · ${c.ability.name}</h4><p>${esc(c.ability.description)} <span class="muted">(${c.ability.cooldown / 1000}s)</span></p>
            <h4>Passive · ${c.passive.name}</h4><p>${esc(c.passive.description)}</p></div>
        </div>
        <div class="cd-actions"><button class="btn big" id="pick-char">Play ${c.name}</button><span class="muted">Switch characters inside the lobby safe zone.</span></div>`;
      detail.querySelector('#pick-char')!.addEventListener('click', () => {
        this.handlers.onSelectChar(id);
        this.closeModal();
      });
      const pv = detail.querySelector<HTMLElement>('.cd-preview')!;
      if (!this.preview) this.preview = this.handlers.createPreview(pv);
      else pv.appendChild(this.preview.el);
      this.preview.setChar(id);
    };
    this.modal.querySelectorAll<HTMLElement>('.char-card').forEach((b) =>
      b.addEventListener('click', () => {
        this.modal.querySelectorAll('.char-card').forEach((x) => x.classList.remove('sel'));
        b.classList.add('sel');
        show(b.dataset.id as CharacterId);
      }),
    );
    show(selected);
  }

  showLeaderboard(entries: LeaderboardEntry[], you: number | null, total: number, me: ProfileView | null): void {
    if (this.modalOpen !== 'ladder') return;
    const box = this.modal.querySelector('.ladder');
    if (!box) return;
    const rows = entries
      .map((e, i) => {
        const r = rankOf(e.mmr, e.placements);
        const mine = me && e.name === me.name && e.mmr === me.mmr;
        return `<tr class="${mine ? 'mine' : ''}"><td>${i + 1}</td><td>${esc(e.name)}</td><td>${rankBadge(r, true)}</td><td>${e.mmr}</td><td>${e.wins}-${e.losses}</td></tr>`;
      })
      .join('');
    const tiers = TIERS.map((t) => `<span class="rank-badge small" style="--rank:${t.color}"><i></i>${t.name} ${t.min}+</span>`).join(' ');
    const meRank = me ? rankOf(me.mmr, me.placements) : null;
    box.innerHTML = `
      <div class="ladder-you">${me && meRank ? `You: ${rankBadge(meRank)} ${meRank.placed ? `${me.mmr} MMR · #${you ?? '?'} of ${total}` : `play ${PLACEMENT_MATCHES - me.placements} more ranked match(es) to place`}` : ''}</div>
      ${entries.length ? `<table><thead><tr><th>#</th><th>Name</th><th>Rank</th><th>MMR</th><th>W-L</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">Nobody has finished placements yet. Be the first!</p>'}
      <div class="tiers">${tiers}</div>
      <p class="muted">${
        this.offline
          ? 'Single player: you climb by beating AI opponents matched to your rating, and your record is saved in this browser. Run the game server to play ranked against other people.'
          : `Ranked is best of 3 rounds on a random map. Ratings use Elo (K=32, 64 during your ${PLACEMENT_MATCHES} placement matches). Leaving a ranked match counts as a loss.`
      }</p>`;
  }

  private renderHelp(): void {
    const maps = ARENA_MAPS.map((m) => `<li><b>${m.name}</b> — ${esc(m.description)}</li>`).join('');
    this.frame(
      'How to fight',
      `<div class="help">
        <div class="help-cols">
          <div>
            <h4>Controls</h4>
            <table class="keys">
              <tr><td>WASD</td><td>Move (Shift tap: dodge, hold: sprint)</td></tr>
              <tr><td>Mouse</td><td>Look / aim (click to capture)</td></tr>
              <tr><td>LMB</td><td>Light attack (chain up to 3-4)</td></tr>
              <tr><td>RMB</td><td>Heavy attack (press F during windup to feint)</td></tr>
              <tr><td>F</td><td>Guard — tap right before a hit to DEFLECT</td></tr>
              <tr><td>Space</td><td>Jump (evades perilous sweeps)</td></tr>
              <tr><td>E</td><td>Perilous special (unblockable)</td></tr>
              <tr><td>R</td><td>Character ability</td></tr>
              <tr><td>Tab / Q / MMB</td><td>Lock on</td></tr>
              <tr><td>G</td><td>Challenge the player you're looking at</td></tr>
              <tr><td>K · P</td><td>Queue ranked · Practice vs bot</td></tr>
              <tr><td>C · L · H</td><td>Characters · Ladder · Help</td></tr>
              <tr><td>Esc</td><td>Free the cursor (to click menus)</td></tr>
              <tr><td>Enter</td><td>Chat</td></tr>
            </table>
          </div>
          <div>
            <h4>Posture & deflects</h4>
            <p>Every fighter has <b>health</b> and <b>posture</b>. Blocking a hit costs posture. <b>Deflecting</b> (pressing guard just before the hit lands) costs almost nothing and instead hammers the attacker's posture, staggering them for a free counter.</p>
            <p>When posture fills up you are <b>posture broken</b>: helpless for a moment, and the next hit is a <b>Deathblow</b> for ${40} damage. Posture recovers over time — faster while guarding, slower when hurt.</p>
            <p>Mashing guard shrinks your deflect window. Read the swing, then commit.</p>
            <h4>Perilous attacks <span class="kanji">危</span></h4>
            <p>A red symbol means an unblockable attack: <b>Thrusts</b> must be deflected — or dodge <i>into</i> them for a Mikiri Counter. <b>Sweeps</b> must be jumped. <b>Grabs</b> must be dodged.</p>
          </div>
        </div>
        <h4>The lobby</h4>
        <p>You spawn in the shrine plaza (safe zone). Step outside and anyone can fight you. The training yard (east) has a passive dummy and a sparring dummy that swings at you — perfect for practising deflects.</p>
        <h4>Arenas</h4><ul class="maps">${maps}</ul>
        <h4>Settings</h4>
        <div class="settings">
          <label>Pixel size <input type="range" min="1" max="6" step="1" id="set-px" value="${settings.pixelSize}"><span id="set-px-v">${settings.pixelSize}</span></label>
          <label>Mouse sensitivity <input type="range" min="0.2" max="3" step="0.1" id="set-sens" value="${settings.sensitivity}"><span id="set-sens-v">${settings.sensitivity}</span></label>
          <label>Volume <input type="range" min="0" max="1" step="0.05" id="set-vol" value="${settings.volume}"></label>
          <label><input type="checkbox" id="set-cue" ${settings.parryCue ? 'checked' : ''}> Weapon glint before a hit lands</label>
          <label><input type="checkbox" id="set-inv" ${settings.invertY ? 'checked' : ''}> Invert mouse Y</label>
          <label><input type="checkbox" id="set-fps" ${settings.showFps ? 'checked' : ''}> Show FPS</label>
        </div>
      </div>`,
      true,
    );
    const bind = (id: string, apply: (el: HTMLInputElement) => void) => {
      const el = this.modal.querySelector<HTMLInputElement>(id)!;
      el.addEventListener('input', () => {
        apply(el);
        this.handlers.onSettingsChanged();
      });
    };
    bind('#set-px', (el) => {
      settings.pixelSize = Number(el.value);
      this.modal.querySelector('#set-px-v')!.textContent = el.value;
    });
    bind('#set-sens', (el) => {
      settings.sensitivity = Number(el.value);
      this.modal.querySelector('#set-sens-v')!.textContent = el.value;
    });
    bind('#set-vol', (el) => (settings.volume = Number(el.value)));
    bind('#set-cue', (el) => (settings.parryCue = el.checked));
    bind('#set-inv', (el) => (settings.invertY = el.checked));
    bind('#set-fps', (el) => (settings.showFps = el.checked));
  }

  // ------------------------------------------------------------------ match screens

  matchIntro(mode: MatchMode, mapId: string, players: [RosterEntry, RosterEntry], you: 0 | 1): void {
    const map = MAPS[mapId];
    const title = mode === 'ranked' ? 'RANKED DUEL' : mode === 'practice' ? 'PRACTICE DUEL' : 'DUEL';
    const card = (r: RosterEntry, mine: boolean) => {
      const c = CHARACTERS[r.char];
      const rank = r.mmr !== undefined ? rankBadge(rankOf(r.mmr, r.placements ?? 0), true) : '<span class="muted">AI</span>';
      return `<div class="vs-card ${mine ? 'mine' : ''}" style="--c1:${c.palette.primary};--c2:${c.palette.accent}"><div class="vs-name">${esc(r.name)}</div><div class="vs-char">${c.name} · ${c.weapon}</div>${rank}</div>`;
    };
    const el = h(`<div class="match-intro"><div class="mi-mode">${title}</div><div class="mi-map">${map?.name ?? ''}</div>
      <div class="mi-vs">${card(players[you], true)}<div class="vs">VS</div>${card(players[you === 0 ? 1 : 0], false)}</div>
      <div class="mi-desc">${esc(map?.description ?? '')}</div></div>`);
    this.hud.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3000);
    setTimeout(() => el.remove(), 3600);
  }

  showResult(r: Extract<ServerMsg, { t: 'result' }>, me: ProfileView | null): void {
    let ratingHtml = '';
    if (r.before && r.after && r.delta !== undefined) {
      const before = rankOf(r.before.mmr, r.before.placements);
      const after = rankOf(r.after.mmr, r.after.placements);
      // only talk about promotions once you're on the ladder (placement labels change every game)
      const changed = after.placed && before.label !== after.label;
      const promo = after.placed && (!before.placed || r.delta > 0);
      ratingHtml = `<div class="res-rating">
        <div class="res-delta ${r.delta >= 0 ? 'up' : 'down'}">${r.delta >= 0 ? '+' : ''}${r.delta} MMR</div>
        <div>${r.before.mmr} → <b>${r.after.mmr}</b></div>
        <div class="res-rank">${rankBadge(after)}</div>
        ${changed ? `<div class="res-promo ${promo ? 'up' : 'down'}">${!before.placed && after.placed ? 'PLACED!' : promo ? 'RANK UP!' : 'Demoted'}</div>` : ''}
        ${after.placed ? `<div class="pc-progress big"><div style="width:${Math.round(after.progress * 100)}%;background:${after.color}"></div></div>` : `<div class="muted">Placement ${r.after.placements}/${PLACEMENT_MATCHES}</div>`}
      </div>`;
    }
    const reason = r.reason === 'forfeit' ? (r.won ? 'Opponent forfeited' : 'You forfeited') : r.reason === 'timeout' ? 'Time' : '';
    const el = h(`<div class="result ${r.won ? 'win' : 'lose'}">
      <div class="res-title">${r.won ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="res-score">${r.scores.join(' - ')}${reason ? ` · ${reason}` : ''}</div>
      ${ratingHtml}
      <div class="muted">Returning to the lobby…</div></div>`);
    void me;
    this.hud.appendChild(el);
    setTimeout(() => el.classList.add('out'), 6300);
    setTimeout(() => el.remove(), 7000);
  }
}
