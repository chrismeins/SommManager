// ═══════════════════════════════════════════════════
// CONFIGURAÇÃO SUPABASE — Terraço Itália
// ═══════════════════════════════════════════════════
const SUPABASE_URL  = 'https://fvwlfoksplfwfcbnenwj.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ2d2xmb2tzcGxmd2ZjYm5lbndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3NDc2OTcsImV4cCI6MjA5NjMyMzY5N30.jQfGMWcNUmHkBdcnl_IIdGe5SuuMgemrORFuu4YLxEg';

const USERS_LOCAL = {
  '1234': { nome: 'Diana Milena', role: 'sommelier' },
  '5678': { nome: 'Maître de Turno', role: 'maitre' },
  '0000': { nome: 'Staff de Sala', role: 'staff' }
};

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai'];

const KPIS_DEF = [
  { id: 'ticket_medio',         label: 'Ticket médio / mesa',          unit: 'R$',   meta: 180, alerta: 140, desc: 'Receita vinho ÷ mesas com vinho' },
  { id: 'penetracao_pct',       label: 'Taxa de penetração',            unit: '%',    meta: 65,  alerta: 50,  desc: 'Mesas com vinho ÷ total de mesas' },
  { id: 'garrafa_pct',          label: '% Receita em garrafa',          unit: '%',    meta: 80,  alerta: 70,  desc: 'Receita garrafa ÷ receita total vinho' },
  { id: 'segunda_garrafa_pct',  label: 'Taxa de 2ª garrafa',            unit: '%',    meta: 25,  alerta: 15,  desc: 'Mesas 2+ garrafas ÷ mesas com garrafa' },
  { id: 'ruptura_pct',          label: 'Índice de ruptura',             unit: '%',    meta: 3,   alerta: 5,   desc: 'SKUs em ruptura ÷ total SKUs', reverse: true },
  { id: 'giro_estoque',         label: 'Giro de estoque',               unit: 'x/mês',meta: 1.5, alerta: 1,   desc: 'Consumo mensal ÷ estoque médio' },
];

const HARM_DATA = [
  { icon: '🐟', title: 'Entradas Frias',     sub: 'Carpaccio · Ostras · Crudo',
    rows: [['Carpaccio de Atum','Pinot Grigio — acidez exalta o sabor delicado'],['Ostras ao Natural','Chablis — mineralidade do mar'],['Crudo de Robalo','Vermentino — frescor cítrico']] },
  { icon: '🍝', title: 'Massas Molho Branco', sub: 'Alfredo · Carbonara · Cacio e Pepe',
    rows: [['Fettuccine Alfredo','Chardonnay com oak — corpo espelha a cremosidade'],['Pasta Carbonara','Pinot Grigio estruturado — frescor corta o ovo'],['Cacio e Pepe','Frascati DOC — mineralidade equilibra o pecorino']] },
  { icon: '🍅', title: 'Massas Molho Tomate', sub: 'Amatriciana · Bolognese · Arrabbiata',
    rows: [['Penne Amatriciana','Chianti Classico — "nasceu para este prato"'],['Pasta Bolognese','Montepulciano — tanino abraça a carne moída'],['Arrabbiata','Barbera — acidez equilibra o picante']] },
  { icon: '🍚', title: 'Risoto',              sub: 'Funghi · Açafrão · Frutos do Mar',
    rows: [['Risoto de Porcini','Barbaresco leve — terra e especiaria'],['Risoto alla Milanese','Soave Classico — leveza não sobrepõe o açafrão'],['Frutos do Mar','Gavi di Gavi — mineralidade espelha o mar']] },
  { icon: '🥩', title: 'Carnes Vermelhas',    sub: 'Bistecca · Ossobuco · Cordeiro',
    rows: [['Bistecca Fiorentina','Brunello di Montalcino — tanino firme limpa a gordura'],['Ossobuco alla Milanese','Barolo — estrutura rivaliza com o colágeno'],['Carré de Cordeiro','Amarone — potência que rivaliza com o cordeiro']] },
  { icon: '🍗', title: 'Carnes Brancas',      sub: 'Vitela · Frango · Porco',
    rows: [['Vitela ao Limão','Chardonnay — corpo não sobrepõe a carne delicada'],['Pollo al Mattone','Dolcetto — fruta complementa as ervas'],['Lombinho de Porco','Barbera — acidez equilibra a gordura do porco']] },
  { icon: '🧀', title: 'Queijos',             sub: 'Tábua de Formaggi',
    rows: [['Gorgonzola · Dolcelatte','Porto Tawny — doce + salgado, clássico absoluto'],['Parmigiano Reggiano','Lambrusco — efervescência corta o umami'],['Pecorino Romano','Vermentino — frescor equilibra a salinidade']] },
  { icon: '🍮', title: 'Sobremesas',          sub: 'Tiramisù · Panna Cotta · Cannoli',
    rows: [['Tiramisù','Moscato d\'Asti — harmonização italiana clássica'],['Panna Cotta com Frutas','Asti Spumante — frescor e doçura alinhados'],['Cannoli Siciliano','Passito di Pantelleria — doçura intensa e persistente']] },
  { icon: '✨', title: 'Aperitivo',            sub: 'Boas-vindas · Celebrações',
    rows: [['Abertura da refeição','Bernardi Jacur Brut — oferecer assim que a mesa se sentar'],['Celebrações','Taittinger Brut — Champagne eleva o momento especial']] },
];
