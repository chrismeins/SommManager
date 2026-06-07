// ═══════════════════════════════════════════════════
// APP.JS — Estado global e todas as funções de UI
// ═══════════════════════════════════════════════════

// ── STATE ─────────────────────────────────────────────
let currentUser = null;
let pinVal      = '';
let wines       = [];
let subs        = [];
let garcons     = [];
let harmonizations_db = [];
let kpiVals     = { ticket_medio:165, garrafa_pct:72, penetracao_pct:58, segunda_garrafa_pct:18 };
let estoque     = {};  // uuid → quantity (adega do andar)
let almox       = {};  // uuid → quantity (almoxarifado)

let fCtrl='all', fPS='all', fSub='all', fTC='all', fCarta='all';
let editWineUuid = null;

const PAGES = {
  dashboard:'Dashboard', controle:'Controle Diário', pairstock:'Pair Stock',
  reposicao:'Reposição Quinzenal', substituicoes:'Substituições & Upselling',
  harmonizacao:'Harmonização', import:'Importar XLS', tacas:'Gestão de Taças',
  carta:'Carta de Vinhos', kpis:'KPIs & Metas', garcons:'Campeonato de Garçons'
};

// ── BOOT ──────────────────────────────────────────────
(async () => {
  // 1. Try to connect to Supabase
  try {
    await dbInit();
  } catch(e) {
    showPinError('Não foi possível conectar ao banco de dados. Verifique sua conexão.');
    return;
  }
  // 2. Show PIN screen (ready)
  document.getElementById('pin-sync').textContent = '✓ Banco conectado — digite seu PIN';
  document.getElementById('pin-hint').style.display = 'block';
})();

// ── PIN ────────────────────────────────────────────────
function pp(d) {
  if (pinVal.length >= 4) return;
  pinVal += d;
  updPinDots();
  if (pinVal.length === 4) setTimeout(checkPin, 140);
}
function pclr() { pinVal = pinVal.slice(0,-1); updPinDots(); }
function prst() { pinVal = ''; updPinDots(); document.getElementById('pin-err').textContent = ''; }
function updPinDots() {
  for (let i=0; i<4; i++) document.getElementById('pd'+i).classList.toggle('filled', i<pinVal.length);
}
function showPinError(msg) {
  document.getElementById('pin-err').textContent = msg;
  pinVal = ''; updPinDots();
}

async function checkPin() {
  document.getElementById('pin-err').textContent = 'Verificando...';
  const user = await dbCheckPin(pinVal);
  if (user) {
    currentUser = user;
    document.getElementById('pin-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    setupRole();
    // Load all data then render
    ldShow('Carregando dados...', 'Buscando do Supabase');
    try {
      await dbLoad();
    } catch(e) {
      ldHide();
      alert('Erro ao carregar dados: ' + e.message);
      return;
    }
    ldHide();
    initApp();
  } else {
    showPinError('PIN incorreto. Tente novamente.');
  }
}

function doLogout() {
  if (!confirm('Sair do sistema?')) return;
  currentUser = null; pinVal = ''; updPinDots();
  document.getElementById('pin-err').textContent = '';
  document.getElementById('pin-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  wines=[]; subs=[]; garcons=[]; estoque={}; almox={};
}

// ── ROLE ───────────────────────────────────────────────
function setupRole() {
  const r = currentUser.role;
  document.getElementById('s-uname').textContent = currentUser.nome;
  document.getElementById('tb-role').textContent = r.charAt(0).toUpperCase() + r.slice(1);
  document.getElementById('tb-role').className = 'role-badge role-' + r;
  document.querySelectorAll('.s-only').forEach(el => el.classList.toggle('vis', r === 'sommelier'));
  document.querySelectorAll('.s-maitre').forEach(el => el.classList.toggle('vis', r !== 'staff'));
}

// ── NAVIGATION ─────────────────────────────────────────
function go(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.ni').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + id)?.classList.add('active');
  document.querySelectorAll('.ni').forEach(n => {
    if (n.getAttribute('onclick')?.includes("'"+id+"'")) n.classList.add('active');
  });
  document.getElementById('pg-title').textContent = PAGES[id] || id;
  // Render on demand
  const renders = { controle:renderControle, pairstock:renderPS, reposicao:renderReposicao,
    substituicoes:renderSubs, tacas:renderTC, carta:renderCarta, garcons:renderGarcons };
  renders[id]?.();
}

// ── INIT ───────────────────────────────────────────────
function initApp() {
  document.getElementById('tb-date').textContent =
    new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
  populateSubSelects();
  renderDashboard();
  renderControle();
  renderPS();
  renderReposicao();
  renderSubs();
  renderHarmonizacao();
  renderTC();
  renderCarta();
  renderKPIs();
  renderGarcons();
  updRupBadge();
  updateKPICards();
  go('dashboard');
}

// ── HELPERS ────────────────────────────────────────────
function getWine(key) {
  return wines.find(w => w.uuid===key || w.cod===parseInt(key));
}
function getEst(w)   { return estoque[w.uuid]; }
function getAlmx(w)  { return almox[w.uuid]; }
function getStatus(w) {
  const e = getEst(w);
  if (e === undefined) return 'empty';
  if (e === 0 || e < w.pair_stock) return 'critical';
  if (e <= w.est_min) return 'warn';
  return 'ok';
}
function sc(s) { return {ok:'#2d7a4a',warn:'#e8a000',critical:'#c0392b',empty:'#ddd'}[s]||'#ddd'; }

function updRupBadge() {
  const r = wines.filter(w => getEst(w) !== undefined && getEst(w) < w.pair_stock).length;
  document.getElementById('kv-rupt').textContent = r;
  const b = document.getElementById('nb-r'); b.style.display = r>0?'inline-flex':'none';
  if (r>0) b.textContent = r;
}
function updateKPICards() {
  document.getElementById('kv-ticket').textContent  = kpiVals.ticket_medio || '—';
  document.getElementById('kv-gfapct').textContent  = (kpiVals.garrafa_pct || '—') + '%';
}

function spk(monthly) {
  const max = Math.max(...monthly, 1);
  const tr  = monthly[4] > monthly[0]*1.2 ? 'up' : monthly[4] < monthly[0]*0.8 ? 'dn' : '';
  return monthly.map((v,i) =>
    `<div class="spk-b ${i===4?tr:''}" style="height:${Math.max(2,Math.round(v/max*24))}px" title="${MONTHS[i]}: ${v}"></div>`
  ).join('');
}
function fmtTag(f)  { return `<span class="fmt-tag fmt-${f.replace('ml','')}">${f}</span>`; }
function abcB(a)    { return `<span class="abc abc-${a}">${a}</span>`; }
function stTag(s)   {
  const L = {ativo:'Ativo',em_revisao:'Em Revisão',inativo:'Inativo',suspenso:'Suspenso'};
  return `<span class="st-tag st-${s}">${L[s]||s}</span>`;
}
const tipoIcon = {tinto:'🍷',branco:'🥂',rose:'🌸',espumante:'✨',sobremesa:'🍯',taca:'🥃'};

function showToast(m, dur=2800) {
  const t = document.getElementById('toast'); t.textContent = m;
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), dur);
}
function ldShow(msg, sub='') {
  document.getElementById('ld-overlay').classList.add('show');
  document.getElementById('ld-msg').textContent = msg;
  document.getElementById('ld-sub').textContent = sub;
}
function ldMsg(m) { document.getElementById('ld-msg').textContent = m; }
function ldHide() { document.getElementById('ld-overlay').classList.remove('show'); }
function setBanner(state, msg) {
  const b = document.getElementById('conn-banner');
  const d = document.getElementById('cb-dot');
  if (b) b.className = 'conn-banner ' + state;
  if (d) d.className = 'cb-dot ' + state;
  const t = document.getElementById('cb-txt'); if(t) t.textContent = msg;
  const ps = document.getElementById('pin-sync'); if(ps) ps.textContent = msg;
  const sdb = document.getElementById('s-dbstatus');
  if (sdb) { sdb.textContent = state==='online'?'● Supabase online':'● Reconectando...'; sdb.className='s-db '+(state==='online'?'online':'ls'); }
  const tb = document.getElementById('tb-sync');
  if (tb) { tb.textContent = state==='online'?'● Banco':'⚠ Offline'; tb.className='sync-badge '+(state==='online'?'sb-online':'sb-offline'); }
}

