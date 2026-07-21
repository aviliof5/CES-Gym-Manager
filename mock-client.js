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
    clientProfiles: [],  // {user_id, gym_id, plan_id, trainer_user_id, face_photo_key, weight, height, age, level, goal, membership_status, membership_expires_at, last_payment_at}
    equipment: [],
    plans: [],
    progress: [],         // {id, client_user_id, storage_key, taken_at}
    routines: [],          // {id, client_user_id, source, goal, author_user_id}
    routineExercises: [],  // {id, routine_id, position, text}
    payments: [],           // {id, client_user_id, gym_id, amount, status, confirmed_by, confirmed_at}
    reviews: [],
    storage: new Map(),      // path -> File
  };

  let session = null; // {id, role}

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
    db.gyms.push({ id: gymId, name: 'PowerHouse Gym', address: 'Av. Central 123', hours: '6:00 - 22:00' });

    const mkUser = (id, role, name, email, phone, extra) => {
      db.profiles.push({ id, role, gym_id: gymId, name, email, phone, password: extra.password });
      if (role === 'trainer') db.trainers.push({ user_id: id, gym_id: gymId, specialty: extra.specialty, price: extra.price, status: 'approved' });
      if (role === 'client') db.clientProfiles.push({
        user_id: id, gym_id: gymId, plan_id: extra.planId, trainer_user_id: extra.trainerUserId || null,
        face_photo_key: null, weight: null, height: null, age: null, level: 'principiante', goal: extra.goal || 'perder_peso',
        membership_status: extra.status, membership_expires_at: extra.expires, last_payment_at: extra.lastPayment,
      });
    };

    mkUser('admin-1', 'admin', 'Avilio Fernández', 'admin@bola.app', '555-0100', { password: 'admin123' });
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

    mkUser('client-1', 'client', 'Carla Méndez', 'carla@bola.app', '555-0301', { password: 'cliente123', planId: 'plan-premium', trainerUserId: 'trainer-1', goal: 'ganar_musculo', status: 'al_dia', expires: plus(20), lastPayment: '2026-07-05' });
    mkUser('client-2', 'client', 'Jorge Salinas', 'jorge@bola.app', '555-0302', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-2', status: 'pendiente', expires: plus(20), lastPayment: '2026-06-10' });
    mkUser('client-3', 'client', 'Ana Torres', 'ana@bola.app', '555-0303', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-2', status: 'vencido', expires: minus(5), lastPayment: '2026-05-02' });
    mkUser('client-4', 'client', 'Luis Rivas', 'luis@bola.app', '555-0304', { password: 'cliente123', planId: 'plan-premium', trainerUserId: 'trainer-1', status: 'al_dia', expires: plus(20), lastPayment: '2026-01-15' });
    mkUser('client-5', 'client', 'Sofía Paredes', 'sofia@bola.app', '555-0305', { password: 'cliente123', planId: 'plan-basico', trainerUserId: 'trainer-3', status: 'al_dia', expires: plus(20), lastPayment: '2026-07-18' });

    db.progress.push({ id: uid('pg'), client_user_id: 'client-1', storage_key: null, taken_at: minus(2) });
    db.progress.push({ id: uid('pg'), client_user_id: 'client-1', storage_key: null, taken_at: minus(1) });

    const routineId = uid('rt');
    db.routines.push({ id: routineId, client_user_id: 'client-1', source: 'trainer', goal: null, author_user_id: 'trainer-1' });
    ['Sentadilla en rack - 4x8', 'Press banca - 4x8', 'Remo - 10 min'].forEach((text, i) =>
      db.routineExercises.push({ id: uid('rex'), routine_id: routineId, position: i, text }));

    db.payments.push({ id: uid('pay'), client_user_id: 'client-1', gym_id: gymId, amount: 80, status: 'confirmed', confirmed_by: 'admin-1', confirmed_at: '2026-07-05' });
    db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: 'client-1', rating: 5, text: 'Excelente atención y máquinas nuevas.', created_at: '2026-07-10' });
    db.reviews.push({ id: uid('rv'), gym_id: gymId, client_user_id: 'client-2', rating: 4, text: 'Falta más espacio en horario pico.', created_at: '2026-07-08' });
  })();

  /* ---------------- auth ---------------- */

  const auth = {
    // Devuelven { user, session } igual que el cliente real, con session
    // siempre presente — el mock simula un proyecto sin confirmación de
    // correo (el caso "hay que confirmar" se probó a mano contra Supabase
    // real, ver conversación; acá solo se cubre el camino feliz).
    async signUpAdmin({ name, email, phone, password }) {
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('admin');
      db.profiles.push({ id, role: 'admin', gym_id: null, name, email, phone, password });
      session = { id, role: 'admin' };
      return { user: { id }, session };
    },
    async signUpTrainer({ name, email, phone, password, specialty, price }) {
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('trainer');
      db.profiles.push({ id, role: 'trainer', gym_id: null, name, email, phone, password });
      db.trainers.push({ user_id: id, gym_id: null, specialty: specialty || 'General', price: Number(price) || 0, status: 'pending' });
      session = { id, role: 'trainer' };
      return { user: { id }, session };
    },
    async signUpClient({ name, email, phone, password }) {
      await wait();
      if (db.profiles.some(p => p.email === email)) throw new Error('Ya existe una cuenta con ese correo.');
      const id = uid('client');
      db.profiles.push({ id, role: 'client', gym_id: null, name, email, phone, password });
      db.clientProfiles.push({ user_id: id, gym_id: null, plan_id: null, trainer_user_id: null, face_photo_key: null, weight: null, height: null, age: null, level: 'principiante', goal: 'perder_peso', membership_status: 'pendiente', membership_expires_at: null, last_payment_at: null });
      session = { id, role: 'client' };
      return { user: { id }, session };
    },
    async signIn({ email, password }) {
      await wait();
      const p = db.profiles.find(x => x.email === email && x.password === password);
      if (!p) throw new Error('Correo o contraseña incorrectos.');
      session = { id: p.id, role: p.role };
    },
    async signOut() { await wait(); session = null; },
    async getSession() { await wait(); return session ? { user: { id: session.id } } : null; },
    async getMyProfile() {
      await wait();
      if (!session) return null;
      const p = profileOf(session.id);
      return { id: p.id, role: p.role, gym_id: p.gym_id, name: p.name, email: p.email, phone: p.phone };
    },
  };

  /* ---------------- gimnasio ---------------- */

  const gyms = {
    async listAll() { await wait(); return [...db.gyms]; },
    async get(gymId) { await wait(); return db.gyms.find(g => g.id === gymId) || null; },
    async create({ name, address, hours }) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'admin') throw new Error('Solo una cuenta de administrador puede crear un gimnasio.');
      const me = profileOf(s.id);
      if (me.gym_id) throw new Error('Esta cuenta ya tiene un gimnasio asignado.');
      const id = uid('gym');
      db.gyms.push({ id, name, address, hours });
      me.gym_id = id;
      return id;
    },
    async join(gymId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'trainer' && s.role !== 'client') throw new Error('Solo entrenadores y clientes se unen con esta función.');
      const me = profileOf(s.id);
      if (me.gym_id) throw new Error('Esta cuenta ya pertenece a un gimnasio.');
      if (!db.gyms.some(g => g.id === gymId)) throw new Error('Ese gimnasio no existe.');
      me.gym_id = gymId;
      if (s.role === 'trainer') db.trainers.find(t => t.user_id === s.id).gym_id = gymId;
      if (s.role === 'client') db.clientProfiles.find(c => c.user_id === s.id).gym_id = gymId;
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
    return { id: t.user_id, name: p.name, email: p.email, phone: p.phone, specialty: t.specialty, price: Number(t.price), status: t.status };
  }

  const trainers = {
    async listForGym(gymId) { await wait(); return db.trainers.filter(t => t.gym_id === gymId).map(shapeTrainer); },
    async listApprovedForGym(gymId) { await wait(); return db.trainers.filter(t => t.gym_id === gymId && t.status === 'approved').map(shapeTrainer); },
    async approve(userId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'admin') throw new Error('Solo el administrador del gimnasio aprueba entrenadores.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (t) t.status = 'approved';
    },
    async reject(userId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'admin') throw new Error('Solo el administrador del gimnasio rechaza entrenadores.');
      const me = profileOf(s.id);
      const t = db.trainers.find(x => x.user_id === userId && x.gym_id === me.gym_id);
      if (t) t.status = 'rejected';
    },
    async updateProfile(userId, { specialty, price }) {
      await wait();
      const t = db.trainers.find(x => x.user_id === userId);
      Object.assign(t, { specialty, price });
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
  function exercisesFor(routineId) {
    return db.routineExercises.filter(e => e.routine_id === routineId).sort((a, b) => a.position - b.position).map(e => ({ id: e.id, text: e.text }));
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
    async generateAi(clientUserId, goal, exerciseTexts) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'ia', goal, null);
      db.routineExercises = db.routineExercises.filter(e => e.routine_id !== routineId);
      exerciseTexts.forEach((text, i) => db.routineExercises.push({ id: uid('rex'), routine_id: routineId, position: i, text }));
    },
    async addTrainerExercise(clientUserId, trainerUserId, text) {
      await wait();
      const routineId = ensureRoutine(clientUserId, 'trainer', null, trainerUserId);
      const existing = db.routineExercises.filter(e => e.routine_id === routineId);
      const nextPosition = existing.length ? Math.max(...existing.map(e => e.position)) + 1 : 0;
      db.routineExercises.push({ id: uid('rex'), routine_id: routineId, position: nextPosition, text });
    },
    async removeExercise(exerciseId) { await wait(); db.routineExercises = db.routineExercises.filter(e => e.id !== exerciseId); },
  };

  /* ---------------- cobros en efectivo ---------------- */

  const payments = {
    async createCashCharge(clientUserId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'admin') throw new Error('Solo el administrador del gimnasio genera un cobro.');
      const c = db.clientProfiles.find(x => x.user_id === clientUserId);
      const plan = db.plans.find(p => p.id === c.plan_id) || { price: 0 };
      const trainer = c.trainer_user_id ? db.trainers.find(t => t.user_id === c.trainer_user_id) : null;
      const id = uid('pay');
      db.payments.push({ id, client_user_id: clientUserId, gym_id: c.gym_id, amount: plan.price + (trainer ? trainer.price : 0), status: 'pending', confirmed_by: null, confirmed_at: null });
      return id;
    },
    async confirm(paymentId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'admin') throw new Error('Solo el staff del gimnasio puede confirmar un cobro.');
      const pay = db.payments.find(p => p.id === paymentId);
      if (!pay || pay.status !== 'pending') throw new Error('Este cobro ya fue procesado.');
      pay.status = 'confirmed'; pay.confirmed_by = s.id; pay.confirmed_at = new Date().toISOString();
      const c = db.clientProfiles.find(x => x.user_id === pay.client_user_id);
      c.membership_status = 'al_dia';
      c.last_payment_at = new Date().toISOString();
      c.membership_expires_at = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    },
    async cancel(paymentId) {
      await wait();
      const s = requireAuth();
      if (s.role !== 'admin') throw new Error('Solo el staff del gimnasio puede cancelar un cobro.');
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

  window.BolaAPI = { auth, gyms, equipment, plans, trainers, clients, photos, progress, routines, payments, reviews };
  window.__mockDb = db; // solo para inspección desde la consola durante las pruebas
})();
