/* Rimoboy party mode: the only file that talks to Supabase (BUILD.md section 16).
   Needs window.supabase (supabase-js v2 UMD) and window.RB_PARTY (js/party-config.js).
   Host and phone share it. Data paths (16.3):
   - rooms.state: written by the host, read + watched (Postgres Changes) by the phones
   - people / votes: phones through RPCs and own vote rows; the host watches them
   - reactions: phones -> host over Realtime Broadcast on `rb-up-<room>`, sent with REST
     (httpSend), so phones never subscribe to it and never receive other phones' taps
   All channels are private (Realtime Authorization, policies on realtime.messages in
   party/schema.sql): only members can send reactions, only the host receives them.
   Exposes window.RBNet = {available(), joinUrl(code), normCode(s), baseUrl(), parseTime(s),
   cleanName(s), PartyNet, SEND_MS}. */
(function () {
  'use strict';
  const CFG = window.RB_PARTY || {};
  const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
  // a phone sends at most one reaction batch per this many ms. Measured (P1): 20 phones tapping
  // non-stop = about 39 realtime events/s; the free plan allows 100/s for the whole project.
  const SEND_MS = 800;
  const PRIV = { config: { private: true } };
  // the same characters the database refuses in a name (party/schema.sql people_name_clean)
  const BAD_NAME_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

  function available() {
    return !!(window.supabase && window.supabase.createClient && CFG.url && CFG.key) && navigator.onLine !== false;
  }

  // the public site the QR points to: this origin when it is a deployed https site, else the config
  function baseUrl() {
    const h = location.hostname;
    const local = location.protocol !== 'https:' || /^(localhost|127\.|\[::1\]|0\.0\.0\.0|10\.|192\.168\.)/.test(h) || h.endsWith('.local');
    return ((local && CFG.base) ? CFG.base : location.origin).replace(/\/+$/, '');
  }
  const joinUrl = (code) => `${baseUrl()}/party.html?r=${code}`;
  function normCode(s) {
    s = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return CODE_RE.test(s) ? s : null;
  }

  // Postgres timestamps have 6 fraction digits; keep 3 so every browser parses them
  function parseTime(s) {
    if (typeof s !== 'string') return NaN;
    return Date.parse(s.replace(/(\.\d{3})\d+/, '$1').replace(' ', 'T'));
  }
  // what the guest may type: no invisible or control characters, max 16 characters
  // (counted as code points, so an emoji is never cut in half)
  function cleanName(s) {
    return Array.from(String(s || '').replace(BAD_NAME_CHARS, '').trim()).slice(0, 16).join('').trim();
  }

  // readable error: {code, message}; PostgREST passes our RAISE errcodes through
  function fail(error) {
    const e = new Error((error && error.message) || String(error));
    e.code = error && error.code;
    return e;
  }

  class PartyNet {
    constructor(opts = {}) {
      this.sb = window.supabase.createClient(CFG.url, CFG.key, {
        auth: { storageKey: opts.storageKey || 'rb-party-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      });
      this.uid = null;
      this.code = null;
      this.state = null;
      this.offset = 0;          // server clock - local clock (ms)
      this.channels = [];
      this.upTx = null;         // send-only broadcast channel (phone)
    }

    async signIn() {
      const got = await this.sb.auth.getSession();
      let s = got.data && got.data.session;
      if (!s) {
        const r = await this.sb.auth.signInAnonymously();
        if (r.error) throw fail(r.error);
        s = r.data.session;
      }
      this.uid = s.user.id;
      return this.uid;
    }

    // server time from an RPC answer, assumed to be in the middle of the round trip
    syncClock(serverIso, t0, t1) {
      const server = parseTime(serverIso);
      if (!isNaN(server)) this.offset = server - (t0 + t1) / 2;
    }
    now() { return Date.now() + this.offset; }

    async rpc(fn, args) {
      const t0 = Date.now();
      const { data, error } = await this.sb.rpc(fn, args);
      const t1 = Date.now();
      if (error) throw fail(error);
      return { data, t0, t1 };
    }

    // ---------- host ----------

    // server clock for the host (seen_at, vote end); touch_room returns now() for any caller
    async syncNow() {
      const { data, t0, t1 } = await this.rpc('touch_room', { p_room: this.code || '' });
      this.syncClock(data, t0, t1);
    }

    async createRoom() {
      const { data } = await this.rpc('create_room');
      this.code = data;
      this.state = { phase: 'lobby' };
      return data;
    }

    // close a room that is no longer this.code (for "Нова стая": the new room exists first)
    async closeRoom(code, extra) {
      const { data, error } = await this.sb.from('rooms').select('state').eq('id', code).maybeSingle();
      if (error) throw fail(error);
      if (!data) return;
      const st = Object.assign({}, data.state, { phase: 'closed' }, extra || {});
      const r = await this.sb.from('rooms').update({ state: st }).eq('id', code);
      if (r.error) throw fail(r.error);
    }

    // reload a room after a page reload; null when it is gone or not ours
    async loadRoom(code) {
      const { data, error } = await this.sb.from('rooms').select('id, host, state').eq('id', code).maybeSingle();
      if (error) throw fail(error);
      if (!data || data.host !== this.uid) return null;
      this.code = data.id;
      this.state = data.state;
      return data;
    }

    // the host is the only writer of rooms.state, so a local merge is safe
    async patchState(patch) {
      this.state = Object.assign({}, this.state, patch);
      const { error } = await this.sb.from('rooms').update({ state: this.state }).eq('id', this.code);
      if (error) throw fail(error);
      return this.state;
    }

    async startRound(mode, left, right) {
      const { data } = await this.rpc('start_round', { p_room: this.code, p_mode: mode, p_left: left, p_right: right });
      // the round exists now: a failed re-read must not hide its number from the caller
      try { await this.loadRoom(this.code); } catch (e) { this.state = Object.assign({}, this.state, { phase: 'live', round: data, mode, part: 1, left, right, turn: null }); }
      return data;
    }

    async startVote(seconds) {
      const { data, t0, t1 } = await this.rpc('start_vote', { p_room: this.code, p_seconds: seconds });
      this.syncClock(data.now, t0, t1);
      await this.loadRoom(this.code);
      return data; // {round, voteEndsAt, now}
    }

    // ends the vote at once and returns {round, votes:[{uid, name, hidden, side, stars}], now}
    async finishVote() {
      const { data, t0, t1 } = await this.rpc('finish_vote', { p_room: this.code });
      this.syncClock(data.now, t0, t1);
      await this.loadRoom(this.code);
      return data;
    }

    async setHidden(uid, hidden) {
      await this.rpc('set_hidden', { p_room: this.code, p_uid: uid, p_hidden: hidden });
    }

    async saveRound(round, fields) {
      const { error } = await this.sb.from('rounds').update(fields).eq('room', this.code).eq('round', round);
      if (error) throw fail(error);
    }

    async people() {
      const { data, error } = await this.sb.from('people').select('*').eq('room', this.code);
      if (error) throw fail(error);
      return data;
    }

    async votes(round) {
      let q = this.sb.from('votes').select('*').eq('room', this.code);
      if (round != null) q = q.eq('round', round);
      const { data, error } = await q;
      if (error) throw fail(error);
      return data;
    }

    async rounds() {
      const { data, error } = await this.sb.from('rounds').select('*').eq('room', this.code).order('round');
      if (error) throw fail(error);
      return data;
    }

    // live feeds for the host: people joining/renaming, votes, reactions.
    // h = {onPeople(row, type), onVote(row, type), onReaction(payload), onStatus(name, status)}
    hostListen(h) {
      const code = this.code;
      const db = this.sb.channel(`rb-db-${code}`, PRIV)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'people', filter: `room=eq.${code}` },
          (p) => h.onPeople && h.onPeople(p.new, p.eventType))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'votes', filter: `room=eq.${code}` },
          (p) => h.onVote && h.onVote(p.new, p.eventType))
        .subscribe((st) => h.onStatus && h.onStatus('db', st));
      const up = this.sb.channel(`rb-up-${code}`, { config: { private: true, broadcast: { self: false } } })
        .on('broadcast', { event: 'r' }, (m) => h.onReaction && h.onReaction(m.payload))
        .subscribe((st) => h.onStatus && h.onStatus('up', st));
      this.channels.push(db, up);
    }

    // ---------- phone ----------

    async join(code, name) {
      const { data, t0, t1 } = await this.rpc('join_room', { p_room: code, p_name: name });
      this.code = data.room;
      this.state = data.state;
      this.syncClock(data.now, t0, t1);
      return data.state;
    }

    // re-read the state (after a reconnect or when the phone wakes up)
    async readState() {
      const { data, error } = await this.sb.from('rooms').select('state').eq('id', this.code).maybeSingle();
      if (error) throw fail(error);
      if (data) this.state = data.state;
      return this.state;
    }

    // h = {onState(state), onStatus(status)}
    watchRoom(h) {
      const ch = this.sb.channel(`rb-room-${this.code}`, PRIV)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${this.code}` },
          (p) => { this.state = p.new.state; h.onState && h.onState(this.state); })
        .subscribe((st) => h.onStatus && h.onStatus(st));
      this.channels.push(ch);
      return ch;
    }

    // payload = {uid, e, nL, nR, totL, totR, round, at}; REST, so no subscription is needed.
    // Resolves {success: true} on 202; rejects on any other answer (403 = not a member).
    sendUp(payload) {
      if (!this.upTx) this.upTx = this.sb.channel(`rb-up-${this.code}`, PRIV);
      return this.upTx.httpSend('r', payload);
    }

    async vote(round, side, stars) {
      const { error } = await this.sb.from('votes')
        .upsert({ room: this.code, round, uid: this.uid, side, stars }, { onConflict: 'room,round,uid,side' });
      if (error) throw fail(error);
    }

    async touch() {
      const { data, t0, t1 } = await this.rpc('touch_room', { p_room: this.code });
      this.syncClock(data, t0, t1);
    }

    // stop the live feeds but keep the connection (the host switches rooms with this)
    async unlisten() {
      for (const ch of this.channels) { try { await this.sb.removeChannel(ch); } catch (e) { /* ignore */ } }
      this.channels = [];
    }

    async close() {
      await this.unlisten();
      if (this.upTx) { try { await this.sb.removeChannel(this.upTx); } catch (e) { /* ignore */ } this.upTx = null; }
      try { this.sb.realtime.disconnect(); } catch (e) { /* ignore */ }
    }
  }

  window.RBNet = { available, joinUrl, normCode, baseUrl, parseTime, cleanName, PartyNet, SEND_MS };
})();