// ── DASHBOARD ──────────────────────────────────────────
function renderDashboard() {
  if (!wines.length) return;
  const top = [...wines].sort((a,b) => b.qtde_5m - a.qtde_5m).slice(0,10);
  const mx  = top[0]?.qtde_5m || 1;
  const cols = ['#1a2744','#243358','#2e4070','#38508e','#4260a8','#1a4a2e','#254f36','#2d6040','#367050','#3d8060'];
  document.getElementById('top10').innerHTML = top.map((w,i) =>
    `<div class="bar-row">
      <div class="bar-lbl" title="${w.nome}">${w.nome.substring(0,26)}${w.nome.length>26?'…':''}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(w.qtde_5m/mx*100).toFixed(1)}%;background:${cols[i]}"><span>${w.qtde_5m}</span></div></div>
    </div>`).join('');

  const tcD = [{m:'Jan',tc:307,g:437},{m:'Fev',tc:317,g:412},{m:'Mar',tc:460,g:441},{m:'Abr',tc:390,g:438},{m:'Mai',tc:637,g:492}];
  const mxTC = Math.max(...tcD.map(d=>d.tc+d.g));
  document.getElementById('tc-chart').innerHTML =
    `<div style="font-size:9px;color:var(--grey);margin-bottom:7px">🔴 TC → 🟢 Garrafa</div>` +
    tcD.map(d =>
      `<div class="bar-row" style="margin-bottom:3px">
        <div class="bar-lbl" style="width:28px;font-size:9px">${d.m}</div>
        <div style="flex:1;display:flex;flex-direction:column;gap:2px">
          <div class="bar-track" style="height:9px"><div class="bar-fill" style="width:${(d.tc/mxTC*100).toFixed(0)}%;background:#8b1a1a"><span>${d.tc}</span></div></div>
          <div class="bar-track" style="height:9px"><div class="bar-fill" style="width:${(d.g/mxTC*100).toFixed(0)}%;background:#1a4a2e"><span>${d.g}</span></div></div>
        </div>
      </div>`).join('');
  updateKPICards();
  updRupBadge();
}

// ── CONTROLE DIÁRIO ────────────────────────────────────
function renderControle() {
  const q = (document.getElementById('sc-ctrl')||{}).value?.toLowerCase()||'';
  let ws = wines.filter(w => w.abc==='A' || w.abc==='B' || (getEst(w)!==undefined && getEst(w)<w.pair_stock));
  if (q) ws = ws.filter(w => w.nome.toLowerCase().includes(q) || String(w.cod||'').includes(q));
  if (fCtrl==='A') ws = ws.filter(w => w.abc==='A');
  else if (fCtrl==='B') ws = ws.filter(w => w.abc==='B');
  else if (fCtrl==='crit') ws = ws.filter(w => {const s=getStatus(w);return s==='critical'||s==='warn';});

  document.getElementById('daily-cards').innerHTML = ws.map(w => {
    const est = getEst(w), s = getStatus(w), fc = sc(s);
    const pct = est===undefined?0:Math.min(100,est/w.est_min*100);
    const cc  = {ok:'ok',warn:'warn',critical:'crit',empty:''}[s]||'';
    const wSubs = w.subs||[];
    const subHint = wSubs.length ? `<div class="dc-sub">⇄ ${wSubs.map(s=>s.destino_nome?.substring(0,22)).join(' · ')}</div>` : '';
    return `<div class="dc ${cc}" id="dc-${w.uuid}">
      <div class="dc-hdr"><div><div class="dc-name">${w.nome}</div><div class="dc-cod">Cód.${w.cod} · ${w.formato} · ${w.abc}</div></div>${stTag(w.status)}</div>
      <div class="dc-m">
        <div><div class="dc-mv">${w.pair_stock}</div><div class="dc-ml">Pair Stock</div></div>
        <div><div class="dc-mv">${w.est_min}</div><div class="dc-ml">Mín.Adega</div></div>
        <div><div class="dc-mv">${(w.cons_dia||0).toFixed(1)}</div><div class="dc-ml">Cons/Dia</div></div>
      </div>
      <div class="dc-row">
        <span style="font-size:10px;color:var(--grey)">Estoque:</span>
        <input type="number" class="dc-si" min="0" value="${est!==undefined?est:''}" placeholder="—"
          onchange="updEst('${w.uuid}',this.value)" oninput="updEst('${w.uuid}',this.value)">
        <span class="sdot sd-${s==='empty'?'empty':s==='ok'?'ok':s==='warn'?'warn':'crit'}" id="sd-${w.uuid}"></span>
      </div>
      <div class="dc-bar"><div class="dc-fill" id="dcf-${w.uuid}" style="width:${pct}%;background:${fc}"></div></div>
      ${subHint}
    </div>`;
  }).join('');
}

function updEst(uuid, val) {
  const parsed = val===''?undefined:(parseInt(val)||0);
  if (parsed===undefined) delete estoque[uuid]; else estoque[uuid]=parsed;
  if (parsed!==undefined) dbSaveStock(uuid, parsed, 'floor');
  const w = wines.find(x => x.uuid===uuid); if (!w) return;
  const s=getStatus(w), fc=sc(s), pct=parsed===undefined?0:Math.min(100,parsed/w.est_min*100);
  const dc=document.getElementById('dc-'+uuid); if(dc) dc.className='dc '+(s==='empty'?'':s==='ok'?'ok':s==='warn'?'warn':'crit');
  const dot=document.getElementById('sd-'+uuid); if(dot) dot.className='sdot sd-'+(s==='empty'?'empty':s==='ok'?'ok':s==='warn'?'warn':'crit');
  const fill=document.getElementById('dcf-'+uuid); if(fill){fill.style.width=pct+'%';fill.style.background=fc;}
  const pss=document.getElementById('pss-'+uuid);
  if(pss){pss.textContent=parsed!==undefined?({ok:'✓ OK',warn:'⚠ Atenção',critical:'✗ Repor',empty:'—'}[s]||'—'):'—';pss.style.color=fc;}
  updRupBadge();
  updReposRow(uuid, w);
}

function sfCtrl(f,el){fCtrl=f;document.querySelectorAll('#view-controle .fb').forEach(b=>b.classList.remove('on'));el.classList.add('on');renderControle();}

function exportDiario(){
  let txt='CONTROLE DIÁRIO — TERRAÇO ITÁLIA\n'+new Date().toLocaleString('pt-BR')+'\n\nCód.\tVinho\tClasse\tPair Stock\tEstoque\tStatus\n';
  wines.filter(w=>w.abc==='A'||w.abc==='B').forEach(w=>{
    const s=getStatus(w);
    txt+=`${w.cod}\t${w.nome}\t${w.abc}\t${w.pair_stock}\t${estoque[w.uuid]??'—'}\t${{ok:'OK',warn:'Atenção',critical:'REPOR',empty:'Sem dado'}[s]}\n`;
  });
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain;charset=utf-8'}));a.download='controle_diario.txt';a.click();showToast('Exportado');
}

