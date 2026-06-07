// ═══════════════════════════════════════════════════
// DB.JS — Todas as operações Supabase
// ═══════════════════════════════════════════════════

let SB = null;
let DB_ONLINE = false;

// ── INIT ─────────────────────────────────────────────
async function dbInit() {
  setBanner('syncing', 'Conectando ao banco...');
  try {
    SB = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error } = await SB.from('users').select('id', { count: 'exact', head: true });
    if (error) throw error;
    DB_ONLINE = true;
    setBanner('online', 'Supabase conectado ✓');
    console.log('[DB] Online');
  } catch (e) {
    DB_ONLINE = false;
    setBanner('offline', 'Erro de conexão: ' + (e.message || e));
    console.error('[DB] Offline:', e);
    throw e; // propagate so login screen shows error
  }
}

// ── AUTH ─────────────────────────────────────────────
async function dbCheckPin(pin) {
  // Try Supabase first
  if (DB_ONLINE && SB) {
    try {
      const pinHash = await md5(pin);
      const { data } = await SB
        .from('users')
        .select('nome, role')
        .eq('pin_hash', pinHash)
        .eq('ativo', true)
        .single();
      if (data) {
        // Update last access
        SB.from('users').update({ ultimo_acesso: new Date().toISOString() })
          .eq('pin_hash', pinHash).then(() => {});
        return data;
      }
    } catch (e) {
      console.warn('[DB] Pin check error, trying local:', e.message);
    }
  }
  // Fallback to local (development only)
  return USERS_LOCAL[pin] || null;
}

