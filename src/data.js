/* Bolá — datos estáticos (catálogos, íconos, textos fijos). Sin dependencias
   de estado ni de otros módulos: es la base de todo el árbol de imports.
   Movido 1:1 desde app.js (Fase 3 de docs/MIGRATION_PLAN.md) — sin reescribir
   lógica, solo separado en módulos ES. */
'use strict';

export const EQUIPMENT_SUGGESTIONS = ['Caminadora', 'Bicicleta estática', 'Rack de sentadillas', 'Banco de press', 'Mancuernas', 'Máquina de poleas', 'Remo'];
export const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const GOALS = [
  { id: 'perder_peso', label: 'Perder peso' },
  { id: 'ganar_musculo', label: 'Ganar músculo' },
  { id: 'resistencia', label: 'Resistencia' },
  { id: 'tonificar', label: 'Tonificar' },
];
// ids en minúscula porque client_profiles.level es el enum experience_level
// del backend ('principiante'/'intermedio'/'avanzado') — no el label capitalizado.
export const LEVELS = [
  { id: 'principiante', label: 'Principiante' },
  { id: 'intermedio', label: 'Intermedio' },
  { id: 'avanzado', label: 'Avanzado' },
];
// Etapa 2 — cada entrada trae ya sets/reps/restSeconds estructurados (no solo
// el texto libre de antes) para que el modo entrenamiento pueda mostrar y
// registrar series reales. `reps` es texto (no número): admite "20 min" o
// "circuito" además de una cifra — mismo criterio que routine_exercises.reps
// del backend. weightKg queda null: el peso de partida lo define cada quien
// la primera vez que entrena ese ejercicio, no lo inventa la IA.
export const EXERCISE_LIB = {
  perder_peso: [
    { text: 'Cardio en caminadora - 20 min', kw: 'caminadora', sets: 1, reps: '20 min', weightKg: null, restSeconds: 0 },
    { text: 'Bicicleta estática - 15 min', kw: 'bicicleta', sets: 1, reps: '15 min', weightKg: null, restSeconds: 0 },
    { text: 'Circuito funcional - 3 rondas', kw: null, sets: 3, reps: 'circuito', weightKg: null, restSeconds: 45 },
    { text: 'Remo - 10 min', kw: 'remo', sets: 1, reps: '10 min', weightKg: null, restSeconds: 0 },
  ],
  ganar_musculo: [
    { text: 'Sentadilla en rack - 4x8', kw: 'rack', sets: 4, reps: '8', weightKg: null, restSeconds: 90 },
    { text: 'Press banca - 4x8', kw: 'banco', sets: 4, reps: '8', weightKg: null, restSeconds: 90 },
    { text: 'Peso muerto - 3x6', kw: 'rack', sets: 3, reps: '6', weightKg: null, restSeconds: 120 },
    { text: 'Máquina de poleas - 3x12', kw: 'poleas', sets: 3, reps: '12', weightKg: null, restSeconds: 60 },
  ],
  resistencia: [
    { text: 'Caminadora - 30 min', kw: 'caminadora', sets: 1, reps: '30 min', weightKg: null, restSeconds: 0 },
    { text: 'Bicicleta estática - 20 min', kw: 'bicicleta', sets: 1, reps: '20 min', weightKg: null, restSeconds: 0 },
    { text: 'Remo - 15 min', kw: 'remo', sets: 1, reps: '15 min', weightKg: null, restSeconds: 0 },
    { text: 'Circuito funcional - 4 rondas', kw: null, sets: 4, reps: 'circuito', weightKg: null, restSeconds: 45 },
  ],
  tonificar: [
    { text: 'Mancuernas - 3x15', kw: 'mancuernas', sets: 3, reps: '15', weightKg: null, restSeconds: 60 },
    { text: 'Máquina de poleas - 3x15', kw: 'poleas', sets: 3, reps: '15', weightKg: null, restSeconds: 60 },
    { text: 'Circuito funcional - 3 rondas', kw: null, sets: 3, reps: 'circuito', weightKg: null, restSeconds: 45 },
    { text: 'Bicicleta estática - 10 min', kw: 'bicicleta', sets: 1, reps: '10 min', weightKg: null, restSeconds: 0 },
  ],
};
export const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DURATION_LABELS = { diario: 'Diario', mensual: 'Mensual', anual: 'Anual' };

export const LOGO_SVG = `<svg viewBox="0 0 100 100" width="34" height="34"><path d="M20 18 h60 a12 12 0 0 1 12 12 v28 a12 12 0 0 1 -12 12 H42 L28 84 V70 H20 a12 12 0 0 1 -12 -12 V30 a12 12 0 0 1 12 -12 Z" fill="none" stroke="#0B0D10" stroke-width="7" stroke-linejoin="round"/><rect x="34" y="40" width="32" height="7" rx="3.5" fill="#0B0D10"/><rect x="26" y="33" width="8" height="21" rx="3" fill="#0B0D10"/><rect x="66" y="33" width="8" height="21" rx="3" fill="#0B0D10"/></svg>`;