// ── PAIR STOCK ─────────────────────────────────────────
function renderPS() {
  const q=(document.getElementById('sc-ps')||{}).value?.toLowerCase()||'';
  let ws=[...wines];
  if(q) ws=ws.filter(w=>w.nome.toLowerCase().includes(q)||String(w.cod||'').includes(q));
  if(fPS==='A') ws=ws.filter(w=>w.abc==='A');
  else if(fPS==='B') ws=ws.filter(w=>w.abc==='B');
  else if(fPS==='C') ws=ws.filter(w=>w.abc==='C');
  else if(fPS==='375ml') ws=ws.filter(w=>w.formato==='375ml');
  else if(fPS==='em_revisao') ws=ws.filter(w=>w.status==='em_revisao');
  const sL={ok:'✓ OK',warn:'⚠ Atenção',critical:'✗ Repor',empty:'—'};
  document.getElementById('ps-body').innerHTML=ws.map((w,i)=>{
    const s=getStatus(w),fc=sc(s),bg=i%2===0?'#faf7f2':'#fff';
    return`<tr style="background:${bg}">
      <td style="color:#888;font-size:10px;font-family:'DM Mono',monospace">${i+1}</td>
      <td style="font-family:'DM Mono',monospace;font-size:10px;color:#888">${w.cod}</td>
      <td><div style="font-weight:500;max-width:240px;font-size:11px">${w.nome}</div></td>
      <td>${fmtTag(w.formato)}</td><td>${abcB(w.abc)}</td><td>${stTag(w.status)}</td>
      ${(w.monthly||[0,0,0,0,0]).map(v=>`<td style="font-family:'DM Mono',monospace;font-size:10px;text-align:center;color:#555">${v||''}</td>`).join('')}
      <td><div class="spk">${spk(w.monthly||[0,0,0,0,0])}</div></td>
      <td style="font-family:'DM Mono',monospace;font-weight:600;text-align:center;font-size:11px">${w.qtde_5m||0}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;color:#888">${(w.cons_dia||0).toFixed(2)}</td>
      <td style="font-family:'DM Mono',monospace;font-weight:700;text-align:center;color:var(--navy);font-size:13px">${w.pair_stock}</td>
      <td style="font-family:'DM Mono',monospace;text-align:center;font-size:11px">${w.est_min}</td>
      <td style="font-family:'DM Mono',monospace;text-align:center;font-size:11px">${w.repos_quinzenal}</td>
      <td><input type="number" class="sinp" min="0" value="${estoque[w.uuid]!==undefined?estoque[w.uuid]:''}" placeholder="—"
        onchange="updEst('${w.uuid}',this.value)" oninput="updEst('${w.uuid}',this.value)"></td>
      <td id="pss-${w.uuid}" style="font-size:10px;color:${fc};font-weight:600">${estoque[w.uuid]!==undefined?sL[s]:'—'}</td>
    </tr>`;
  }).join('');
}
function sfPS(f,el){fPS=f;document.querySelectorAll('#view-pairstock .fb').forEach(b=>b.classList.remove('on','on-a','on-b','on-c'));el.classList.add('on'+(f==='A'?'-a':f==='B'?'-b':f==='C'?'-c':''));renderPS();}

// ── REPOSIÇÃO ─────────────────────────────────────────
function renderReposicao() {
  const ws=wines.filter(w=>w.abc==='A'||w.abc==='B');
  document.getElementById('repos-body').innerHTML=ws.map((w,i)=>{
    const ax=getAlmx(w)||0, need=ax>0?Math.max(0,w.repos_quinzenal-ax):null;
    const fc=ax>0?(need>0?'#c0392b':'#2d7a4a'):'#ccc';
    return`<tr style="background:${i%2===0?'#faf7f2':'#fff'}">
      <td style="color:#888;font-size:10px;font-family:'DM Mono',monospace">${i+1}</td>
      <td style="font-size:10px;font-family:'DM Mono',monospace;color:#888">${w.cod}</td>
      <td><div style="font-weight:500;font-size:11px">${w.nome}</div></td>
      <td>${abcB(w.abc)}</td>
      <td style="font-family:'DM Mono',monospace;font-weight:700;text-align:center;color:var(--navy);font-size:12px">${w.repos_quinzenal}</td>
      <td><input type="number" class="sinp" min="0" value="${ax||''}" placeholder="—"
        onchange="updAlm('${w.uuid}',this.value)" oninput="updAlm('${w.uuid}',this.value)"></td>
      <td id="rn-${w.uuid}" style="font-family:'DM Mono',monospace;font-weight:700;text-align:center;color:${fc}">${ax>0?(need>0?need:'0'):'—'}</td>
      <td id="rs-${w.uuid}" style="font-size:10px;font-weight:600;color:${fc}">${ax>0?(need>0?`✗ Pedir ${need}`:'✓ OK'):'—'}</td>
    </tr>`;
  }).join('');
  updReposSummary();
}
function updAlm(uuid,val){
  const parsed=val===''?undefined:(parseInt(val)||0);
  if(parsed===undefined)delete almox[uuid];else almox[uuid]=parsed;
  if(parsed!==undefined) dbSaveStock(uuid,parsed,'warehouse');
  const w=wines.find(x=>x.uuid===uuid);if(w)updReposRow(uuid,w);
  updReposSummary();
}
function updReposRow(uuid,w){
  const ax=almox[uuid]||0,need=ax>0?Math.max(0,w.repos_quinzenal-ax):null;
  const fc=ax>0?(need>0?'#c0392b':'#2d7a4a'):'#ccc';
  const rn=document.getElementById('rn-'+uuid),rs=document.getElementById('rs-'+uuid);
  if(rn){rn.textContent=ax>0?(need>0?need:'0'):'—';rn.style.color=fc;}
  if(rs){rs.textContent=ax>0?(need>0?`✗ Pedir ${need}`:'✓ OK'):'—';rs.style.color=fc;}
}
function updReposSummary(){
  const ws=wines.filter(w=>w.abc==='A'||w.abc==='B');
  const need=ws.filter(w=>(almox[w.uuid]||0)>0&&w.repos_quinzenal-(almox[w.uuid]||0)>0);
  const tot=need.reduce((s,w)=>s+Math.max(0,w.repos_quinzenal-(almox[w.uuid]||0)),0);
  document.getElementById('rp-n').textContent=need.length||'—';
  document.getElementById('rp-g').textContent=tot||'—';
  document.getElementById('rp-u').textContent=need.filter(w=>w.abc==='A').length||'—';
}
function gerarPedidoTxt(){
  const ws=wines.filter(w=>w.abc==='A'||w.abc==='B');
  const need=ws.filter(w=>(almox[w.uuid]||0)>0&&w.repos_quinzenal-(almox[w.uuid]||0)>0);
  if(!need.length){showToast('Nenhum déficit identificado');return;}
  let txt='PEDIDO QUINZENAL — TERRAÇO ITÁLIA\n'+new Date().toLocaleDateString('pt-BR')+'\n\nCód.\tVinho\tClasse\tPedir\n';
  need.forEach(w=>txt+=`${w.cod}\t${w.nome}\t${w.abc}\t${Math.max(0,w.repos_quinzenal-(almox[w.uuid]||0))}\n`);
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'text/plain'}));a.download='pedido_quinzenal.txt';a.click();showToast('Pedido gerado');
}

