/* Bolá — mock de BolaAPI para probar app.js sin un Supabase real.
   SOLO para desarrollo/verificación (ver test-harness.html) — nunca se
   carga desde index.html. Reproduce las reglas de negocio de las
   migraciones (quién puede hacer qué) para que las pruebas contra esto
   digan algo real sobre el control de flujo de app.js, aunque no verifiquen
   el SQL/RLS en sí — eso se revisó a mano en supabase/migrations. */

'use strict';

(function () {
  const wait = (ms) => new Promise(r => setTimeout(r, ms == null ? 30 : ms));
  const uid = (() => { let n = 0; return (prefix) => `${prefix}-${++n}`; })();

  const db = {
    gyms: [],
    profiles: [],       // {id, role, gym_id, name, email, phone, password}
    trainers: [],        // {user_id, gym_id, specialty, price, status}
    gymAdmins: [],        // {user_id, gym_id, status} — mismo patrón que trainers, sin specialty/price
    clientProfiles: [],  // {user_id, gym_id, plan_id, trainer_user_id, face_photo_key, weight, height, age, level, goal, membership_status, membership_expires_at, last_payment_at}
    equipment: [],
    plans: [],
    progress: [],         // {id, client_user_id, storage_key, taken_at}
    routines: [],          // {id, client_user_id, source, goal, author_user_id}
    routineExercises: [],  // {id, routine_id, position, text}
    payments: [],           // {id, client_user_id, gym_id, amount, status, confirmed_by, confirmed_at}
    reviews: [],
    checkinEvents: [],       // {id, gym_id, client_user_id, checked_in_by, created_at}
    trainerInterest: [],      // {candidate_user_id, client_user_id, gym_id}
    storage: new Map(),      // path -> File
    // Fase 16 — invitaciones. gymInvites reemplaza gyms.invite_code como
    // fuente de verdad (un código por rol, no uno compartido); ownerInvites
    // son los tokens de un solo uso que generan alta de dueño.
    gymInvites: [],          // {gym_id, role: 'admin'|'trainer'|'client', code}
    ownerInvites: [],        // {token, note, created_by, created_at, used_at, used_by_user_id}
    // Etapas 2-4 del rediseño (ver supabase/migrations/20260905000300) —
    // mismas tablas, mismas reglas, del lado del mock.
    exercises: [],            // {id, gym_id|null, name, muscle_group, equipment_name, media_key, description}
    classes: [],              // {id, gym_id, name, description, trainer_user_id, duration_minutes, capacity}
    classSessions: [],        // {id, class_id, gym_id, starts_at}
    classBookings: [],        // {id, session_id, client_user_id, gym_id, status}
    achievements: [],         // {id, code, name, description, icon, target, metric}
    clientAchievements: [],   // {client_user_id, achievement_id, progress, earned_at}
    bodyMeasurements: [],     // {id, client_user_id, taken_at, weight_kg, body_fat_pct, waist_cm, chest_cm, arm_cm, thigh_cm}
    workoutSessions: [],      // {id, client_user_id, gym_id, source, started_at, finished_at}
    exerciseLogs: [],         // {id, workout_session_id, client_user_id, exercise_name, set_number, reps, weight_kg}
    trainerReviews: [],       // {id, trainer_user_id, client_user_id, rating, text}
    conversations: [],        // {id, gym_id, trainer_user_id, client_user_id}
    messages: [],             // {id, conversation_id, sender_user_id, body, created_at, read_at}
  };

  let session = null; // {id, role}

  // Igual que normalizeEmail() en supabase-client.js — el mock recibe lo
  // mismo que mandaría la app real (ver emailField() en app.js).
  function normalizeEmail(raw) {
    const v = (raw || '').trim();
    return v.includes('@') ? v : `${v}@gmail.com`;
  }

  function requireAuth() {
    if (!session) throw new Error('No autenticado.');
    return session;
  }

  function profileOf(userId) {
    return db.profiles.find(p => p.id === userId);
  }

  /* ---------------- semilla: espejo de supabase/seed.sql ---------------- */

  (function seed() {
    const gymId = 'gym-1';
    db.gyms.push({ id: gymId, name: 'PowerHouse Gym', address: 'Av. Central 123', hours: '6:00 - 22:00', invite_code: 'demo1234', currency: 'USD', created_at: new Date().toISOString() });
    // Fase 16 — un código de invitación por rol, ya no uno solo compartido.
    db.gymInvites.push({ gym_id: gymId, role: 'client', code: 'demo1234' }); // igual al invite_code legado de siempre
    db.gymInvites.push({ gym_id: gymId, role: 'admin', code: 'demoadmn' });
    db.gymInvites.push({ gym_id: gymId, role: 'trainer', code: 'demotrnr' });

    const mkUser = (id, role, name, email, phone, extra) => {
      db.profiles.push({ id, role, gym_id: gymId, name, email, phone, password: extra.password });
      if (role === 'trainer') db.trainers.push({ user_id: id, gym_id: gymId, specialty: extra.specialty, price: extra.price, status: 'approved' });
      if (role === 'admin') db.gymAdmins.push({ user_id: id, gym_id: gymId, status: 'approved' });
      if (role === 'client') db.clientProfiles.push({
        user_id: id, gym_id: gymId, plan_id: extra.planId, trainer_user_id: extra.trainerUserId || null,
        face_photo_key: null, weight: null, height: null, age: null, level: 'principiante', goal: extra.goal || 'perder_peso',
        membership_status: extra.status, membership_expires_at: extra.expires, last_payment_at: extra.lastPayment,
        created_at: extra.joined || new Date().toISOString(),
      });
    };

    // El fundador del gym de muestra es el dueño (mismo criterio que se usó
    // para migrar la cuenta real en producción, ver supabase/migrations/
    // 20260903000002_owner_role_fix_wrong_promotion.sql).
    mkUser('admin-1', 'owner', 'Avilio Fernández', 'admin@bola.app', '555-0100', { password: 'admin123' });
    // Rol dedicado de administrador de plataforma (ver
    // supabase/migrations/20260905000500_platform_admin_role.sql) — cuenta
    // propia, sin gym_id, para poder probar el panel de plataforma
    // (src/screens/platform.js) contra el mock sin tocar Supabase real.
    // Reemplaza el enfoque anterior (Fase 16) de marcar is_platform_admin=true
    // sobre la cuenta de dueño de arriba.
    db.profiles.push({ id: 'platform-1', role: 'platform_admin', gym_id: null, name: 'Admin de plataforma', email: 'plataforma@bola.app', phone: null, password: 'plataforma123' });
    mkUser('trainer-1', 'trainer', 'Marco Díaz', 'marco@bola.app', '555-0201', { password: 'coach123', specialty: 'Fuerza e hipertrofia', price: 20 });
    mkUser('trainer-2', 'trainer', 'Laura Gómez', 'laura@bola.app', '555-0202', { password: 'coach123', specialty: 'Pérdida de peso y cardio', price: 15 });
    mkUser('trainer-3', 'trainer', 'Diego Ruiz', 'diego@bola.app', '555-0203', { password: 'coach123', specialty: 'Funcional y movilidad', price: 10 });

    db.plans.push({ id: 'plan-basico', gym_id: gymId, name: 'Plan Básico', price: 25, duration: 'mensual' });
    db.plans.push({ id: 'plan-premium', gym_id: gymId, name: 'Plan Premium', price: 60, duration: 'mensual' });

    ['Caminadora', 'Bicicleta estática', 'Rack de sentadillas', 'Banco de press', 'Mancuernas', 'Máquina de poleas', 'Remo']
      .forEach(name => db.equipment.push({ id: uid('eq'), gym_id: gymId, name }));

    const today = new Date();
    const plus = d => new Date(today.getTime() + d * 86400000).toISOString().slice(0, 10);
    const minus = d => new Date(today.getTime() - d * 86400000).toISOString().slice(0, 10);

    mkUser('client-1', 'client', 'Carla Méndez', 'carla@bola.app', '555-0301', { password: 'cliente123', planId: 'plan-premium', trainerUserId: 'trainer-1', goal: 'ganar_musculo', status: 'al_dia', expires: plus(20), lastPayment: '2026-07-05', joined: minus(60) });
    mkUser('client-2', 'client', 'Jorge Salinas', 'jorge@bola.app', '555-0302', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-2', status: 'pendiente', expires: plus(20), lastPayment: '2026-06-10', joined: minus(45) });
    mkUser('client-3', 'client', 'Ana Torres', 'ana@bola.app', '555-0303', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-2', status: 'vencido', expires: minus(5), lastPayment: '2026-05-02', joined: minus(200) });
    mkUser('client-4', 'client', 'Luis Rivas', 'luis@bola.app', '555-0304', { password: 'cliente123', planId: 'plan-premium', trainerUserId: 'trainer-1', status: 'al_dia', expires: plus(20), lastPayment: '2026-01-15', joined: minus(10) });
    mkUser('client-5', 'client', 'Sofía Paredes', 'sofia@bola.app', '555-0305', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-3', status: 'al_dia', expires: plus(20), lastPayment: '2026-07-18', joined: minus(5) });

    db.progress.push({ id: uid('pg'), client_user_id: 'client-1', storage_key: null, taken_at: minus(2) });
    db.progress.push({ id: uid('pg'), client_user_id: 'client-1', storage_key: null, taken_at: minus(1) });

    const routineId = uid('rt');
    db.routines.push({ id: routineId, client_user_id: 'client-1', source: 'trainer', goal: null, author_user_id: 'trainer-1' });
    [
      { text: 'Sentadilla en rack - 4x8', sets: 4, reps: '8', weight_kg: 60, rest_seconds: 90 },
      { text: 'Press banca - 4x8', sets: 4, reps: '8', weight_kg: 40, rest_seconds: 90 },
      { text: 'Remo - 10 min', sets: null, reps: null, weight_kg: null, rest_seconds: 60 },
    ].forEach((ex, i) =>
      db.routineExercises.push({ id: uid('rex'), routine_id: routineId, position: i, exercise_id: null, ...ex }));

    db.payments.push({ id: uid('pay'), client_user_id: 'client-1', gym_id: gymId, amount: 80, status: 'confirmed', confirmed_by: 'admin-1', confirmed_at: '2026-07-05' });
    db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: 'client-1', rating: 5, text: 'Excelente atención y máquinas nuevas.', created_at: '2026-07-10' });
    db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: 'client-2', rating: 4, text: 'Falta más espacio en horario pico.', created_at: '2026-07-08' });

    // ---- Etapas 2-4: biblioteca de ejercicios (global, gym_id null — mismo
    // seed que supabase/migrations/20260905000300_etapa2_features_schema.sql) ----
    [
      ['Press de banca', 'Pecho', 'Banco de press'],
      ['Sentadilla con barra', 'Piernas', 'Rack de sentadillas'],
      ['Peso muerto', 'Espalda', null],
      ['Press militar', 'Hombros', null],
      ['Curl con barra', 'Brazos', 'Mancuernas'],
      ['Sprint en cinta', 'Cardio', 'Caminadora'],
      ['Remo con mancuerna', 'Espalda', 'Mancuernas'],
      ['Circuito funcional', 'Cuerpo completo', null],
    ].forEach(([name, muscle_group, equipment_name]) =>
      db.exercises.push({ id: uid('ex'), gym_id: null, name, muscle_group, equipment_name, media_key: null, description: null }));

    // ---- Logros (catálogo global) ----
    [
      ['first_workout', 'Primer entrenamiento', 'Completaste tu primera sesión.', 'zap', 1, 'workouts'],
      ['ten_workouts', '10 entrenamientos', 'Completaste 10 sesiones de entrenamiento.', 'dumbbell', 10, 'workouts'],
      ['hundred_workouts', '100 entrenamientos', 'Completaste 100 sesiones de entrenamiento.', 'crown', 100, 'workouts'],
      ['streak_30', '30 días consecutivos', 'Te registraste 30 días seguidos.', 'clock', 30, 'streak_days'],
    ].forEach(([code, name, description, icon, target, metric]) =>
      db.achievements.push({ id: uid('ach'), code, name, description, icon, target, metric }));

    // client-1 ya entrenó un par de veces — para que Progreso/Logros no
    // arranquen todos en cero en el mock.
    const s1 = uid('ws'); db.workoutSessions.push({ id: s1, client_user_id: 'client-1', gym_id: gymId, source: 'trainer', started_at: minus(6), finished_at: minus(6) });
    const s2 = uid('ws'); db.workoutSessions.push({ id: s2, client_user_id: 'client-1', gym_id: gymId, source: 'trainer', started_at: minus(3), finished_at: minus(3) });
    db.exerciseLogs.push({ id: uid('exl'), workout_session_id: s2, client_user_id: 'client-1', exercise_name: 'Press de banca', set_number: 1, reps: 8, weight_kg: 45 });
    db.exerciseLogs.push({ id: uid('exl'), workout_session_id: s2, client_user_id: 'client-1', exercise_name: 'Sentadilla con barra', set_number: 1, reps: 8, weight_kg: 65 });
    db.bodyMeasurements.push({ id: uid('bm'), client_user_id: 'client-1', taken_at: minus(3), weight_kg: 78.5, body_fat_pct: 15.2, waist_cm: 82, chest_cm: null, arm_cm: null, thigh_cm: null });
    db.bodyMeasurements.push({ id: uid('bm'), client_user_id: 'client-1', taken_at: minus(20), weight_kg: 80, body_fat_pct: 16.1, waist_cm: 84, chest_cm: null, arm_cm: null, thigh_cm: null });

    // ---- Clases y una sesión de ejemplo ----
    const classId = uid('cls');
    db.classes.push({ id: classId, gym_id: gymId, name: 'Bailoterapia', description: 'Ritmo, energía y bienestar.', trainer_user_id: 'trainer-2', duration_minutes: 50, capacity: 20 });
    const sessId = uid('css');
    db.classSessions.push({ id: sessId, class_id: classId, gym_id: gymId, starts_at: new Date(today.getTime() + 3 * 3600000).toISOString() });
  })();

  /* ---------------- auth ---------------- */

  const auth = {
    // Devuelven { user, session } igual que el cliente real, con session
    // siempre presente — el mock simula un proyecto sin confirmación de
    // correo (el caso "hay que confirmar" se probó a mano contra Supabase
    // real, ver conversación; acá solo se cubre el camino feliz).
    // El dueño crea el gimnasio — mismo alcance que el signUpAdmin original,
    // renombrado (ver docs/MIGRATION_PLAN.md Fase 4).
    async signUpOwner({ name, email, phone, password }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('owner');
      db.profiles.push({ id, role: 'owner', gym_id: null, name, email, phone, password });
      session = { id, role: 'owner' };
      return { user: { id }, session };
    },
    // El administrador se une a un gimnasio ya creado (como un entrenador) y
    // queda pendiente de aprobación por el dueño.
    async signUpAdmin({ name, email, phone, password }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('admin');
      db.profiles.push({ id, role: 'admin', gym_id: null, name, email, phone, password });
      db.gymAdmins.push({ user_id: id, gym_id: null, status: 'pending' });
      session = { id, role: 'admin' };
      return { user: { id }, session };
    },
    async signUpTrainer({ name, email, phone, password, specialty, price }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('trainer');
      db.profiles.push({ id, role: 'trainer', gym_id: null, name, email, phone, password });
      db.trainers.push({ user_id: id, gym_id: null, specialty: specialty || 'General', price: Number(price) || 0, status: 'pending' });
      session = { id, role: 'trainer' };
      return { user: { id }, session };
    },
    async signUpClient({ name, email, phone, password }) {
      email = normalizeEmail(email);
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('client');
      db.profiles.push({ id, role: 'client', gym_id: null, name, email, phone, password });
      db.clientProfiles.push({ user_id: id, gym_id: null, plan_id: null, trainer_user_id: null, face_photo_key: null, weight: null, height: null, age: null, level: 'principiante', goal: 'perder_peso', membership_status: 'pendiente', membership_expires_at: null, last_payment_at: null, created_at: new Date().toISOString() });
      session = { id, role: 'client' };
      return { user: { id }, session };
    },
    async signIn({ email, password }) {
      email = normalizeEmail(email);
      await wait();
      const p = db.profiles.find(x => x.email === email && x.password === password);
      if (!p) throw new Error('Correo o contraseña incorrectos.');
      session = { id: p.id, role: p.role };
    },
    // El mock nunca exige confirmación de correo (session siempre presente
    // arriba, ver el comentario de auth), así que la pantalla de código
    // (viewConfirmCode) nunca se llega a mostrar en test-harness.html — este
    // camino se probó a mano contra Supabase real, no acá.
    async verifyEmailCode() {
      await wait();
      throw new Error('El mock no simula confirmación de correo — probá este flujo directo contra Supabase.');
    },
    async resendConfirmCode() {
      await wait();
      throw new Error('El mock no simula confirmación de correo — probá este flujo directo contra Supabase.');
    },
    async signOut() { await wait(); session = null; },
    // No-op: el deep link de confirmación solo existe en la app nativa
    // empaquetada, nunca en el navegador donde corre este mock.
    async setSessionFromUrl() { await wait(); return null; },
    async getSession() { await wait(); return session ? { user: { id: session.id } } : null; },
    async getMyProfile() {
      await wait();
      if (!session) return null;
      const p = profileOf(session.id);
      return { id: p.id, role: p.role, gym_id: p.gym_id, name: p.name, email: p.email, phone: p.phone, is_platform_admin: !!p.is_platform_admin };
    },
  };

  /* ---------------- gimnasio ---------------- */

  const gyms = {
    async listAll() { await wait(); return [...db.gyms]; },
    async get(gymId) { await wait(); return db.gyms.find(g => g.id === gymId) || null; },
    // Fase 16 — ya no resuelve solo un gimnasio (asumiendo "cliente"): cada
    // link ahora es de un rol específico (gym_invites), así que devuelve
    // ambos. Sigue sin ser un chequeo de seguridad, solo UX — join_gym()
    // sigue siendo la única función que de verdad une la cuenta al gimnasio.
    async getByInviteCode(code) {
      await wait();
      const inv = db.gymInvites.find(i => i.code === code);
      if (!inv) return null;
      const gym = db.gyms.find(g => g.id === inv.gym_id);
      return gym ? { gym: { ...gym }, role: inv.role } : null;
    },
    // Los 3 códigos de ESTE gimnasio — los carga el dueño/admin al entrar al
    // panel (ver actions.js enterOwnerDash) para mostrar las 3 tarjetas de
    // invitación (Clientes/Coaches/Admins).
    async getInvites(gymId) {
      await wait();
      const rows = db.gymInvites.filter(i => i.gym_id === gymId);
      return {
        client: (rows.find(r => r.role === 'client') || {}).code || null,
        admin: (rows.find(r => r.role === 'admin') || {}).code || null,
        trainer: (rows.find(r => r.role === 'trainer') || {}).code || null,
      };
    },
    async create({ name, address, hours, ownerInviteToken }) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'owner') throw new Error('Solo una cuenta de dueño puede crear un gimnasio.');
      const me = profileOf(s.id);
      if (me.gym_id) throw new Error('Esta cuenta ya tiene un gimnasio asignado.');
      const invite = db.ownerInvites.find(i => i.token === ownerInviteToken && !i.used_at);
      if (!invite) throw new Error('El link de invitación de dueño no es válido o ya fue usado.');
      const id = uid('gym');
      db.gyms.push({ id, name, address, hours, invite_code: Math.random().toString(36).slice(2, 10), currency: 'USD' });
      me.gym_id = id;
      invite.used_at = new Date().toISOString();
      invite.used_by_user_id = s.id;
      ['client', 'admin', 'trainer'].forEach(role =>
        db.gymInvites.push({ gym_id: id, role, code: Math.random().toString(36).slice(2, 10) }));
      return id;
    },
    async regenerateInvite(role) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio regeneran un link de invitación.');
      const me = profileOf(s.id);
      const row = db.gymInvites.find(i => i.gym_id === me.gym_id && i.role === role);
      if (!row) throw new Error('Este gimnasio todavía no tiene un link de invitación para ese rol.');
      row.code = Math.random().toString(36).slice(2, 10);
      return row.code;
    },
    async updateSettings(gymId, { currency, brandName, brandColor }) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio configuran el gimnasio.');
      const gym = db.gyms.find(g => g.id === gymId);
      if (!gym) throw new Error('Ese gimnasio no existe.');
      if (currency && currency.trim()) gym.currency = currency.trim();
      gym.brand_name = (brandName || '').trim() || null;
      gym.brand_color = (brandColor || '').trim() || null;
    },
    async join(gymId) {
      await wait();
      const s = requireAuth();
      if (!['trainer', 'client', 'admin'].includes(s.role)) throw new Error('Solo entrenadores, clientes y administradores se unen con esta función.');
      const me = profileOf(s.id);
      if (me.gym_id) throw new Error('Esta cuenta ya pertenece a un gimnasio.');
      if (!db.gyms.some(g => g.id === gymId)) throw new Error('Ese gimnasio no existe.');
      me.gym_id = gymId;
      if (s.role === 'trainer') db.trainers.find(t => t.user_id === s.id).gym_id = gymId;
      if (s.role === 'client') db.clientProfiles.find(c => c.user_id === s.id).gym_id = gymId;
      if (s.role === 'admin') db.gymAdmins.find(a => a.user_id === s.id).gym_id = gymId;
    },
  };

  /* ---------------- equipo ---------------- */

  const equipment = {
    async list(gymId) { await wait(); return db.equipment.filter(e => e.gym_id === gymId).map(e => ({ id: e.id, name: e.name })); },
    async add(gymId, name) { await wait(); const row = { id: uid('eq'), gym_id: gymId, name }; db.equipment.push(row); return { id: row.id, name: row.name }; },
    async remove(id) { await wait(); db.equipment = db.equipment.filter(e => e.id !== id); },
  };

  /* ---------------- planes ---------------- */

  const plans = {
    async list(gymId) { await wait(); return db.plans.filter(p => p.gym_id === gymId).map(p => ({ ...p })); },
    async add(gymId, { name, price, duration }) { await wait(); const row = { id: uid('plan'), gym_id: gymId, name, price, duration }; db.plans.push(row); return { ...row }; },
    async update(id, { name, price, duration }) {
      await wait();
      const p = db.plans.find(x => x.id === id);
      Object.assign(p, { name, price, duration });
      return { ...p };
    },
    async remove(id) { await wait(); db.plans = db.plans.filter(p => p.id !== id); },
  };

  /* ---------------- entrenadores ---------------- */

  function shapeTrainer(t) {
    const p = profileOf(t.user_id);
    // is_active default true para filas sembradas antes de la Etapa 2
    // (mismo criterio que el resto del seed: nunca inventar un dato, solo
    // completar el default real de la columna nueva).
    return { id: t.user_id, name: p.name, email: p.email, phone: p.phone, specialty: t.specialty, price: Number(t.price), status: t.status, isActive: t.is_active !== false };
  }

  function isStaff(s) { return s.role === 'admin' || s.role === 'owner'; }

  const trainers = {
    async listForGym(gymId) { await wait(); return db.trainers.filter(t => t.gym_id === gymId).map(shapeTrainer); },
    async listApprovedForGym(gymId) { await wait(); return db.trainers.filter(t => t.gym_id === gymId && t.status === 'approved').map(shapeTrainer); },
    async approve(userId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio aprueban entrenadores.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (t) t.status = 'approved';
    },
    async reject(userId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio rechazan entrenadores.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (t) t.status = 'rejected';
    },
    async updateProfile(userId, { specialty, price }) {
      await wait();
      const t = db.trainers.find(x => x.user_id === userId);
      Object.assign(t, { specialty, price });
    },
    async setActive(userId, active) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio activan o desactivan un entrenador.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id && x.status === 'approved');
      if (!t) throw new Error('Ese entrenador no existe o no está aprobado en tu gimnasio.');
      t.is_active = !!active;
    },

    // Espeja supabase-client.js — ver el comentario ahí.
    async markInterest(candidateUserId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'client') throw new Error('Solo un cliente puede marcar interés en un entrenador candidato.');
      const t = db.trainers.find(x => x.user_id === candidateUserId);
      const me = profileOf(s.id);
      if (!t || t.gym_id !== me.gym_id) throw new Error('Ese candidato no pertenece a tu gimnasio.');
      if (!db.trainerInterest.some(i => i.candidate_user_id === candidateUserId && i.client_user_id === s.id)) {
        db.trainerInterest.push({ candidate_user_id: candidateUserId, client_user_id: s.id, gym_id: t.gym_id });
      }
    },
    async unmarkInterest(candidateUserId) {
      await wait();
      const s = requireAuth();
      db.trainerInterest = db.trainerInterest.filter(i => !(i.candidate_user_id === candidateUserId && i.client_user_id === s.id));
    },
    async listInterestForGym(gymId) {
      await wait();
      return db.trainerInterest.filter(i => i.gym_id === gymId).map(i => ({ ...i }));
    },
  };

  /* ---------------- administradores (aprobación por el dueño) ---------------- */

  function shapeGymAdmin(a) {
    const p = profileOf(a.user_id);
    return { id: a.user_id, name: p.name, email: p.email, phone: p.phone, status: a.status };
  }

  const admins = {
    async listForGym(gymId) { await wait(); return db.gymAdmins.filter(a => a.gym_id === gymId).map(shapeGymAdmin); },
    async approve(userId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'owner') throw new Error('Solo el dueño del gimnasio aprueba administradores.');
      const me = profileOf(s.id);
      const a = db.gymAdmins.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (a) a.status = 'approved';
    },
    async reject(userId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'owner') throw new Error('Solo el dueño del gimnasio rechaza administradores.');
      const me = profileOf(s.id);
      const a = db.gymAdmins.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (a) a.status = 'rejected';
    },
  };

  /* ---------------- clientes ---------------- */

  function shapeClient(c) {
    const p = profileOf(c.user_id);
    return {
      id: c.user_id, name: p.name, email: p.email, phone: p.phone,
      planId: c.plan_id, trainerUserId: c.trainer_user_id, facePhotoKey: c.face_photo_key,
      physical: { weight: c.weight, height: c.height, age: c.age, level: c.level, goal: c.goal },
      status: c.membership_status, membershipExpiresAt: c.membership_expires_at, lastPaymentAt: c.last_payment_at,
      createdAt: c.created_at,
    };
  }

  const clients = {
    async listForGym(gymId) { await wait(); return db.clientProfiles.filter(c => c.gym_id === gymId).map(shapeClient); },
    async getSelf(userId) { await wait(); return shapeClient(db.clientProfiles.find(c => c.user_id === userId)); },
    async updatePhysical(userId, { weight, height, age, level, goal }) {
      await wait();
      Object.assign(db.clientProfiles.find(c => c.user_id === userId), { weight, height, age, level, goal });
    },
    async choosePlan(userId, planId) { await wait(); db.clientProfiles.find(c => c.user_id === userId).plan_id = planId; },
    async chooseTrainer(userId, trainerUserId) { await wait(); db.clientProfiles.find(c => c.user_id === userId).trainer_user_id = trainerUserId; },
    async setFacePhotoKey(userId, key) { await wait(); db.clientProfiles.find(c => c.user_id === userId).face_photo_key = key; },
    async suspend(userId, reason) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio suspenden un socio.');
      const me = profileOf(s.id);
      const c = db.clientProfiles.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (!c) throw new Error('Ese socio no existe en tu gimnasio.');
      c.membership_status = 'suspendido';
      c.suspended_at = new Date().toISOString();
      c.suspended_reason = (reason || '').trim() || null;
    },
    async unsuspend(userId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio reactivan un socio.');
      const me = profileOf(s.id);
      const c = db.clientProfiles.find(x => x.user_id === userId && x.gym_id === me.gym_id && x.membership_status === 'suspendido');
      if (!c) throw new Error('Ese socio no está suspendido en tu gimnasio.');
      c.membership_status = 'pendiente';
      c.suspended_at = null;
      c.suspended_reason = null;
    },
  };

  /* ---------------- fotos ---------------- */

  const photos = {
    facePath: (gymId, clientUserId) => `${gymId}/${clientUserId}/face.jpg`,
    progressPath: (gymId, clientUserId, dateStr) => `${gymId}/${clientUserId}/progress/${dateStr}.jpg`,
    async upload(path, file) { await wait(); db.storage.set(path, file); return path; },
    async signedUrl(path) { await wait(10); const f = db.storage.get(path); return f ? URL.createObjectURL(f) : null; },
  };

  /* ---------------- progreso ---------------- */

  const progress = {
    async listForClient(clientUserId) {
      await wait();
      return db.progress.filter(p => p.client_user_id === clientUserId).sort((a, b) => b.taken_at.localeCompare(a.taken_at)).map(p => ({ ...p }));
    },
    async ensureToday(clientUserId) {
      await wait();
      const today = new Date().toISOString().slice(0, 10);
      let row = db.progress.find(p => p.client_user_id === clientUserId && p.taken_at === today);
      if (!row) { row = { id: uid('pg'), client_user_id: clientUserId, storage_key: null, taken_at: today }; db.progress.push(row); }
      return { ...row };
    },
    async setPhoto(progressId, storageKey) { await wait(); db.progress.find(p => p.id === progressId).storage_key = storageKey; },
  };

  /* ---------------- rutinas ---------------- */

  function findRoutine(clientUserId, source, goal) {
    return db.routines.find(r => r.client_user_id === clientUserId && r.source === source && (source === 'ia' ? r.goal === goal : true));
  }
  function ensureRoutine(clientUserId, source, goal, authorUserId) {
    let r = findRoutine(clientUserId, source, goal);
    if (!r) { r = { id: uid('rt'), client_user_id: clientUserId, source, goal: source === 'ia' ? goal : null, author_user_id: authorUserId }; db.routines.push(r); }
    return r.id;
  }
  // Etapa 2 — cada ejercicio de rutina trae ahora sets/reps/weight_kg/
  // rest_seconds además del texto de siempre (que se sigue mandando como
  // resumen de respaldo para lo que todavía lo muestre sin parsear).
  function exercisesFor(routineId) {
    return db.routineExercises.filter(e => e.routine_id === routineId).sort((a, b) => a.position - b.position).map(e => ({
      id: e.id, text: e.text, exerciseId: e.exercise_id || null,
      sets: e.sets != null ? e.sets : null, reps: e.reps != null ? e.reps : null,
      weightKg: e.weight_kg != null ? e.weight_kg : null, restSeconds: e.rest_seconds != null ? e.rest_seconds : 60,
    }));
  }

  const routines = {
    async getAi(clientUserId, goal) {
      await wait();
      const r = findRoutine(clientUserId, 'ia', goal);
      return r ? { id: r.id, exercises: exercisesFor(r.id) } : { id: null, exercises: [] };
    },
    async getTrainer(clientUserId) {
      await wait();
      const r = findRoutine(clientUserId, 'trainer', null);
      return r ? { id: r.id, exercises: exercisesFor(r.id) } : { id: null, exercises: [] };
    },
    // `entries` ahora son objetos {text, sets, reps, weightKg, restSeconds},
    // no strings sueltos — ver buildRoutine() en src/helpers.js.
    async generateAi(clientUserId, goal, entries) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'ia', goal, null);
      db.routineExercises = db.routineExercises.filter(e => e.routine_id !== routineId);
      entries.forEach((ex, i) => db.routineExercises.push({
        id: uid('rex'), routine_id: routineId, position: i, exercise_id: ex.exerciseId || null,
        text: ex.text, sets: ex.sets ?? null, reps: ex.reps ?? null, weight_kg: ex.weightKg ?? null, rest_seconds: ex.restSeconds ?? 60,
      }));
    },
    async addTrainerExercise(clientUserId, trainerUserId, entry) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'trainer', null, trainerUserId);
      const existing = db.routineExercises.filter(e => e.routine_id === routineId);
      const nextPosition = existing.length ? Math.max(...existing.map(e => e.position)) + 1 : 0;
      db.routineExercises.push({
        id: uid('rex'), routine_id: routineId, position: nextPosition, exercise_id: entry.exerciseId || null,
        text: entry.text, sets: entry.sets ?? null, reps: entry.reps ?? null, weight_kg: entry.weightKg ?? null, rest_seconds: entry.restSeconds ?? 60,
      });
    },
    async removeExercise(exerciseId) { await wait(); db.routineExercises = db.routineExercises.filter(e => e.id !== exerciseId); },
  };

  /* ---------------- biblioteca de ejercicios ---------------- */

  const exercisesLib = {
    async list(gymId) {
      await wait();
      return db.exercises.filter(e => e.gym_id === null || e.gym_id === gymId)
        .map(e => ({ id: e.id, gymId: e.gym_id, name: e.name, muscleGroup: e.muscle_group, equipmentName: e.equipment_name, mediaKey: e.media_key, description: e.description }));
    },
    async add(gymId, { name, muscleGroup, equipmentName, description }) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio agregan ejercicios.');
      const row = { id: uid('ex'), gym_id: gymId, name, muscle_group: muscleGroup || 'General', equipment_name: equipmentName || null, media_key: null, description: description || null };
      db.exercises.push(row);
      return row.id;
    },
  };

  /* ---------------- clases y reservas ---------------- */

  const classesApi = {
    async listForGym(gymId) {
      await wait();
      return db.classes.filter(c => c.gym_id === gymId).map(c => ({ ...c }));
    },
    async listSessions(gymId, fromIso) {
      await wait();
      return db.classSessions.filter(s => s.gym_id === gymId && (!fromIso || s.starts_at >= fromIso))
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
        .map(s => ({ ...s, class: db.classes.find(c => c.id === s.class_id) }));
    },
    async listMyBookings(clientUserId) {
      await wait();
      return db.classBookings.filter(b => b.client_user_id === clientUserId && b.status === 'reservado').map(b => ({ ...b }));
    },
    async book(sessionId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'client') throw new Error('Solo un cliente puede reservar una clase.');
      const session = db.classSessions.find(cs => cs.id === sessionId);
      if (!session) throw new Error('Esa clase no existe.');
      const me = profileOf(s.id);
      if (session.gym_id !== me.gym_id) throw new Error('Esa clase es de otro gimnasio.');
      const cls = db.classes.find(c => c.id === session.class_id);
      const booked = db.classBookings.filter(b => b.session_id === sessionId && b.status === 'reservado').length;
      if (booked >= cls.capacity) throw new Error('Esta clase ya no tiene cupo.');
      let row = db.classBookings.find(b => b.session_id === sessionId && b.client_user_id === s.id);
      if (row) row.status = 'reservado';
      else { row = { id: uid('bkg'), session_id: sessionId, client_user_id: s.id, gym_id: session.gym_id, status: 'reservado' }; db.classBookings.push(row); }
      return row.id;
    },
    async cancelBooking(bookingId) {
      await wait();
      const s = requireAuth();
      const row = db.classBookings.find(b => b.id === bookingId && b.client_user_id === s.id);
      if (!row) throw new Error('Esa reserva no existe o no es tuya.');
      row.status = 'cancelado';
    },
  };

  /* ---------------- logros ---------------- */

  const achievementsApi = {
    async listCatalog() {
      await wait();
      return db.achievements.map(a => ({ ...a }));
    },
    async listForClient(clientUserId) {
      await wait();
      return db.clientAchievements.filter(a => a.client_user_id === clientUserId).map(a => ({ ...a }));
    },
    // Recalcula progreso contra datos reales — mismo criterio que
    // evaluate_achievements() del lado real, nunca se marca a mano.
    async evaluate(clientUserId) {
      await wait();
      const workouts = db.workoutSessions.filter(w => w.client_user_id === clientUserId && w.finished_at).length;
      const checkinsCount = db.checkinEvents.filter(c => c.client_user_id === clientUserId).length;
      db.achievements.forEach(a => {
        const value = a.metric === 'workouts' ? workouts : a.metric === 'checkins' ? checkinsCount : 0;
        let row = db.clientAchievements.find(ca => ca.client_user_id === clientUserId && ca.achievement_id === a.id);
        if (!row) { row = { client_user_id: clientUserId, achievement_id: a.id, progress: 0, earned_at: null }; db.clientAchievements.push(row); }
        row.progress = value;
        if (value >= a.target && !row.earned_at) row.earned_at = new Date().toISOString();
      });
    },
  };

  /* ---------------- medidas corporales ---------------- */

  const measurements = {
    async listForClient(clientUserId) {
      await wait();
      return db.bodyMeasurements.filter(m => m.client_user_id === clientUserId).sort((a, b) => a.taken_at.localeCompare(b.taken_at)).map(m => ({ ...m }));
    },
    async recordToday(clientUserId, values) {
      await wait();
      const today = new Date().toISOString().slice(0, 10);
      let row = db.bodyMeasurements.find(m => m.client_user_id === clientUserId && m.taken_at === today);
      if (!row) { row = { id: uid('bm'), client_user_id: clientUserId, taken_at: today }; db.bodyMeasurements.push(row); }
      Object.assign(row, values);
    },
  };

  /* ---------------- récords personales + sesiones de entrenamiento ---------------- */

  const workoutsApi = {
    async start(clientUserId, gymId, source) {
      await wait();
      const row = { id: uid('ws'), client_user_id: clientUserId, gym_id: gymId, source, started_at: new Date().toISOString(), finished_at: null };
      db.workoutSessions.push(row);
      return row.id;
    },
    async logSet(sessionId, clientUserId, exerciseName, setNumber, reps, weightKg) {
      await wait();
      db.exerciseLogs.push({ id: uid('exl'), workout_session_id: sessionId, client_user_id: clientUserId, exercise_name: exerciseName, set_number: setNumber, reps: reps ?? null, weight_kg: weightKg ?? null });
    },
    async finish(sessionId, clientUserId) {
      await wait();
      const row = db.workoutSessions.find(w => w.id === sessionId && w.client_user_id === clientUserId);
      if (!row) throw new Error('Esa sesión no existe, no es tuya, o ya estaba cerrada.');
      row.finished_at = new Date().toISOString();
      await achievementsApi.evaluate(clientUserId);
    },
    async getPersonalRecords(clientUserId) {
      await wait();
      const byName = new Map();
      db.exerciseLogs.filter(l => l.client_user_id === clientUserId && l.weight_kg != null).forEach(l => {
        const cur = byName.get(l.exercise_name);
        if (!cur || l.weight_kg > cur.maxWeightKg) byName.set(l.exercise_name, { exerciseName: l.exercise_name, maxWeightKg: l.weight_kg, achievedAt: l.created_at });
      });
      return [...byName.values()];
    },
    async countThisMonth(clientUserId) {
      await wait();
      const now = new Date();
      return db.workoutSessions.filter(w => {
        if (w.client_user_id !== clientUserId || !w.finished_at) return false;
        const d = new Date(w.finished_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
    },
  };

  /* ---------------- rating de entrenador ---------------- */

  const trainerReviewsApi = {
    async listForTrainer(trainerUserId) {
      await wait();
      return db.trainerReviews.filter(r => r.trainer_user_id === trainerUserId).map(r => ({ ...r }));
    },
    async rate(trainerUserId, rating, text) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'client') throw new Error('Solo un cliente puede calificar a su entrenador.');
      const me = profileOf(s.id);
      if (me.trainer_user_id !== trainerUserId && !db.clientProfiles.find(c => c.user_id === s.id && c.trainer_user_id === trainerUserId)) {
        throw new Error('Solo podés calificar a tu propio entrenador asignado.');
      }
      let row = db.trainerReviews.find(r => r.trainer_user_id === trainerUserId && r.client_user_id === s.id);
      if (row) { row.rating = rating; row.text = text; }
      else db.trainerReviews.push({ id: uid('trv'), trainer_user_id: trainerUserId, client_user_id: s.id, rating, text: text || null, created_at: new Date().toISOString() });
    },
  };

  /* ---------------- mensajes entrenador <-> cliente ---------------- */

  const messagesApi = {
    async getOrCreateConversation(otherUserId) {
      await wait();
      const s = requireAuth();
      const trainerUserId = s.role === 'trainer' ? s.id : otherUserId;
      const clientUserId = s.role === 'client' ? s.id : otherUserId;
      let conv = db.conversations.find(c => c.trainer_user_id === trainerUserId && c.client_user_id === clientUserId);
      if (!conv) {
        const me = profileOf(s.id);
        conv = { id: uid('cnv'), gym_id: me.gym_id, trainer_user_id: trainerUserId, client_user_id: clientUserId };
        db.conversations.push(conv);
      }
      return conv.id;
    },
    async list(conversationId) {
      await wait();
      return db.messages.filter(m => m.conversation_id === conversationId).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(m => ({ ...m }));
    },
    async send(conversationId, body) {
      await wait();
      const s = requireAuth();
      const row = { id: uid('msg'), conversation_id: conversationId, sender_user_id: s.id, body, created_at: new Date().toISOString(), read_at: null };
      db.messages.push(row);
      return row.id;
    },
    async listConversationsForTrainer(trainerUserId) {
      await wait();
      return db.conversations.filter(c => c.trainer_user_id === trainerUserId).map(c => ({ ...c }));
    },
  };

  /* ---------------- cobros en efectivo ---------------- */

  const payments = {
    async createCashCharge(clientUserId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio generan un cobro.');
      const c = db.clientProfiles.find(x => x.user_id === clientUserId);
      const plan = db.plans.find(p => p.id === c.plan_id) || { price: 0 };
      const trainer = c.trainer_user_id ? db.trainers.find(t => t.user_id === c.trainer_user_id) : null;
      const id = uid('pay');
      db.payments.push({ id, client_user_id: clientUserId, gym_id: c.gym_id, amount: plan.price + (trainer ? trainer.price : 0), status: 'pending', confirmed_by: null, confirmed_at: null });
      return id;
    },
    // Confirma el staff (botón manual) o el propio cliente de ese cobro
    // (escaneando el QR que le muestra el mostrador, ver
    // ACTIONS.handlePaymentScan) — nunca un cliente ajeno a ese cobro
    // puntual. El plazo respeta el plan actual del cliente (diario = 1 día,
    // anual = 1 año, el resto/sin plan = 1 mes) — ver la migración
    // 20260907000000_payment_qr_flip.sql, que es el mismo criterio del lado real.
    async confirm(paymentId) {
      await wait();
      const s = requireAuth();
      const pay = db.payments.find(p => p.id === paymentId);
      if (!pay || pay.status !== 'pending') throw new Error('Este cobro ya fue procesado.');
      const isOwnClient = s.role === 'client' && pay.client_user_id === s.id;
      if (!isStaff(s) && !isOwnClient) throw new Error('No autorizado para confirmar este cobro.');
      pay.status = 'confirmed'; pay.confirmed_by = s.id; pay.confirmed_at = new Date().toISOString();
      const c = db.clientProfiles.find(x => x.user_id === pay.client_user_id);
      const plan = db.plans.find(p => p.id === c.plan_id);
      const days = plan && plan.duration === 'diario' ? 1 : plan && plan.duration === 'anual' ? 365 : 30;
      c.membership_status = 'al_dia';
      c.last_payment_at = new Date().toISOString();
      c.membership_expires_at = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    },
    async cancel(paymentId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el staff del gimnasio puede cancelar un cobro.');
      const pay = db.payments.find(p => p.id === paymentId);
      if (!pay || pay.status !== 'pending') throw new Error('Este cobro ya fue procesado.');
      pay.status = 'cancelled';
    },
    async getPendingForClient(clientUserId) {
      await wait();
      const rows = db.payments.filter(p => p.client_user_id === clientUserId && p.status === 'pending');
      return rows.length ? { id: rows[0].id, amount: rows[0].amount, status: rows[0].status } : null;
    },
    async getById(paymentId) { await wait(); const p = db.payments.find(x => x.id === paymentId); return p ? { ...p } : null; },
  };

  /* ---------------- reseñas ---------------- */

  const reviews = {
    async listForGym(gymId) {
      await wait();
      return db.reviews.filter(r => r.gym_id === gymId).sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(r => ({ id: r.id, name: profileOf(r.client_user_id).name, rating: r.rating, text: r.text, date: r.created_at.slice(0, 10) }));
    },
    async add(gymId, clientUserId, rating, text) {
      await wait();
      db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: clientUserId, rating, text, created_at: new Date().toISOString() });
    },
  };

  /* ---------------- check-in ---------------- */
  // Espeja supabase-client.js: checkIn() es la única vía de escritura,
  // exige staff (isStaff, mismo helper de trainers.approve/reject) y que el
  // cliente pertenezca al gimnasio de quien registra.

  const checkins = {
    async checkIn(clientUserId) {
      await wait();
      const s = requireAuth();
      if (!isStaff(s)) throw new Error('Solo el administrador o el dueño del gimnasio registran un check-in.');
      const c = db.clientProfiles.find(x => x.user_id === clientUserId);
      const me = profileOf(s.id);
      if (!c || c.gym_id !== me.gym_id) throw new Error('Ese cliente no pertenece a tu gimnasio.');
      const row = { id: uid('chk'), gym_id: c.gym_id, client_user_id: clientUserId, checked_in_by: s.id, created_at: new Date().toISOString() };
      db.checkinEvents.push(row);
      await achievementsApi.evaluate(clientUserId);
      return { ...row };
    },
    async listForClient(clientUserId, limit) {
      await wait();
      return db.checkinEvents.filter(e => e.client_user_id === clientUserId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit || 5)
        .map(e => ({ id: e.id, created_at: e.created_at }));
    },
    async listTodayForGym(gymId) {
      await wait();
      const today = new Date().toISOString().slice(0, 10);
      return db.checkinEvents.filter(e => e.gym_id === gymId && e.created_at.slice(0, 10) === today)
        .map(e => ({ client_user_id: e.client_user_id, created_at: e.created_at }));
    },
    // Etapa 2 — "Asistencia": un rango (típicamente el mes actual) en vez de
    // solo "hoy", para poder marcar el calendario con los días que tuvieron
    // check-ins reales.
    async listRangeForGym(gymId, fromIso, toIso) {
      await wait();
      return db.checkinEvents.filter(e => e.gym_id === gymId && e.created_at >= fromIso && e.created_at < toIso)
        .map(e => ({ client_user_id: e.client_user_id, created_at: e.created_at }));
    },
  };

  /* ---------------- plataforma (Fase 16 — alta de dueño interna) ---------------- */

  const platform = {
    // Callable sin sesión (quien abre el link todavía no se registró) —
    // espeja la función security definer del lado real, que también está
    // grant-eada a "anon".
    async checkOwnerInvite(token) {
      await wait();
      return db.ownerInvites.some(i => i.token === token && !i.used_at);
    },
    async createOwnerInvite(note) {
      await wait();
      const s = requireAuth();
      const me = profileOf(s.id);
      if (me.role !== 'platform_admin') throw new Error('Solo el administrador de la plataforma puede generar invitaciones de dueño.');
      const token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
      db.ownerInvites.push({ token, note: note || null, created_by: s.id, created_at: new Date().toISOString(), used_at: null, used_by_user_id: null });
      return token;
    },
    // Panel de plataforma (src/screens/platform.js) — todos los gimnasios +
    // su dueño (si ya completó create_gym()).
    async listGyms() {
      await wait();
      const s = requireAuth();
      const me = profileOf(s.id);
      if (me.role !== 'platform_admin') throw new Error('Solo el administrador de la plataforma puede ver esto.');
      return db.gyms.map(g => {
        const owner = db.profiles.find(p => p.gym_id === g.id && p.role === 'owner');
        return {
          id: g.id, name: g.name, address: g.address, currency: g.currency,
          brandName: g.brand_name || '', createdAt: g.created_at || new Date().toISOString(),
          ownerName: owner ? owner.name : '', ownerEmail: owner ? owner.email : '',
        };
      });
    },
  };

  window.BolaAPI = {
    auth, gyms, equipment, plans, trainers, admins, clients, photos, progress, routines, payments, reviews, checkins, platform,
    exercisesLib, classes: classesApi, achievements: achievementsApi, measurements, workouts: workoutsApi, trainerReviews: trainerReviewsApi, messages: messagesApi,
  };
  window.__mockDb = db; // solo para inspección desde la consola durante las pruebas
})();
