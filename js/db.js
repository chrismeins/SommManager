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
// MD5 — pure JS, matches PostgreSQL md5() output exactly
function md5(str) {
  function rh(n){var h="0123456789abcdef",s="";for(var j=0;j<=3;j++)s+=h[(n>>(j*8+4))&0xF]+h[(n>>(j*8))&0xF];return s;}
  function ad(x,y){var l=(x&0xFFFF)+(y&0xFFFF),m=(x>>16)+(y>>16)+(l>>16);return(m<<16)|(l&0xFFFF);}
  function rl(n,c){return(n<<c)|(n>>>(32-c));}
  function cm(q,a,b,x,s,t){return ad(rl(ad(ad(a,q),ad(x,t)),s),b);}
  function ff(a,b,c,d,x,s,t){return cm((b&c)|((~b)&d),a,b,x,s,t);}
  function gg(a,b,c,d,x,s,t){return cm((b&d)|(c&(~d)),a,b,x,s,t);}
  function hh(a,b,c,d,x,s,t){return cm(b^c^d,a,b,x,s,t);}
  function ii(a,b,c,d,x,s,t){return cm(c^(b|(~d)),a,b,x,s,t);}
  function sb(x){var i,nb=((x.length+8)>>6)+1,bl=new Array(nb*16);for(i=0;i<nb*16;i++)bl[i]=0;for(i=0;i<x.length;i++)bl[i>>2]|=x.charCodeAt(i)<<((i%4)*8);bl[i>>2]|=0x80<<((i%4)*8);bl[nb*16-2]=x.length*8;return bl;}
  var x=sb(str),a=1732584193,b=-271733879,c=-1732584194,d=271733878,oa,ob,oc,od;
  for(var i=0;i<x.length;i+=16){
    oa=a;ob=b;oc=c;od=d;
    a=ff(a,b,c,d,x[i],7,-680876936);d=ff(d,a,b,c,x[i+1],12,-389564586);c=ff(c,d,a,b,x[i+2],17,606105819);b=ff(b,c,d,a,x[i+3],22,-1044525330);
    a=ff(a,b,c,d,x[i+4],7,-176418897);d=ff(d,a,b,c,x[i+5],12,1200080426);c=ff(c,d,a,b,x[i+6],17,-1473231341);b=ff(b,c,d,a,x[i+7],22,-45705983);
    a=ff(a,b,c,d,x[i+8],7,1770035416);d=ff(d,a,b,c,x[i+9],12,-1958414417);c=ff(c,d,a,b,x[i+10],17,-42063);b=ff(b,c,d,a,x[i+11],22,-1990404162);
    a=ff(a,b,c,d,x[i+12],7,1804603682);d=ff(d,a,b,c,x[i+13],12,-40341101);c=ff(c,d,a,b,x[i+14],17,-1502002290);b=ff(b,c,d,a,x[i+15],22,1236535329);
    a=gg(a,b,c,d,x[i+1],5,-165796510);d=gg(d,a,b,c,x[i+6],9,-1069501632);c=gg(c,d,a,b,x[i+11],14,643717713);b=gg(b,c,d,a,x[i],20,-373897302);
    a=gg(a,b,c,d,x[i+5],5,-701558691);d=gg(d,a,b,c,x[i+10],9,38016083);c=gg(c,d,a,b,x[i+15],14,-660478335);b=gg(b,c,d,a,x[i+4],20,-405537848);
    a=gg(a,b,c,d,x[i+9],5,568446438);d=gg(d,a,b,c,x[i+14],9,-1019803690);c=gg(c,d,a,b,x[i+3],14,-187363961);b=gg(b,c,d,a,x[i+8],20,1163531501);
    a=gg(a,b,c,d,x[i+13],5,-1444681467);d=gg(d,a,b,c,x[i+2],9,-51403784);c=gg(c,d,a,b,x[i+7],14,1735328473);b=gg(b,c,d,a,x[i+12],20,-1926607734);
    a=hh(a,b,c,d,x[i+5],4,-378558);d=hh(d,a,b,c,x[i+8],11,-2022574463);c=hh(c,d,a,b,x[i+11],16,1839030562);b=hh(b,c,d,a,x[i+14],23,-35309556);
    a=hh(a,b,c,d,x[i+1],4,-1530992060);d=hh(d,a,b,c,x[i+4],11,1272893353);c=hh(c,d,a,b,x[i+7],16,-155497632);b=hh(b,c,d,a,x[i+10],23,-1094730640);
    a=hh(a,b,c,d,x[i+13],4,681279174);d=hh(d,a,b,c,x[i],11,-358537222);c=hh(c,d,a,b,x[i+3],16,-722521979);b=hh(b,c,d,a,x[i+6],23,76029189);
    a=hh(a,b,c,d,x[i+9],4,-640364487);d=hh(d,a,b,c,x[i+12],11,-421815835);c=hh(c,d,a,b,x[i+15],16,530742520);b=hh(b,c,d,a,x[i+2],23,-995338651);
    a=ii(a,b,c,d,x[i],6,-198630844);d=ii(d,a,b,c,x[i+7],10,1126891415);c=ii(c,d,a,b,x[i+14],15,-1416354905);b=ii(b,c,d,a,x[i+5],21,-57434055);
    a=ii(a,b,c,d,x[i+12],6,1700485571);d=ii(d,a,b,c,x[i+3],10,-1894986606);c=ii(c,d,a,b,x[i+10],15,-1051523);b=ii(b,c,d,a,x[i+1],21,-2054922799);
    a=ii(a,b,c,d,x[i+8],6,1873313359);d=ii(d,a,b,c,x[i+15],10,-30611744);c=ii(c,d,a,b,x[i+6],15,-1560198380);b=ii(b,c,d,a,x[i+13],21,1309151649);
    a=ii(a,b,c,d,x[i+4],6,-145523070);d=ii(d,a,b,c,x[i+11],10,-1120210379);c=ii(c,d,a,b,x[i+2],15,718787259);b=ii(b,c,d,a,x[i+9],21,-343485551);
    a=ad(a,oa);b=ad(b,ob);c=ad(c,oc);d=ad(d,od);
  }
  return rh(a)+rh(b)+rh(c)+rh(d);
}