// ── SUBSTITUIÇÕES ──────────────────────────────────────
function populateSubSelects(){
  const opts=wines.map(w=>`<option value="${w.uuid}">${w.nome.substring(0,58)}</option>`).join('');
  document.getElementById('sm-orig').innerHTML=opts;
  document.getElementById('sm-dest').innerHTML=opts;
}
function renderSubs(){
  let items=fSub==='all'?subs:subs.filter(s=>s.tipo===fSub);
  const tL={falta:'🔴 Na Falta De',upsell:'🟡 Upselling',harmonizacao:'🟢 Harmonização'};
  const isSomm=currentUser.role==='sommelier';
  if(!items.length){document.getElementById('subs-list').innerHTML='<div style="text-align:center;padding:36px;color:var(--grey)">Nenhuma regra cadastrada. Clique em "+ Nova Regra".</div>';return;}
  document.getElementById('subs-list').innerHTML=items.map(s=>`
    <div class="sub-card">
      <span class="sub-type sub-${s.tipo}">${tL[s.tipo]||s.tipo}</span>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div class="sub-row" style="flex:1">
          <div class="sub-wine" style="max-width:210px">${s.origem_nome||'?'}</div>
          <div class="sub-arrow">→</div>
          <div class="sub-wine" style="color:var(--gold);max-width:210px">${s.destino_nome||'?'}</div>
        </div>
        ${isSomm?`<div style="display:flex;gap:5px;flex-shrink:0">
          <button class="btn btn-o btn-sm" onclick="toggleSub('${s.id}')">${s.ativo?'Pausar':'Ativar'}</button>
          <button class="btn btn-r btn-sm" onclick="delSub('${s.id}')">✕</button>
        </div>`:''}
      </div>
      <div class="sub-motivo">${s.motivo||'—'}</div>
      <div class="sub-meta"><span>Prioridade ${s.prioridade}</span><span style="color:${s.ativo?'var(--green)':'var(--grey)'}">${s.ativo?'● Ativa':'○ Pausada'}</span></div>
    </div>`).join('');
}
function sfSub(f,el){fSub=f;document.querySelectorAll('#view-substituicoes .fb').forEach(b=>b.classList.remove('on'));el.classList.add('on');renderSubs();}
function openSubModal(){document.getElementById('sub-modal').style.display='flex';}
function cSubModal(e){if(!e||e.target===document.getElementById('sub-modal'))document.getElementById('sub-modal').style.display='none';}
async function saveSub(){
  const oid=document.getElementById('sm-orig').value,did=document.getElementById('sm-dest').value;
  if(oid===did){showToast('Origem e destino iguais');return;}
  const sub={origem_id:oid,destino_id:did,tipo:document.getElementById('sm-tipo').value,motivo:document.getElementById('sm-motivo').value,prioridade:parseInt(document.getElementById('sm-prio').value),ativo:true,origem_nome:wines.find(w=>w.uuid===oid)?.nome||'',destino_nome:wines.find(w=>w.uuid===did)?.nome||''};
  const dbR=await dbSaveSub(sub);
  if(dbR){sub.id=dbR.id;subs.push(sub);wines.forEach(w=>{if(w.uuid===oid)(w.subs=w.subs||[]).push(sub);});}
  cSubModal();renderSubs();showToast('Regra salva'+(dbR?' no banco':''));
}
async function toggleSub(id){const s=subs.find(x=>x.id===id);if(!s)return;s.ativo=!s.ativo;await dbToggleSub(id,s.ativo);renderSubs();}
async function delSub(id){if(!confirm('Remover regra?'))return;await dbDeleteSub(id);subs=subs.filter(x=>x.id!==id);wines.forEach(w=>{if(w.subs)w.subs=w.subs.filter(s=>s.id!==id);});renderSubs();showToast('Regra removida');}

// ── HARMONIZAÇÃO ───────────────────────────────────────
function renderHarmonizacao(){
  document.getElementById('harm-grid').innerHTML=HARM_DATA.map(h=>`
    <div class="hcard">
      <div class="hcard-hdr"><div class="hcard-ico">${h.icon}</div><div><div class="hcard-title">${h.title}</div><div class="hcard-sub">${h.sub}</div></div></div>
      <div class="hcard-body">${h.rows.map(r=>`<div class="hrow"><div class="hprato">${r[0]}</div><div class="hvinho">${r[1]}</div></div>`).join('')}</div>
    </div>`).join('');
}

// ── TAÇAS ──────────────────────────────────────────────
function renderTC(){
  // Detect TC wines from loaded wines data
  const tcItems = wines.filter(w => w.tipo==='taca' || w.formato_ml===150 || w.formato_ml===50);
  const classifyTC = (w) => {
    const m = w.monthly || [0,0,0,0,0];
    const hasGfa = wines.some(x => x.uuid!==w.uuid && x.tipo!=='taca' && x.nome.replace(/\s*-?\s*TC\s*/gi,'').trim().substring(0,15) === w.nome.replace(/\s*-?\s*TC\s*/gi,'').trim().substring(0,15));
    const newMai = m[0]===0&&m[1]===0&&m[2]===0&&m[3]===0&&m[4]>0;
    const total  = m.reduce((a,b)=>a+b,0);
    if (hasGfa && total < 50) return {acao:'REMOVER',tem_gfa:true,novo_maio:newMai};
    if (newMai) return {acao:'REVISAR',tem_gfa:hasGfa,novo_maio:true};
    if (hasGfa) return {acao:'FUNIL',tem_gfa:true,novo_maio:newMai};
    return {acao:'MANTER',tem_gfa:false,novo_maio:newMai};
  };
  const all = tcItems.map(w => ({...w,...classifyTC(w),monthly:w.monthly||[0,0,0,0,0],total:(w.monthly||[]).reduce((a,b)=>a+b,0)}));
  const kd=[{n:all.filter(t=>t.acao==='REMOVER').length,l:'Remover',c:'#8b1a1a',bg:'#fdf0f0'},{n:all.filter(t=>t.acao==='FUNIL').length,l:'Funil→Gfa',c:'#7a4a00',bg:'#fff8ec'},{n:all.filter(t=>t.acao==='REVISAR').length,l:'Revisar',c:'#8b4000',bg:'#fff0e0'},{n:all.filter(t=>t.acao==='MANTER').length,l:'Manter',c:'#1a4a2e',bg:'#edf5f0'}];
  document.getElementById('tc-kpis').innerHTML=kd.map(k=>`<div style="background:${k.bg};border:1px solid ${k.c}30;border-radius:8px;padding:12px;text-align:center"><div style="font-family:'Cormorant Garamond',serif;font-size:30px;font-weight:600;color:${k.c}">${k.n}</div><div style="font-size:9px;color:#666;margin-top:2px">${k.l}</div></div>`).join('');
  sfTCItems(fTC, all);
}
function sfTC(f,el){fTC=f;document.querySelectorAll('#view-tacas .fb').forEach(b=>b.classList.remove('on'));el.classList.add('on');renderTC();}
function sfTCItems(f,all){
  const items=(f==='all'?all:(all||[]).filter(t=>t.acao===f)).sort((a,b)=>b.total-a.total);
  const aL={REMOVER:'🔴 Remover',FUNIL:'🟡 Funil→Garrafa',REVISAR:'🟠 Revisar',MANTER:'🟢 Manter'};
  document.getElementById('tc-body').innerHTML=items.map((t,i)=>{
    const m=t.monthly;
    const tr=m[4]>m[0]*1.3&&m[0]>0?'↑ ALTA':m[4]<m[0]*0.7&&m[0]>0?'↓ BAIXA':m[0]===0&&m[4]>0?'🆕 NOVO':'→ ESTÁVEL';
    const tc=tr.includes('↑')||tr.includes('NOVO')?'#1a4a2e':(tr.includes('↓')?'#8b1a1a':'#888');
    return`<tr style="background:${i%2===0?'#faf7f2':'#fff'}">
      <td style="font-weight:600;font-size:11px;max-width:200px">${t.nome}</td>
      ${m.map((v,mi)=>`<td style="font-family:'DM Mono',monospace;font-size:11px;text-align:center;${mi===4&&v>0?'font-weight:700;color:#8b1a1a':'color:#555'}">${v||''}</td>`).join('')}
      <td style="font-family:'DM Mono',monospace;font-weight:700;text-align:center">${t.total}</td>
      <td style="font-size:11px;font-weight:600;color:${tc};text-align:center">${tr}</td>
      <td style="text-align:center;font-size:11px;font-weight:600;color:${t.tem_gfa?'#1a4a2e':'#8b1a1a'}">${t.tem_gfa?'✓':'✗'}</td>
      <td style="text-align:center;font-size:11px;color:${t.novo_maio?'#8b1a1a':'#888'}">${t.novo_maio?'🆕':'—'}</td>
      <td><span class="tc-acao tc-${t.acao}">${aL[t.acao]}</span></td>
    </tr>`;
  }).join('');
}