// Lockup de marca "FIGHT CLUB GYM". Tipográfico a propósito: escala sin
// perder nitidez, respeta los tokens (--brand para CLUB) y no depende de
// cargar una imagen. El logo ilustrado completo se usa solo en el ícono
// de la app y en materiales de marketing, no dentro de la interfaz.
export const BRAND_MARK_SIZES = { sm: 18, md: 26, lg: 40, xl: 56 };

export function brandMark(size = 'md', opts = {}) {
  const px = BRAND_MARK_SIZES[size] || BRAND_MARK_SIZES.md;
  const sub = opts.sub === false ? '' : '<div class="brand-mark__sub">Gym</div>';
  return `<div class="brand-mark">
    <div>
      <div class="brand-mark__word" style="font-size:${px}px">Fight<em>Club</em></div>
      ${sub}
    </div>
  </div>`;
}

export const ICON_PATHS = {
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  dumbbell: '<path d="M4 9v6M2 10v4M20 9v6M22 10v4M8 8v8M16 8v8M8 12h8"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3-6 7-6s7 2.7 7 6"/><circle cx="17" cy="8" r="2.5"/><path d="M17 14c2.8 0 5 2.3 5 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
  bars: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
  crown: '<path d="M4 17l-1.6-9L8 12l4-7 4 7 5.6-4-1.6 9z"/><path d="M4 19.5h16"/>',
  star: '<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.3 6-5.4-3.2-5.4 3.2 1.3-6L3.3 9.2l6.1-.6L12 3z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
  camera: '<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13.5" r="3.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 3h6v3H9z"/><path d="M9 12l2 2 4-4"/>',
  idcard: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="11" r="2"/><path d="M6 16c.5-1.8 2-2.5 2.5-2.5S11 14.2 11.5 16M14 9h4M14 13h4"/>',
  // Panel de plataforma (ver src/screens/platform.js).
  shield: '<path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/>',
  run: '<circle cx="14" cy="5" r="2"/><path d="M9 20l2-5 2 1 2 5M8 13l3-3 2 2 3-1M6 9l3-2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6 0 10 7 10 7a17.6 17.6 0 0 1-3.1 3.9M6.3 6.3A17.9 17.9 0 0 0 2 12s4 7 10 7a10.5 10.5 0 0 0 4.2-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  wifiOff: '<path d="M2 2l20 20"/><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 3.5-2.3M19 12.5a10 10 0 0 0-3-2.1M2 8.5a15 15 0 0 1 4.5-2.8M22 8.5a15 15 0 0 0-6-3.4"/><circle cx="12" cy="20" r="1"/>',
  // Etapa 2 — Reservas (calendario), Modo entrenamiento (check) y Rutina (plus).
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  check: '<path d="M4 12l5 5 11-11"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  // Etapa 2 — "Configuración" (dueño/admin).
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V19a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H10a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V10a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/>',
};

