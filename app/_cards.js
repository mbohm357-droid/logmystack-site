/* LogMyStack — shared protocol-card data layer.
 *
 * Backs the card surfaces (/app/feed/, /app/create/, /app/my/, /app/saved/)
 * with Supabase so cards, likes, comments and saves are shared across every
 * signed-in user — i.e. the feed is genuinely cross-user.
 *
 * Tables (see supabase/migrations/20260516000000_card_social_schema.sql):
 *   cards          — every protocol card (public + drafts)
 *   card_comments  — comments, visible to everyone
 *   card_likes     — one row per (user, card)
 *   card_saves     — one row per (user, card) — personal bookmarks
 *
 * Depends on /app/_auth.js (must load first) for window.lms:
 *   lms.sb            — Supabase client
 *   lms.currentUser   — authed user (or null)
 *   lms.displayName() — best-effort handle
 *
 * Public API on window.lmsCards — every method is async unless noted:
 *   getFeed()                  → [card]            public cards, newest first
 *   getMyCards()               → {published, drafts}
 *   getSavedCards()            → [card]            cards the user bookmarked
 *   getCard(id)                → card | null
 *   saveCard(card, visibility) → card              insert or update (by id)
 *   deleteCard(id)             → true
 *   publishDraft(id)           → true              flip a draft to public
 *   toggleLike(id, liked)      → bool              new liked state
 *   toggleSave(id, saved)      → bool              new saved state
 *   getComments(id)            → [comment]
 *   addComment(id, body)       → comment
 *   relAge(iso)                → "3d" (sync helper)
 *   newId()                    → fresh card id (sync helper)
 *
 * card    = { id, author, authorId, title, setId, tier, weeks, weekProgress,
 *             compounds, stats, notes, vendor, verified, visibility,
 *             likes, comments, createdAt, age, liked, saved }
 * comment = { id, author, text, timestamp }
 */