// ── CARTA ──────────────────────────────────────────────
function renderCarta(){
  const q=(document.getElementById('sc-carta')||{}).value?.toLowerCase()||'';
  let ws=[...wines];
  if(q) ws=ws.filter(w=>w.nome.toLowerCase().includes(q));
  if(fCarta==='ativo') ws=ws.filter(w=>w.status==='ativo');
  else if(fCarta==='em_revisao') ws=ws.filter(w=>w.status==='em_revisao');
  else if(fCarta==='inativo') ws=ws.filter(w=>w.status==='inativo');
  else if(['tinto','branco','rose','espumante','sobremesa'].includes(fCarta)) ws=ws.filter(w=>w.tipo===fCarta);
  const isSomm=currentUser.role==='sommelier';
  document.getElementById('carta-grid').innerHTML=ws.map(w=>`
    <div class="ccard ${w.status}" ${isSomm?`onclick="openWineModal('${w.uuid}')" style="cursor:pointer"`:''}> 
      <div class="ccard-bar"></div>
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:7px">
        <div style="font-size:16px">${tipoIcon[w.tipo]||'🍷'}</div>
        <div style="display:flex;gap:3px;align-items:center">${abcB(w.abc)}${stTag(w.status)}</div>
      </div>
      <div style="font-weight:600;font-size:11px;line-height:1.3;margin-bottom:5px">${w.nome}</div>
      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px">${fmtTag(w.formato)}<span style="font-size:9px;font-family:'DM Mono',monospace;color:var(--grey)">#${w.cod}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:9px;font-family:'DM Mono',monospace;color:var(--grey);border-top:1px solid var(--greyl);padding-top:5px">
        <span>PS: <b style="color:var(--navy)">${w.pair_stock}</b></span>
        <span>${(w.cons_dia||0).toFixed(2)}/dia</span>
        ${w.preco_venda>0?`<span style="color:var(--gold)">R$${w.preco_venda.toFixed(0)}</span>`:''}
      </div>
      ${w.notas_servico?`<div style="font-size:9px;color:var(--grey);margin-top:5px;font-style:italic;border-top:1px solid var(--greyl);padding-top:4px">${w.notas_servico}</div>`:''}
    </div>`).join('');
}
function sfCarta(f,el){fCarta=f;document.querySelectorAll('#view-carta .fb').forEach(b=>b.classList.remove('on'));el.classList.add('on');renderCarta();}
function openWineModal(uuid){
  editWineUuid=uuid||null;
  document.getElementById('wine-modal').style.display='flex';
  document.getElementById('wm-title').textContent=uuid?'Editar Rótulo':'Novo Rótulo';
  document.getElementById('wm-del').style.display=uuid?'block':'none';
  if(uuid){
    const w=wines.find(x=>x.uuid===uuid);if(!w)return;
    document.getElementById('wm-nome').value=w.nome;
    document.getElementById('wm-cod').value=w.cod||'';
    document.getElementById('wm-fmt').value=w.formato_ml||750;
    document.getElementById('wm-tipo').value=w.tipo||'tinto';
    document.getElementById('wm-status').value=w.status||'ativo';
    document.getElementById('wm-custo').value=w.preco_custo||'';
    document.getElementById('wm-venda').value=w.preco_venda||'';
    document.getElementById('wm-ps').value=w.pair_stock;
    document.getElementById('wm-notas').value=w.notas_servico||'';
  } else {
    ['wm-nome','wm-cod','wm-custo','wm-venda','wm-ps','wm-notas'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('wm-status').value='em_revisao';
  }
}
function cWineModal(e){if(!e||e.target===document.getElementById('wine-modal'))document.getElementById('wine-modal').style.display='none';}
async function saveWine(){
  const nome=document.getElementById('wm-nome').value.trim();
  if(!nome){showToast('Nome obrigatório');return;}
  const fmt=parseInt(document.getElementById('wm-fmt').value)||750;
  const fmtLabel=fmt===375?'375ml':fmt===1500?'Magnum':'750ml';
  const ps=parseInt(document.getElementById('wm-ps').value)||1;
  const payload={uuid:editWineUuid,cod:parseInt(document.getElementById('wm-cod').value)||null,nome:nome.toUpperCase(),formato:fmtLabel,formato_ml:fmt,tipo:document.getElementById('wm-tipo').value,status:document.getElementById('wm-status').value,preco_custo:parseFloat(document.getElementById('wm-custo').value)||0,preco_venda:parseFloat(document.getElementById('wm-venda').value)||0,pair_stock:ps,est_min:ps*2,repos_quinzenal:Math.ceil(ps/1.3*15*1.2),notas_servico:document.getElementById('wm-notas').value,cons_dia:0,qtde_5m:0,monthly:[0,0,0,0,0],subs:[]};
  const dbR=await dbSaveWine(payload);
  if(dbR){payload.uuid=dbR.id;if(editWineUuid){const idx=wines.findIndex(x=>x.uuid===editWineUuid);if(idx>=0)wines[idx]={...wines[idx],...payload};}else wines.push(payload);}
  cWineModal();renderCarta();populateSubSelects();showToast('Rótulo salvo'+(dbR?' no banco':''));
}
async function deleteWine(){
  if(!confirm('Remover este rótulo?'))return;
  await dbDeleteWine(editWineUuid);
  wines=wines.filter(x=>x.uuid!==editWineUuid);
  cWineModal();renderCarta();showToast('Rótulo removido');
}

// ── KPIs ───────────────────────────────────────────────
function renderKPIs(){
  document.getElementById('kpi-grid').innerHTML=KPIS_DEF.map(k=>`
    <div class="ki">
      <div class="ki-title">${k.label}</div>
      <div class="ki-desc">${k.desc}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input type="number" id="ki-${k.id}" step="0.1" value="${kpiVals[k.id]||''}" placeholder="Inserir valor..."
          style="flex:1;padding:7px 11px;border:1px solid var(--border);border-radius:4px;font-family:'DM Mono',monospace;font-size:14px;color:var(--navy);outline:none"
          oninput="calcKPI('${k.id}',this.value,${k.meta},${k.alerta},'${k.unit}',${!!k.reverse})">
        <span style="font-size:11px;color:var(--grey)">${k.unit}</span>
      </div>
      <div class="ki-meta" id="km-${k.id}">Meta: <b>${k.meta}${k.unit}</b> · Alerta: <b>${k.alerta}${k.unit}</b></div>
      <div class="ki-bar"><div class="ki-fill" id="kf-${k.id}" style="width:0%;background:#ddd"></div></div>
    </div>`).join('');
  KPIS_DEF.forEach(k=>{if(kpiVals[k.id]!==undefined)calcKPI(k.id,kpiVals[k.id],k.meta,k.alerta,k.unit,!!k.reverse);});
}
function calcKPI(id,val,meta,alerta,unit,reverse){
  const v=parseFloat(val);if(isNaN(v))return;
  kpiVals[id]=v;dbSaveKPI(id,v);updateKPICards();
  const pct=reverse?Math.min(100,(alerta/Math.max(v,.1))*100):Math.min(100,(v/meta)*100);
  const color=reverse?(v<=meta?'#2d7a4a':v<=alerta?'#e8a000':'#c0392b'):(v>=meta?'#2d7a4a':v>=alerta?'#e8a000':'#c0392b');
  const label=reverse?(v<=meta?'✓ Excelente':v<=alerta?'⚠ Atenção':'✗ Crítico'):(v>=meta?'✓ Meta atingida':v>=alerta?'⚠ Atenção':'✗ Crítico');
  const el=document.getElementById('km-'+id),bf=document.getElementById('kf-'+id);
  if(el)el.innerHTML=`<span style="color:${color};font-weight:600">${label} — ${v}${unit}</span>`;
  if(bf){bf.style.width=pct+'%';bf.style.background=color;}
}

// ── CAMPEONATO ─────────────────────────────────────────
function renderGarcons(){
  if(!garcons.length){document.getElementById('garcons-rank').innerHTML='<div style="text-align:center;padding:36px;color:var(--grey)">Nenhum resultado. Clique "+ Registrar Resultado".</div>';return;}
  const scored=garcons.map(g=>({...g,
    ticket:  g.ticket_medio   || +(( g.receita_vinho||g.receita||0) / Math.max(g.mesas_com_vinho||g.com_vinho||1,1)).toFixed(0),
    taxaGfa: g.taxa_garrafa   || +((g.mesas_com_gfa||g.com_gfa||0)   / Math.max(g.mesas||1,1)*100).toFixed(1),
    taxaSeg: g.taxa_segunda   || +((g.mesas_duas_gfa||g.duas_gfa||0)  / Math.max(g.mesas_com_gfa||g.com_gfa||1,1)*100).toFixed(1),
    sc:      g.score          || 0
  })).sort((a,b)=>b.sc-a.sc);
  document.getElementById('garcons-rank').innerHTML=`
    <div class="tw tc-wrap"><table>
      <thead><tr><th>Pos</th><th>Garçom</th><th>Período</th><th>Mesas</th><th>Receita</th><th>Ticket</th><th>Taxa Gfa</th><th>2ª Gfa</th><th>Score</th></tr></thead>
      <tbody>${scored.map((g,i)=>`
        <tr style="background:${i===0?'#fffdf5':i%2===0?'#faf7f2':'#fff'}">
          <td><span style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:600;color:${['var(--gold)','var(--grey)','#b87333'][i]||'var(--navy)'}">${['🥇','🥈','🥉'][i]||i+1}</span></td>
          <td style="font-weight:600;font-size:12px">${g.nome_garcon||g.nome||'—'}</td>
          <td style="font-size:10px;color:var(--grey);font-family:'DM Mono',monospace">${g.periodo||'—'}</td>
          <td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px">${g.mesas||0}</td>
          <td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px;font-weight:600">R$ ${parseFloat(g.receita_vinho||g.receita||0).toFixed(0)}</td>
          <td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px;color:var(--gold);font-weight:600">R$ ${g.ticket}</td>
          <td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px">${g.taxaGfa}%</td>
          <td style="text-align:center;font-family:'DM Mono',monospace;font-size:11px">${g.taxaSeg}%</td>
          <td style="text-align:center;font-family:'DM Mono',monospace;font-weight:700;font-size:13px;color:var(--navy)">${g.sc}</td>
        </tr>`).join('')}</tbody>
    </table></div>`;
}
function openGarconModal(){document.getElementById('garcon-modal').style.display='flex';}
function cGarconModal(e){if(!e||e.target===document.getElementById('garcon-modal'))document.getElementById('garcon-modal').style.display='none';}
async function saveGarcon(){
  const nome=document.getElementById('gm-nome').value.trim();if(!nome){showToast('Nome obrigatório');return;}
  const g={nome,periodo:document.getElementById('gm-per').value,mesas:parseInt(document.getElementById('gm-mesas').value)||0,com_vinho:parseInt(document.getElementById('gm-cvinho').value)||0,com_gfa:parseInt(document.getElementById('gm-cgfa').value)||0,duas_gfa:parseInt(document.getElementById('gm-dgfa').value)||0,receita:parseFloat(document.getElementById('gm-receita').value)||0};
  const dbR=await dbSaveGarcon(g);
  if(dbR)garcons.push(dbR);
  cGarconModal();renderGarcons();showToast('Resultado salvo'+(dbR?' no banco':''));
}

// ── XLS EXPORT ─────────────────────────────────────────
function xlsExportPedido(){
  if(typeof XLSX==='undefined'){showToast('Aguarde — carregando biblioteca...');return;}
  const today=new Date().toLocaleDateString('pt-BR');
  const rows=[['PEDIDO DE COMPRA — TERRAÇO ITÁLIA'],['Data:',today,'','Responsável:',currentUser?.nome||'—'],[],['Cód. ERP','Vinho','Formato','Classe','Repos. Quinzenal','Estoque Almox.','PEDIR (un.)','Obs.']];
  let total=0;
  wines.filter(w=>w.abc==='A'||w.abc==='B').forEach(w=>{
    const ax=almox[w.uuid]||0,need=ax>0?Math.max(0,w.repos_quinzenal-ax):w.repos_quinzenal;
    if(need>0){rows.push([w.cod,w.nome,w.formato,w.abc,w.repos_quinzenal,ax||'—',need,'']);total+=need;}
  });
  rows.push([]);rows.push(['','','','','','TOTAL:',total,'']);
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:10},{wch:55},{wch:10},{wch:8},{wch:15},{wch:14},{wch:12},{wch:28}];
  XLSX.utils.book_append_sheet(wb,ws,'Pedido de Compra');
  XLSX.writeFile(wb,`Pedido_Compra_TI_${today.replace(/\//g,'-')}.xlsx`);
  showToast('📊 Pedido exportado');
}