// Simple MD5 using SubtleCrypto (async, for browser)
async function md5(str) {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('MD5', msgBuffer).catch(() => null);
  if (!hashBuffer) {
    // MD5 not available in all browsers — use a simple hash for dev fallback
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    return Math.abs(hash).toString(16);
  }
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── LOAD ALL DATA ─────────────────────────────────────
async function dbLoad() {
  if (!DB_ONLINE || !SB) throw new Error('Banco offline');

  ldMsg('Carregando vinhos...');
  const { data: wData, error: wErr } = await SB
    .from('wines').select('*').order('cons_dia', { ascending: false });
  if (wErr) throw wErr;

  wines = wData.map(w => ({
    uuid:            w.id,
    cod:             w.cod_erp,
    nome:            w.nome,
    formato:         w.formato_ml === 375 ? '375ml' : w.formato_ml === 1500 ? 'Magnum' : '750ml',
    formato_ml:      w.formato_ml,
    tipo:            w.tipo,
    abc:             w.abc_class,
    status:          w.status,
    cons_dia:        parseFloat(w.cons_dia) || 0,
    pair_stock:      w.pair_stock || 1,
    est_min:         w.est_min_adega || 2,
    repos_quinzenal: w.repos_quinzenal || 1,
    preco_custo:     parseFloat(w.preco_custo) || 0,
    preco_venda:     parseFloat(w.preco_venda) || 0,
    notas_servico:   w.notas_servico || '',
    // Monthly data comes from wine_consumption separately
    qtde_5m: 0, monthly: [0,0,0,0,0], subs: []
  }));

  ldMsg('Consumo histórico...');
  const { data: cData } = await SB
    .from('wine_consumption')
    .select('wine_id, ano, mes, quantidade')
    .eq('ano', 2026)
    .in('mes', [1,2,3,4,5]);

  if (cData?.length) {
    const byWine = {};
    cData.forEach(c => {
      if (!byWine[c.wine_id]) byWine[c.wine_id] = [0,0,0,0,0];
      byWine[c.wine_id][c.mes - 1] += c.quantidade;
    });
    wines.forEach(w => {
      const m = byWine[w.uuid] || [0,0,0,0,0];
      w.monthly  = m;
      w.qtde_5m  = m.reduce((a,b) => a+b, 0);
    });
  }

  ldMsg('Substituições...');
  const { data: sData } = await SB
    .from('wine_substitutions').select('*').eq('ativo', true);

  if (sData?.length) {
    const uN = Object.fromEntries(wines.map(w => [w.uuid, w.nome]));
    subs = sData.map(s => ({
      id:           s.id,
      origem_id:    s.wine_origem_id,
      destino_id:   s.wine_destino_id,
      origem_nome:  uN[s.wine_origem_id]  || '?',
      destino_nome: uN[s.wine_destino_id] || '?',
      tipo:         s.tipo,
      motivo:       s.motivo || '',
      prioridade:   s.prioridade || 1,
      ativo:        s.ativo
    }));
    wines.forEach(w => { w.subs = subs.filter(s => s.origem_id === w.uuid); });
  } else {
    subs = [];
  }

  ldMsg('Harmonizações...');
  const { data: hData } = await SB
    .from('harmonizations').select('*').eq('ativo', true);
  harmonizations_db = hData || [];

  ldMsg('KPIs...');
  const { data: kData } = await SB
    .from('kpi_entries').select('*').order('data', { ascending: false }).limit(60);
  if (kData?.length) {
    const seen = {};
    kData.forEach(k => { if (!seen[k.kpi_key]) seen[k.kpi_key] = parseFloat(k.valor); });
    kpiVals = { ...kpiVals, ...seen };
  }

  ldMsg('Campeonato...');
  const { data: gData } = await SB
    .from('garcon_results').select('*').order('score', { ascending: false });
  garcons = gData || [];

  ldMsg('Estoque atual...');
  const today = new Date().toISOString().split('T')[0];
  const { data: sfData } = await SB
    .from('stock_floor').select('wine_id, quantidade, data, turno')
    .gte('data', today).order('data', { ascending: false });
  if (sfData?.length) {
    const seen = {};
    sfData.forEach(r => {
      const key = r.wine_id;
      if (!seen[key]) { estoque[key] = r.quantidade; seen[key] = true; }
    });
  }

  ldMsg('Almoxarifado...');
  const { data: swData } = await SB
    .from('stock_warehouse').select('wine_id, quantidade, data')
    .order('data', { ascending: false });
  if (swData?.length) {
    const seen = {};
    swData.forEach(r => {
      if (!seen[r.wine_id]) { almox[r.wine_id] = r.quantidade; seen[r.wine_id] = true; }
    });
  }

  console.log(`[DB] Loaded: ${wines.length} wines, ${subs.length} subs, ${garcons.length} garcons`);
}

// ── SAVERS ────────────────────────────────────────────
async function dbSaveStock(uuid, qty, type) {
  if (!DB_ONLINE || !SB || !uuid?.includes('-')) return;
  const today = new Date().toISOString().split('T')[0];
  try {
    if (type === 'floor') {
      const hr = new Date().getHours();
      const turno = hr < 14 ? 'abertura' : hr < 17 ? '15h' : 'fechamento';
      await SB.from('stock_floor').upsert(
        { wine_id: uuid, data: today, turno, quantidade: qty },
        { onConflict: 'wine_id,data,turno' }
      );
    } else {
      await SB.from('stock_warehouse').upsert(
        { wine_id: uuid, data: today, quantidade: qty },
        { onConflict: 'wine_id,data' }
      );
    }
  } catch (e) { console.warn('[DB] saveStock:', e.message); }
}

async function dbSaveKPI(key, val) {
  if (!DB_ONLINE || !SB) return;
  const today = new Date().toISOString().split('T')[0];
  try {
    await SB.from('kpi_entries').upsert(
      { data: today, kpi_key: key, valor: val, fonte: 'manual' },
      { onConflict: 'data,kpi_key' }
    );
  } catch (e) { console.warn('[DB] saveKPI:', e.message); }
}

async function dbSaveSub(sub) {
  if (!DB_ONLINE || !SB) return null;
  try {
    const { data, error } = await SB.from('wine_substitutions').insert({
      wine_origem_id:  sub.origem_id,
      wine_destino_id: sub.destino_id,
      tipo:            sub.tipo,
      motivo:          sub.motivo,
      prioridade:      sub.prioridade,
      ativo:           true
    }).select().single();
    if (error) throw error;
    return data;
  } catch (e) { console.warn('[DB] saveSub:', e.message); return null; }
}

async function dbToggleSub(id, ativo) {
  if (!DB_ONLINE || !SB || !id?.includes('-')) return;
  try { await SB.from('wine_substitutions').update({ ativo }).eq('id', id); } catch (e) {}
}

async function dbDeleteSub(id) {
  if (!DB_ONLINE || !SB || !id?.includes('-')) return;
  try { await SB.from('wine_substitutions').delete().eq('id', id); } catch (e) {}
}

async function dbSaveWine(payload) {
  if (!DB_ONLINE || !SB) return null;
  const row = {
    cod_erp:         payload.cod || null,
    nome:            payload.nome,
    formato_ml:      payload.formato_ml || 750,
    tipo:            payload.tipo || 'tinto',
    status:          payload.status || 'em_revisao',
    pair_stock:      payload.pair_stock || 1,
    est_min_adega:   (payload.pair_stock || 1) * 2,
    repos_quinzenal: Math.ceil((payload.pair_stock || 1) / 1.3 * 15 * 1.2),
    preco_custo:     payload.preco_custo || 0,
    preco_venda:     payload.preco_venda || 0,
    notas_servico:   payload.notas_servico || ''
  };
  try {
    if (payload.uuid?.includes('-')) {
      const { data, error } = await SB.from('wines').update(row).eq('id', payload.uuid).select().single();
      if (error) throw error; return data;
    } else {
      const { data, error } = await SB.from('wines').insert(row).select().single();
      if (error) throw error; return data;
    }
  } catch (e) { console.warn('[DB] saveWine:', e.message); return null; }
}

async function dbDeleteWine(uuid) {
  if (!DB_ONLINE || !SB || !uuid?.includes('-')) return;
  try {
    await SB.from('wines').update({ status: 'inativo' }).eq('id', uuid);
  } catch (e) { console.warn('[DB] deleteWine:', e.message); }
}

async function dbSaveGarcon(g) {
  if (!DB_ONLINE || !SB) return null;
  try {
    const { data, error } = await SB.from('garcon_results').insert({
      nome_garcon:     g.nome,
      periodo:         g.periodo,
      mesas:           g.mesas,
      mesas_com_vinho: g.com_vinho,
      mesas_com_gfa:   g.com_gfa,
      mesas_duas_gfa:  g.duas_gfa,
      receita_vinho:   g.receita
    }).select().single();
    if (error) throw error; return data;
  } catch (e) { console.warn('[DB] saveGarcon:', e.message); return null; }
}