async function dbCheckPin(pin) {
  // Try Supabase first
  if (DB_ONLINE && SB) {
    try {
      const pinHash = md5(pin); // sync now
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

// ── RECALCULATE PAIR STOCK + ABC ─────────────────────
// Called after every XLS import.
// Reads wine_consumption from DB, recalculates cons_dia,
// pair_stock, est_min_adega, repos_quinzenal, abc_class
// and updates all wines in one batch.
async function dbRecalcPairStock(ano, nMeses) {
  if (!DB_ONLINE || !SB) throw new Error('Banco offline');

  const diasBase = nMeses * 30;

  // 1. Aggregate total consumption per wine for the given year
  const { data: cons, error: cErr } = await SB
    .from('wine_consumption')
    .select('wine_id, quantidade')
    .eq('ano', ano);
  if (cErr) throw cErr;

  // Sum by wine
  const totals = {};
  (cons || []).forEach(c => {
    totals[c.wine_id] = (totals[c.wine_id] || 0) + c.quantidade;
  });

  if (!Object.keys(totals).length) return;

  // 2. Calculate ABC thresholds
  const volumes = Object.values(totals).sort((a,b) => b-a);
  const totalVol = volumes.reduce((s,v) => s+v, 0);
  let cum = 0, threshA = 0, threshB = 0;
  for (const v of volumes) {
    cum += v;
    if (!threshA && cum / totalVol >= 0.70) threshA = v;
    if (!threshB && cum / totalVol >= 0.90) threshB = v;
  }

  // 3. Build update payload for each wine
  const updates = Object.entries(totals).map(([wine_id, total]) => {
    const cons_dia         = total / diasBase;
    const pair_stock       = Math.max(1, Math.ceil(cons_dia * 1.3));
    const est_min_adega    = pair_stock * 2;
    const repos_quinzenal  = Math.max(1, Math.ceil(cons_dia * 15 * 1.2));
    const abc_class        = total >= threshA ? 'A' : total >= threshB ? 'B' : 'C';
    return { id: wine_id, cons_dia: parseFloat(cons_dia.toFixed(3)), pair_stock, est_min_adega, repos_quinzenal, abc_class, dias_base: diasBase };
  });

  // 4. Upsert in chunks of 50
  const CHUNK = 50;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const { error } = await SB.from('wines').upsert(updates.slice(i, i + CHUNK), { onConflict: 'id' });
    if (error) throw error;
  }

  console.log(`[DB] Recalc done: ${updates.length} wines, diasBase=${diasBase}, totalVol=${totalVol}`);
}