function xlsExportRequisicao(){
  if(typeof XLSX==='undefined'){showToast('Aguarde — carregando biblioteca...');return;}
  const today=new Date().toLocaleDateString('pt-BR');
  const hr=new Date().getHours();
  const turno=hr<14?'Abertura (manhã)':hr<17?'15h (jantar)':'Fechamento';
  const rows=[['REQUISIÇÃO INTERNA — ALMOXARIFADO → ADEGA DO ANDAR'],['Data:',today,'','Turno:',turno],['Solicitante:',currentUser?.nome||'—'],[],['Cód. ERP','Vinho','Formato','Classe','Pair Stock','Estoque Adega','SOLICITAR (un.)','Recebido','Almoxarife']];
  let total=0;
  wines.filter(w=>w.abc==='A'||w.abc==='B').forEach(w=>{
    const est=estoque[w.uuid],need=est!==undefined?Math.max(0,w.pair_stock-est):w.pair_stock;
    if(need>0){rows.push([w.cod,w.nome,w.formato,w.abc,w.pair_stock,est??'—',need,'','']);total++;}
  });
  if(!total){showToast('Nenhum item abaixo do pair stock');return;}
  rows.push([]);rows.push(['','','','','','Itens:',total,'','']);
  rows.push([]);rows.push(['Observações:']);rows.push(['']);rows.push([]);
  rows.push(['Assinatura (Adega):','','','','Assinatura (Almoxarife):']);
  rows.push(['_'.repeat(36),'','','','_'.repeat(36)]);
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:10},{wch:52},{wch:10},{wch:8},{wch:15},{wch:13},{wch:14},{wch:14},{wch:18}];
  XLSX.utils.book_append_sheet(wb,ws,'Requisição Interna');
  XLSX.writeFile(wb,`Requisicao_Adega_TI_${today.replace(/\//g,'-')}.xlsx`);
  showToast('📊 Requisição exportada');
}