// Prefijos de país para el campo de teléfono (nombre en español + código de
// marcación E.164). Cuba primero porque es el país por defecto del gym; el
// resto ordenado alfabéticamente.
export const COUNTRY_CODES = [
  ['Cuba', '+53'],
  ['Afganistán', '+93'], ['Albania', '+355'], ['Alemania', '+49'], ['Andorra', '+376'],
  ['Angola', '+244'], ['Arabia Saudita', '+966'], ['Argelia', '+213'], ['Argentina', '+54'],
  ['Armenia', '+374'], ['Australia', '+61'], ['Austria', '+43'], ['Azerbaiyán', '+994'],
  ['Bahamas', '+1242'], ['Bahréin', '+973'], ['Bangladés', '+880'], ['Barbados', '+1246'],
  ['Bélgica', '+32'], ['Belice', '+501'], ['Benín', '+229'], ['Bielorrusia', '+375'],
  ['Bolivia', '+591'], ['Bosnia y Herzegovina', '+387'], ['Botsuana', '+267'], ['Brasil', '+55'],
  ['Brunéi', '+673'], ['Bulgaria', '+359'], ['Burkina Faso', '+226'], ['Burundi', '+257'],
  ['Bután', '+975'], ['Cabo Verde', '+238'], ['Camboya', '+855'], ['Camerún', '+237'],
  ['Canadá', '+1'], ['Catar', '+974'], ['Chad', '+235'], ['Chile', '+56'], ['China', '+86'],
  ['Chipre', '+357'], ['Colombia', '+57'], ['Comoras', '+269'], ['Corea del Norte', '+850'],
  ['Corea del Sur', '+82'], ['Costa de Marfil', '+225'], ['Costa Rica', '+506'], ['Croacia', '+385'],
  ['Dinamarca', '+45'], ['Ecuador', '+593'], ['Egipto', '+20'], ['El Salvador', '+503'],
  ['Emiratos Árabes Unidos', '+971'], ['Eritrea', '+291'], ['Eslovaquia', '+421'], ['Eslovenia', '+386'],
  ['España', '+34'], ['Estados Unidos', '+1'], ['Estonia', '+372'], ['Etiopía', '+251'],
  ['Filipinas', '+63'], ['Finlandia', '+358'], ['Fiyi', '+679'], ['Francia', '+33'],
  ['Gabón', '+241'], ['Gambia', '+220'], ['Georgia', '+995'], ['Ghana', '+233'], ['Grecia', '+30'],
  ['Guatemala', '+502'], ['Guinea', '+224'], ['Guinea-Bisáu', '+245'], ['Guinea Ecuatorial', '+240'],
  ['Guyana', '+592'], ['Haití', '+509'], ['Honduras', '+504'], ['Hungría', '+36'], ['India', '+91'],
  ['Indonesia', '+62'], ['Irak', '+964'], ['Irán', '+98'], ['Irlanda', '+353'], ['Islandia', '+354'],
  ['Israel', '+972'], ['Italia', '+39'], ['Jamaica', '+1876'], ['Japón', '+81'], ['Jordania', '+962'],
  ['Kazajistán', '+7'], ['Kenia', '+254'], ['Kirguistán', '+996'], ['Kiribati', '+686'],
  ['Kuwait', '+965'], ['Laos', '+856'], ['Lesoto', '+266'], ['Letonia', '+371'], ['Líbano', '+961'],
  ['Liberia', '+231'], ['Libia', '+218'], ['Liechtenstein', '+423'], ['Lituania', '+370'],
  ['Luxemburgo', '+352'], ['Madagascar', '+261'], ['Malasia', '+60'], ['Malaui', '+265'],
  ['Maldivas', '+960'], ['Malí', '+223'], ['Malta', '+356'], ['Marruecos', '+212'],
  ['Mauricio', '+230'], ['Mauritania', '+222'], ['México', '+52'], ['Moldavia', '+373'],
  ['Mónaco', '+377'], ['Mongolia', '+976'], ['Montenegro', '+382'], ['Mozambique', '+258'],
  ['Namibia', '+264'], ['Nauru', '+674'], ['Nepal', '+977'], ['Nicaragua', '+505'], ['Níger', '+227'],
  ['Nigeria', '+234'], ['Noruega', '+47'], ['Nueva Zelanda', '+64'], ['Omán', '+968'],
  ['Países Bajos', '+31'], ['Pakistán', '+92'], ['Palaos', '+680'], ['Panamá', '+507'],
  ['Papúa Nueva Guinea', '+675'], ['Paraguay', '+595'], ['Perú', '+51'], ['Polonia', '+48'],
  ['Portugal', '+351'], ['Puerto Rico', '+1787'], ['Reino Unido', '+44'],
  ['República Centroafricana', '+236'], ['República Checa', '+420'],
  ['República Democrática del Congo', '+243'], ['República del Congo', '+242'],
  ['República Dominicana', '+1809'], ['Ruanda', '+250'], ['Rumanía', '+40'], ['Rusia', '+7'],
  ['Samoa', '+685'], ['San Marino', '+378'], ['Senegal', '+221'], ['Serbia', '+381'],
  ['Seychelles', '+248'], ['Sierra Leona', '+232'], ['Singapur', '+65'], ['Siria', '+963'],
  ['Somalia', '+252'], ['Sri Lanka', '+94'], ['Suazilandia', '+268'], ['Sudáfrica', '+27'],
  ['Sudán', '+249'], ['Sudán del Sur', '+211'], ['Suecia', '+46'], ['Suiza', '+41'],
  ['Surinam', '+597'], ['Tailandia', '+66'], ['Taiwán', '+886'], ['Tanzania', '+255'],
  ['Tayikistán', '+992'], ['Timor Oriental', '+670'], ['Togo', '+228'], ['Tonga', '+676'],
  ['Trinidad y Tobago', '+1868'], ['Túnez', '+216'], ['Turkmenistán', '+993'], ['Turquía', '+90'],
  ['Tuvalu', '+688'], ['Ucrania', '+380'], ['Uganda', '+256'], ['Uruguay', '+598'],
  ['Uzbekistán', '+998'], ['Vanuatu', '+678'], ['Vaticano', '+379'], ['Venezuela', '+58'],
  ['Vietnam', '+84'], ['Yemen', '+967'], ['Yibuti', '+253'], ['Zambia', '+260'], ['Zimbabue', '+263'],
];

export function iconSpan(name, size) {
  const paths = ICON_PATHS[name] || '';
  return `<span class="icon icon--${size || 16}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></span>`;
}