(function () {
  function sb() {
    if (!window.lms || !window.lms.sb) {
      throw new Error('_cards.js: window.lms.sb missing — load /app/_auth.js first');
    }
    return window.lms.sb;
  }
  function uid() {
    return (window.lms && window.lms.currentUser && window.lms.currentUser.id) || null;
  }
  function handle() {
    try { return (window.lms && window.lms.displayName && window.lms.displayName()) || 'user'; }
    catch (e) { return 'user'; }
  }

  // ---------------- helpers ----------------
  function relAge(iso) {
    if (!iso) return 'just now';
    const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return 'just now';
    if (sec < 3600) return Math.floor(sec / 60) + 'm';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h';
    if (sec < 604800) return Math.floor(sec / 86400) + 'd';
    if (sec < 2592000) return Math.floor(sec / 604800) + 'w';
    if (sec < 31536000) return Math.floor(sec / 2592000) + 'mo';
    return Math.floor(sec / 31536000) + 'y';
  }

  function newId() {
    if (window.crypto && window.crypto.randomUUID) {
      return 'card-' + window.crypto.randomUUID();
    }
    return 'card-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  // DB row (snake_case) → frontend card object (camelCase).
  function rowToCard(row, likedSet, savedSet) {
    return {
      id: row.id,
      author: row.author_name || 'user',
      authorId: row.author_id || null,
      title: row.title || 'Untitled',
      setId: row.set_id || '',
      tier: row.tier || 'common',
      weeks: row.weeks != null ? row.weeks : 0,
      weekProgress: row.week_progress != null ? row.week_progress : 0,
      compounds: Array.isArray(row.compounds) ? row.compounds : [],
      stats: Array.isArray(row.stats) ? row.stats.filter(Boolean) : [],
      notes: row.notes || '',
      vendor: row.vendor || '',
      verified: !!row.verified,
      visibility: row.visibility || 'public',
      likes: row.likes != null ? row.likes : 0,
      comments: row.comments != null ? row.comments : 0,
      createdAt: row.created_at || null,
      age: relAge(row.created_at),
      liked: likedSet ? likedSet.has(row.id) : false,
      saved: savedSet ? savedSet.has(row.id) : false,
    };
  }

  // Frontend card object → DB row for insert/update.
  // Deliberately omits likes / comments / created_at / updated_at — those are
  // owned by the DB defaults and the count-sync triggers.
  function cardToRow(card, visibility) {
    return {
      id: card.id || newId(),
      author_id: uid(),
      author_name: handle(),
      title: card.title || 'Untitled',
      set_id: card.setId || null,
      tier: card.tier || 'common',
      weeks: card.weeks != null ? card.weeks : null,
      week_progress: card.weekProgress != null ? card.weekProgress : null,
      compounds: Array.isArray(card.compounds) ? card.compounds : [],
      stats: Array.isArray(card.stats) ? card.stats.filter(Boolean) : [],
      notes: card.notes || null,
      vendor: card.vendor || null,
      verified: !!card.verified,
      visibility: visibility || card.visibility || 'public',
    };
  }

  // Sets of card ids the current user has liked / saved — used to light up
  // the like + bookmark icons.
  async function likedSet() {
    const u = uid();
    if (!u) return new Set();
    const { data, error } = await sb()
      .from('card_likes').select('card_id').eq('user_id', u);
    if (error) { console.error('[lmsCards] likedSet:', error.message); return new Set(); }
    return new Set((data || []).map(r => r.card_id));
  }
  async function savedSet() {
    const u = uid();
    if (!u) return new Set();
    const { data, error } = await sb()
      .from('card_saves').select('card_id').eq('user_id', u);
    if (error) { console.error('[lmsCards] savedSet:', error.message); return new Set(); }
    return new Set((data || []).map(r => r.card_id));
  }

  // ---------------- reads ----------------
  async function getFeed() {
    const { data: rows, error } = await sb()
      .from('cards')
      .select('*')
      .eq('visibility', 'public')
      .order('created_at', { ascending: false });
    if (error) { console.error('[lmsCards] getFeed:', error.message); throw error; }
    const [liked, saved] = await Promise.all([likedSet(), savedSet()]);
    return (rows || []).map(r => rowToCard(r, liked, saved));
  }

  async function getMyCards() {
    const u = uid();
    if (!u) return { published: [], drafts: [] };
    const { data: rows, error } = await sb()
      .from('cards')
      .select('*')
      .eq('author_id', u)
      .order('created_at', { ascending: false });
    if (error) { console.error('[lmsCards] getMyCards:', error.message); throw error; }
    const [liked, saved] = await Promise.all([likedSet(), savedSet()]);
    const cards = (rows || []).map(r => rowToCard(r, liked, saved));
    return {
      published: cards.filter(c => c.visibility === 'public'),
      drafts: cards.filter(c => c.visibility === 'draft'),
    };
  }

  async function getSavedCards() {
    const u = uid();
    if (!u) return [];
    // Embed the joined card row via the card_saves.card_id → cards.id FK.
    const { data, error } = await sb()
      .from('card_saves')
      .select('created_at, cards(*)')
      .eq('user_id', u)
      .order('created_at', { ascending: false });
    if (error) { console.error('[lmsCards] getSavedCards:', error.message); throw error; }
    const liked = await likedSet();
    const allSaved = new Set();
    (data || []).forEach(r => { if (r.cards) allSaved.add(r.cards.id); });
    return (data || [])
      .filter(r => r.cards)               // card may be a draft / deleted → RLS hides it
      .map(r => {
        const c = rowToCard(r.cards, liked, allSaved);
        c.saved = true;
        c.savedAt = r.created_at;
        return c;
      });
  }

  async function getCard(id) {
    const { data, error } = await sb()
      .from('cards').select('*').eq('id', id).maybeSingle();
    if (error) { console.error('[lmsCards] getCard:', error.message); return null; }
    if (!data) return null;
    const [liked, saved] = await Promise.all([likedSet(), savedSet()]);
    return rowToCard(data, liked, saved);
  }

  // ---------------- writes ----------------
  async function saveCard(card, visibility) {
    const row = cardToRow(card, visibility);
    if (!row.author_id) throw new Error('not signed in');
    const { data, error } = await sb()
      .from('cards').upsert(row).select().maybeSingle();
    if (error) { console.error('[lmsCards] saveCard:', error.message); throw error; }
    return data ? rowToCard(data) : rowToCard(row);
  }

  async function deleteCard(id) {
    const { error } = await sb().from('cards').delete().eq('id', id);
    if (error) { console.error('[lmsCards] deleteCard:', error.message); throw error; }
    return true;
  }

  async function publishDraft(id) {
    const { error } = await sb()
      .from('cards').update({ visibility: 'public' }).eq('id', id);
    if (error) { console.error('[lmsCards] publishDraft:', error.message); throw error; }
    return true;
  }

  async function toggleLike(cardId, liked) {
    const u = uid();
    if (!u) throw new Error('not signed in');
    if (liked) {
      const { error } = await sb()
        .from('card_likes').delete().eq('card_id', cardId).eq('user_id', u);
      if (error) { console.error('[lmsCards] unlike:', error.message); throw error; }
      return false;
    }
    const { error } = await sb()
      .from('card_likes').insert({ card_id: cardId, user_id: u });
    if (error) { console.error('[lmsCards] like:', error.message); throw error; }
    return true;
  }

  async function toggleSave(cardId, saved) {
    const u = uid();
    if (!u) throw new Error('not signed in');
    if (saved) {
      const { error } = await sb()
        .from('card_saves').delete().eq('card_id', cardId).eq('user_id', u);
      if (error) { console.error('[lmsCards] unsave:', error.message); throw error; }
      return false;
    }
    const { error } = await sb()
      .from('card_saves').insert({ card_id: cardId, user_id: u });
    if (error) { console.error('[lmsCards] save:', error.message); throw error; }
    return true;
  }

  // ---------------- comments ----------------
  function commentRowToObj(r) {
    return {
      id: r.id,
      author: r.author_name || 'user',
      text: r.body || '',
      timestamp: r.created_at || new Date().toISOString(),
    };
  }

  async function getComments(cardId) {
    const { data, error } = await sb()
      .from('card_comments')
      .select('*')
      .eq('card_id', cardId)
      .order('created_at', { ascending: true });
    if (error) { console.error('[lmsCards] getComments:', error.message); return []; }
    return (data || []).map(commentRowToObj);
  }

  async function addComment(cardId, body) {
    const u = uid();
    if (!u) throw new Error('not signed in');
    const { data, error } = await sb()
      .from('card_comments')
      .insert({ card_id: cardId, author_id: u, author_name: handle(), body: body })
      .select().maybeSingle();
    if (error) { console.error('[lmsCards] addComment:', error.message); throw error; }
    return data
      ? commentRowToObj(data)
      : { id: null, author: handle(), text: body, timestamp: new Date().toISOString() };
  }

  window.lmsCards = {
    getFeed,
    getMyCards,
    getSavedCards,
    getCard,
    saveCard,
    deleteCard,
    publishDraft,
    toggleLike,
    toggleSave,
    getComments,
    addComment,
    relAge,
    newId,
  };
})();