function xlsExportControle(){
  if(typeof XLSX==='undefined'){showToast('Aguarde — carregando biblioteca...');return;}
  const today=new Date().toLocaleDateString('pt-BR');
  const rows=[['CONTROLE DIÁRIO — ADEGA DO ANDAR'],['Data:',today,'Hora:',new Date().toLocaleTimeString('pt-BR')],['Responsável:',currentUser?.nome||'—'],[],['Cód.','Vinho','Formato','Classe','Pair Stock','Estoque','Status','Obs.']];
  wines.filter(w=>w.abc==='A'||w.abc==='B').forEach(w=>{
    const s=getStatus(w);
    rows.push([w.cod,w.nome,w.formato,w.abc,w.pair_stock,estoque[w.uuid]??'—',{ok:'OK',warn:'Atenção',critical:'REPOR',empty:'Não informado'}[s],'']);
  });
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:10},{wch:52},{wch:10},{wch:8},{wch:11},{wch:12},{wch:12},{wch:28}];
  XLSX.utils.book_append_sheet(wb,ws,'Controle Diário');
  XLSX.writeFile(wb,`Controle_Diario_TI_${today.replace(/\//g,'-')}.xlsx`);
  showToast('📊 Controle exportado');
}

// ── IMPORT XLS ─────────────────────────────────────────
function dOver(e){e.preventDefault();document.getElementById('imp-zone').classList.add('drag');}
function dLeave(){document.getElementById('imp-zone').classList.remove('drag');}
function dDrop(e){e.preventDefault();dLeave();const f=e.dataTransfer.files[0];if(f)processFile(f);}
function handleFile(inp){const f=inp.files[0];if(f)processFile(f);}

function iLog(msg, cls='') {
  const el = document.getElementById('imp-log');
  el.style.display = 'block';
  el.innerHTML += `<div class="${cls?'log-'+cls:''}">${msg}</div>`;
  el.scrollTop = el.scrollHeight;
}

function normalizeERPName(s) {
  let v = String(s).toUpperCase().trim();
  v = v.replace(/\s*[-–]\s*TC\s*150\s*/gi, '');
  v = v.replace(/\s*[-–]?\s*TC\s*$/gi, '');
  v = v.replace(/\s*750\s*ML\s*/gi, '');
  v = v.replace(/\s*375\s*ML\s*/gi, '');
  v = v.replace(/\s*1[.,]5\s*(LT|L)?\s*/gi, '');
  v = v.replace(/^\s*1\/2\s*/gi, '');
  v = v.replace(/\s*[-–]\s*N\/C\s*$/gi, '');
  v = v.replace(/\s+/g, ' ').trim();
  return v;
}

async function processFile(file) {
  if (typeof XLSX === 'undefined') { showToast('Biblioteca XLS ainda carregando...'); return; }

  const log = document.getElementById('imp-log');
  log.style.display = 'block';
  log.innerHTML = '';
  document.getElementById('imp-review').style.display = 'none';

  iLog('📂 ' + file.name);

  // ── 1. READ FILE ──────────────────────────────────────
  let workbook;
  try {
    const buf = await file.arrayBuffer();
    workbook  = XLSX.read(buf, { type: 'array', cellDates: true });
  } catch(e) {
    iLog('✗ Erro ao ler arquivo: ' + e.message, 'err'); return;
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw   = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // ── 2. FIND HEADER ROW ────────────────────────────────
  // Row 0 is empty, Row 1 has: DESCRIÇÃO | Total(LT) | Jan..Dez | Total | Media/dia
  let hdrRow = -1;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    if (raw[i] && String(raw[i][0]||'').toUpperCase().includes('DESCRI')) {
      hdrRow = i; break;
    }
  }
  if (hdrRow < 0) { iLog('✗ Cabeçalho não encontrado. Verifique o formato do arquivo.', 'err'); return; }
  iLog('✓ Estrutura validada — cabeçalho na linha ' + (hdrRow+1), 'ok');

  // ── 3. MAP MONTH COLUMNS ──────────────────────────────
  // Col 0 = DESCRIÇÃO, Col 1 = LT, Col 2..13 = months, Col 14 = Total
  const MONTH_COLS = [2,3,4,5,6,7,8,9,10,11,12,13]; // Jan=2 ... Dez=13
  const MONTH_NAMES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

  // Detect which months have ANY data
  const monthsWithData = [];
  for (let mi = 0; mi < 12; mi++) {
    const col = MONTH_COLS[mi];
    const hasData = raw.slice(hdrRow+1).some(r => r && r[col] != null && Number(r[col]) > 0);
    if (hasData) monthsWithData.push({ idx: mi, col, name: MONTH_NAMES[mi] });
  }
  if (!monthsWithData.length) { iLog('✗ Nenhum mês com dados encontrado.', 'err'); return; }

  // Detect year from header row date cells
  let importYear = new Date().getFullYear();
  for (let col = 2; col <= 13; col++) {
    const cell = raw[hdrRow][col];
    if (cell instanceof Date) { importYear = cell.getFullYear(); break; }
    if (typeof cell === 'string' && /20\d\d/.test(cell)) {
      importYear = parseInt(cell.match(/20\d\d/)[0]); break;
    }
  }
  iLog(`✓ Período: ${monthsWithData.map(m=>m.name).join(', ')} de ${importYear}`, 'ok');
  iLog(`✓ ${monthsWithData.length} meses com dados detectados`, 'ok');

  // ── 4. LOAD ALIASES FROM SUPABASE ─────────────────────
  iLog('Carregando aliases do banco...');
  let aliasMap = {}; // descricao_erp (upper) → wine_uuid
  try {
    const { data: aData } = await SB.from('erp_name_aliases').select('descricao_erp, wine_id');
    if (aData) aData.forEach(a => { aliasMap[a.descricao_erp.toUpperCase()] = a.wine_id; });
    iLog(`✓ ${Object.keys(aliasMap).length} aliases carregados`, 'ok');
  } catch(e) { iLog('⚠ Não foi possível carregar aliases: ' + e.message, 'warn'); }

  // Build normalized name → uuid map from loaded wines
  const normMap = {}; // normalized_name → wine_uuid
  wines.forEach(w => { normMap[normalizeERPName(w.nome)] = w.uuid; });

  // ── 5. PROCESS ROWS ───────────────────────────────────
  const dataRows  = raw.slice(hdrRow + 1).filter(r => r && r[0] != null && String(r[0]).trim() !== '');
  iLog(`Processando ${dataRows.length} linhas...`);

  let matched = 0, unmatched = 0, skipped = 0;
  const toUpsert   = []; // {wine_id, ano, mes, quantidade, lt_unitario}
  const toReview   = []; // {descricao_erp, lt_erp, meses}
  const newAliases = []; // {descricao_erp, wine_id} — to save for future imports

  for (const row of dataRows) {
    const descricao = String(row[0] || '').trim();
    const lt        = parseFloat(row[1]) || 0.75;
    if (!descricao) { skipped++; continue; }

    // Skip obvious non-wine rows
    if (descricao.toUpperCase().includes('FESTA') ||
        descricao.toUpperCase().includes('EVENTO') ||
        descricao.toUpperCase().includes('TOTAL')) { skipped++; continue; }

    // Try match: 1) alias exact, 2) normalized name, 3) partial
    const descUpper = descricao.toUpperCase();
    let wineUuid = aliasMap[descUpper] || normMap[normalizeERPName(descricao)] || null;

    // Try partial match if still not found
    if (!wineUuid) {
      const norm = normalizeERPName(descricao);
      for (const [wNorm, uuid] of Object.entries(normMap)) {
        if (norm.length > 8 && (wNorm.includes(norm.substring(0,15)) || norm.includes(wNorm.substring(0,15)))) {
          wineUuid = uuid; break;
        }
      }
    }

    if (!wineUuid) {
      // Check if has any data before adding to review
      const hasAnyData = monthsWithData.some(m => Number(row[m.col]||0) > 0);
      if (hasAnyData) {
        toReview.push({ descricao, lt, monthly: monthsWithData.map(m => ({ name: m.name, idx: m.idx, qty: Number(row[m.col]||0) })) });
        unmatched++;
      } else { skipped++; }
      continue;
    }

    // Build upsert rows for each month with data
    for (const m of monthsWithData) {
      const qty = Number(row[m.col] || 0);
      toUpsert.push({ wine_id: wineUuid, ano: importYear, mes: m.idx + 1, quantidade: qty, lt_unitario: Math.round(lt*1000)/1000, fonte: 'erp_import' });
    }
    matched++;
  }

  iLog(`✓ ${matched} rótulos identificados`, 'ok');
  if (unmatched > 0) iLog(`⚠ ${unmatched} aguardando revisão manual`, 'warn');
  if (skipped  > 0) iLog(`— ${skipped} linhas ignoradas (sem dados ou eventos)`, '');

  // ── 6. UPSERT wine_consumption ────────────────────────
  if (toUpsert.length) {
    iLog(`Gravando ${toUpsert.length} registros de consumo...`);
    try {
      // Batch in chunks of 100
      const CHUNK = 100;
      for (let i = 0; i < toUpsert.length; i += CHUNK) {
        const chunk = toUpsert.slice(i, i + CHUNK);
        const { error } = await SB.from('wine_consumption')
          .upsert(chunk, { onConflict: 'wine_id,ano,mes,fonte' });
        if (error) throw error;
      }
      iLog(`✓ Consumo gravado com sucesso`, 'ok');
    } catch(e) {
      iLog('✗ Erro ao gravar consumo: ' + e.message, 'err'); return;
    }
  }

  // ── 7. LOG IMPORT ─────────────────────────────────────
  try {
    await SB.from('erp_imports').insert({
      filename:       file.name,
      periodo_inicio: `${importYear}-${String(monthsWithData[0].idx+1).padStart(2,'0')}-01`,
      periodo_fim:    `${importYear}-${String(monthsWithData[monthsWithData.length-1].idx+1).padStart(2,'0')}-28`,
      total_linhas:   dataRows.length,
      linhas_ok:      matched,
      linhas_revisao: unmatched,
      linhas_erro:    0,
      status:         unmatched > 0 ? 'concluido_com_pendencias' : 'concluido'
    });
  } catch(e) { console.warn('Import log error:', e.message); }

  // ── 8. RECALCULATE PAIR STOCK ─────────────────────────
  iLog('Recalculando Pair Stock e ABC...');
  try {
    await dbRecalcPairStock(importYear, monthsWithData.length);
    iLog('✓ Pair Stock e classificação ABC atualizados', 'ok');
  } catch(e) {
    iLog('⚠ Recálculo parcial: ' + e.message, 'warn');
  }

  // ── 9. RELOAD WINES FROM DB ───────────────────────────
  iLog('Recarregando dados atualizados...');
  try {
    const { data: wData } = await SB.from('wines').select('*').order('cons_dia', { ascending: false });
    if (wData?.length) {
      wines = wData.map(w => ({
        uuid: w.id, cod: w.cod_erp, nome: w.nome,
        formato: w.formato_ml===375?'375ml':w.formato_ml===1500?'Magnum':'750ml',
        formato_ml: w.formato_ml, tipo: w.tipo, abc: w.abc_class, status: w.status,
        cons_dia: parseFloat(w.cons_dia)||0, pair_stock: w.pair_stock||1,
        est_min: w.est_min_adega||2, repos_quinzenal: w.repos_quinzenal||1,
        preco_custo: parseFloat(w.preco_custo)||0, preco_venda: parseFloat(w.preco_venda)||0,
        notas_servico: w.notas_servico||'', qtde_5m: 0, monthly: [0,0,0,0,0], subs: []
      }));
      // Reload consumption for sparklines
      const { data: cData } = await SB.from('wine_consumption').select('wine_id,ano,mes,quantidade').eq('ano', importYear);
      if (cData) {
        const byWine = {};
        cData.forEach(c => { if(!byWine[c.wine_id]) byWine[c.wine_id]=[0,0,0,0,0,0,0,0,0,0,0,0]; byWine[c.wine_id][c.mes-1]+=c.quantidade; });
        wines.forEach(w => {
          const m = byWine[w.uuid]||[];
          w.monthly  = m.slice(0,5); // Jan–Mai for sparklines
          w.qtde_5m  = m.reduce((a,b)=>a+b,0);
        });
      }
      // Re-attach subs
      wines.forEach(w => { w.subs = subs.filter(s => s.origem_id === w.uuid); });
    }
    iLog(`✓ ${wines.length} vinhos recarregados`, 'ok');
  } catch(e) { iLog('⚠ Erro ao recarregar vinhos: ' + e.message, 'warn'); }

  // ── 10. SHOW REVIEW QUEUE ─────────────────────────────
  if (toReview.length) {
    const reviewDiv = document.getElementById('imp-review');
    reviewDiv.style.display = 'block';
    document.getElementById('review-title-count').textContent = toReview.length;
    document.getElementById('review-list').innerHTML = toReview.map((r, i) => `
      <div class="rev-item" id="rev-${i}">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:500">${r.descricao}</div>
          <div style="font-size:10px;color:var(--grey);font-family:'DM Mono',monospace">
            LT: ${r.lt}L · ${r.monthly.filter(m=>m.qty>0).map(m=>`${m.name}:${m.qty}`).join(' · ')}
          </div>
        </div>
        <select class="fsel" style="width:220px;font-size:11px;padding:5px" onchange="handleReviewChoice(${i}, this.value, ${JSON.stringify(r).replace(/"/g,'&quot;')})">
          <option value="">Associar a rótulo...</option>
          ${wines.slice(0,30).map(w=>`<option value="${w.uuid}">${w.nome.substring(0,45)}</option>`).join('')}
          <option value="IGNORAR">Ignorar sempre este nome</option>
        </select>
      </div>`).join('');
  }

  // Re-render all views with fresh data
  renderDashboard();
  renderControle();
  renderPS();
  renderReposicao();
  updRupBadge();
  updateKPICards();

  iLog(``, '');
  iLog(`✅ Importação concluída — ${matched} rótulos · ${monthsWithData.length} meses · ${importYear}`, 'ok');
  showToast(`✓ ${matched} rótulos importados`);
}

async function handleReviewChoice(idx, value, rowData) {
  if (!value) return;

  if (value === 'IGNORAR') {
    // Save alias to ignore (map to a sentinel or just skip)
    document.getElementById('rev-' + idx).style.opacity = '0.4';
    showToast('Nome ignorado nas próximas importações');
    return;
  }

  // Associate name to wine and save alias
  const wineUuid = value;
  const descricao = rowData.descricao;

  try {
    // Save alias for future imports
    await SB.from('erp_name_aliases').upsert(
      { descricao_erp: descricao, wine_id: wineUuid, lt_erp: rowData.lt },
      { onConflict: 'descricao_erp' }
    );

    // Upsert consumption for this wine
    const importYear = new Date().getFullYear(); // approximate
    const upsertRows = rowData.monthly
      .filter(m => m.qty > 0)
      .map(m => ({ wine_id: wineUuid, ano: importYear, mes: m.idx + 1, quantidade: m.qty, lt_unitario: rowData.lt, fonte: 'erp_import' }));

    if (upsertRows.length) {
      await SB.from('wine_consumption').upsert(upsertRows, { onConflict: 'wine_id,ano,mes,fonte' });
    }

    const wineName = wines.find(w => w.uuid === wineUuid)?.nome || wineUuid;
    document.getElementById('rev-' + idx).innerHTML =
      `<div style="flex:1;font-size:11px;color:var(--green)">✓ Associado: <b>${wineName}</b></div>`;
    showToast('Associação salva');
  } catch(e) {
    showToast('Erro: ' + e.message);
  }
}
