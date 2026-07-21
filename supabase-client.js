/* Bolá — capa de acceso a datos sobre Supabase.
   Cada función mapea 1:1 a algo del esquema/backend (supabase/migrations).
   app.js no debería llamar a `supabase.from(...)` directo en ningún lado —
   solo a BolaAPI.* — así el mock de pruebas (mock-client.js) puede
   sustituir esta capa entera sin tocar app.js. */

'use strict';

(function () {
  const cfg = window.BOLA_CONFIG || {};
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  const PHOTO_BUCKET = 'photos';
  const SIGNED_URL_TTL = 60 * 60; // 1 hora

  function unwrap({ data, error }) {
    if (error) throw error;
    return data;
  }

  /* ---------------- auth ---------------- */

  const auth = {
    async signUpAdmin({ name, email, phone, password }) {
      return unwrap(await client.auth.signUp({
        email, password,
        options: { data: { role: 'admin', name, phone } },
      }));
    },

    async signUpTrainer({ name, email, phone, password, specialty, price }) {
      return unwrap(await client.auth.signUp({
        email, password,
        options: { data: { role: 'trainer', name, phone, specialty, price } },
      }));
    },

    async signUpClient({ name, email, phone, password }) {
      return unwrap(await client.auth.signUp({
        email, password,
        options: { data: { role: 'client', name, phone } },
      }));
    },

    async signIn({ email, password }) {
      return unwrap(await client.auth.signInWithPassword({ email, password }));
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },

    async getSession() {
      // supabase-js envuelve la sesión en { session }, no la devuelve
      // directa — a diferencia de casi todo lo demás en este archivo,
      // unwrap() sola no alcanza acá (se queda con el objeto envoltorio,
      // que es truthy aunque session sea null, y boot() nunca detecta que
      // no hay sesión activa).
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return data.session;
    },

    async getMyProfile() {
      const { data: { user } } = await client.auth.getUser();
      if (!user) return null;
      return unwrap(await client.from('profiles').select('id, role, gym_id, name, email, phone').eq('id', user.id).single());
    },
  };

  /* ---------------- gimnasio ---------------- */

  const gyms = {
    async listAll() {
      return unwrap(await client.from('gyms').select('id, name, address, hours').order('name', { ascending: true }));
    },

    async get(gymId) {
      return unwrap(await client.from('gyms').select('id, name, address, hours').eq('id', gymId).single());
    },

    async create({ name, address, hours }) {
      return unwrap(await client.rpc('create_gym', { p_name: name, p_address: address, p_hours: hours }));
    },

    async join(gymId) {
      const { error } = await client.rpc('join_gym', { p_gym_id: gymId });
      if (error) throw error;
    },
  };

  /* ---------------- equipo ---------------- */

  const equipment = {
    async list(gymId) {
      return unwrap(await client.from('equipment').select('id, name').eq('gym_id', gymId).order('created_at'));
    },
    async add(gymId, name) {
      return unwrap(await client.from('equipment').insert({ gym_id: gymId, name }).select('id, name').single());
    },
    async remove(id) {
      const { error } = await client.from('equipment').delete().eq('id', id);
      if (error) throw error;
    },
  };

  /* ---------------- planes ---------------- */

  const plans = {
    async list(gymId) {
      return unwrap(await client.from('plans').select('id, name, price, duration').eq('gym_id', gymId).order('created_at'));
    },
    async add(gymId, { name, price, duration }) {
      return unwrap(await client.from('plans').insert({ gym_id: gymId, name, price, duration }).select().single());
    },
    async update(id, { name, price, duration }) {
      return unwrap(await client.from('plans').update({ name, price, duration }).eq('id', id).select().single());
    },
    async remove(id) {
      const { error } = await client.from('plans').delete().eq('id', id);
      if (error) throw error;
    },
  };

  /* ---------------- entrenadores ---------------- */
  // `trainers` no tiene nombre/correo propios — vienen de `profiles` vía el
  // FK trainers.user_id -> profiles.id, que PostgREST puede embeber directo.

  const TRAINER_SELECT = 'user_id, specialty, price, status, profiles!inner(name, email, phone)';

  function shapeTrainer(row) {
    return {
      id: row.user_id,
      name: row.profiles.name,
      email: row.profiles.email,
      phone: row.profiles.phone,
      specialty: row.specialty,
      price: Number(row.price),
      status: row.status,
    };
  }

  const trainers = {
    async listForGym(gymId) {
      const rows = unwrap(await client.from('trainers').select(TRAINER_SELECT).eq('gym_id', gymId));
      return rows.map(shapeTrainer);
    },
    async listApprovedForGym(gymId) {
      const rows = unwrap(await client.from('trainers').select(TRAINER_SELECT).eq('gym_id', gymId).eq('status', 'approved'));
      return rows.map(shapeTrainer);
    },
    async approve(userId) {
      const { error } = await client.rpc('approve_trainer', { p_trainer_user_id: userId });
      if (error) throw error;
    },
    async reject(userId) {
      const { error } = await client.rpc('reject_trainer', { p_trainer_user_id: userId });
      if (error) throw error;
    },
    async updateProfile(userId, { specialty, price }) {
      const { error } = await client.from('trainers').update({ specialty, price }).eq('user_id', userId);
      if (error) throw error;
    },
  };

  /* ---------------- clientes ---------------- */

  const CLIENT_SELECT = `
    user_id, gym_id, plan_id, trainer_user_id, face_photo_key,
    weight, height, age, level, goal,
    membership_status, membership_expires_at, last_payment_at,
    profiles!inner(name, email, phone)
  `;

  function shapeClient(row) {
    return {
      id: row.user_id,
      name: row.profiles.name,
      email: row.profiles.email,
      phone: row.profiles.phone,
      planId: row.plan_id,
      trainerUserId: row.trainer_user_id,
      facePhotoKey: row.face_photo_key,
      physical: { weight: row.weight, height: row.height, age: row.age, level: row.level, goal: row.goal },
      status: row.membership_status,
      membershipExpiresAt: row.membership_expires_at,
      lastPaymentAt: row.last_payment_at,
    };
  }

  const clients = {
    async listForGym(gymId) {
      const rows = unwrap(await client.from('client_profiles').select(CLIENT_SELECT).eq('gym_id', gymId));
      return rows.map(shapeClient);
    },
    async getSelf(userId) {
      const row = unwrap(await client.from('client_profiles').select(CLIENT_SELECT).eq('user_id', userId).single());
      return shapeClient(row);
    },
    async updatePhysical(userId, { weight, height, age, level, goal }) {
      const { error } = await client.from('client_profiles').update({ weight, height, age, level, goal }).eq('user_id', userId);
      if (error) throw error;
    },
    async choosePlan(userId, planId) {
      const { error } = await client.from('client_profiles').update({ plan_id: planId }).eq('user_id', userId);
      if (error) throw error;
    },
    async chooseTrainer(userId, trainerUserId) {
      const { error } = await client.from('client_profiles').update({ trainer_user_id: trainerUserId }).eq('user_id', userId);
      if (error) throw error;
    },
    async setFacePhotoKey(userId, key) {
      const { error } = await client.from('client_profiles').update({ face_photo_key: key }).eq('user_id', userId);
      if (error) throw error;
    },
  };

  /* ---------------- fotos (storage) ---------------- */
  // Ruta: {gymId}/{clientUserId}/face.jpg  ó  {gymId}/{clientUserId}/progress/{fecha}.jpg
  // (ver supabase/migrations/..._storage.sql — las políticas leen esos dos
  // primeros segmentos de la ruta).

  const photos = {
    facePath: (gymId, clientUserId) => `${gymId}/${clientUserId}/face.jpg`,
    progressPath: (gymId, clientUserId, dateStr) => `${gymId}/${clientUserId}/progress/${dateStr}.jpg`,

    async upload(path, file) {
      const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, file, { upsert: true });
      if (error) throw error;
      return path;
    },

    async signedUrl(path) {
      if (!path) return null;
      const { data, error } = await client.storage.from(PHOTO_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
      if (error) throw error;
      return data.signedUrl;
    },
  };

  /* ---------------- progreso ---------------- */

  const progress = {
    async listForClient(clientUserId) {
      return unwrap(await client.from('progress_photos').select('id, storage_key, taken_at').eq('client_user_id', clientUserId).order('taken_at', { ascending: false }));
    },
    // Idempotente: si ya existe una foto de hoy, la devuelve en vez de fallar
    // por la restricción unique(client_user_id, taken_at).
    async ensureToday(clientUserId) {
      const today = new Date().toISOString().slice(0, 10);
      const existing = unwrap(await client.from('progress_photos').select('id, storage_key, taken_at').eq('client_user_id', clientUserId).eq('taken_at', today));
      if (existing.length) return existing[0];
      return unwrap(await client.from('progress_photos').insert({ client_user_id: clientUserId, taken_at: today }).select('id, storage_key, taken_at').single());
    },
    async setPhoto(progressId, storageKey) {
      const { error } = await client.from('progress_photos').update({ storage_key: storageKey }).eq('id', progressId);
      if (error) throw error;
    },
  };

  /* ---------------- rutinas ---------------- */

  async function ensureRoutine(clientUserId, source, goal, authorUserId) {
    let q = client.from('routines').select('id').eq('client_user_id', clientUserId).eq('source', source);
    q = source === 'ia' ? q.eq('goal', goal) : q.is('goal', null);
    const found = unwrap(await q);
    if (found.length) return found[0].id;
    const created = unwrap(await client.from('routines')
      .insert({ client_user_id: clientUserId, source, goal: source === 'ia' ? goal : null, author_user_id: authorUserId })
      .select('id').single());
    return created.id;
  }

  async function loadRoutine(clientUserId, source, goal) {
    let q = client.from('routines').select('id, updated_at').eq('client_user_id', clientUserId).eq('source', source);
    q = source === 'ia' ? q.eq('goal', goal) : q.is('goal', null);
    const rows = unwrap(await q);
    if (!rows.length) return { id: null, exercises: [] };
    const exercises = unwrap(await client.from('routine_exercises').select('id, text').eq('routine_id', rows[0].id).order('position'));
    return { id: rows[0].id, exercises };
  }

  const routines = {
    getAi: (clientUserId, goal) => loadRoutine(clientUserId, 'ia', goal),
    getTrainer: (clientUserId) => loadRoutine(clientUserId, 'trainer', null),

    async generateAi(clientUserId, goal, exerciseTexts) {
      const routineId = await ensureRoutine(clientUserId, 'ia', goal, null);
      const { error: delErr } = await client.from('routine_exercises').delete().eq('routine_id', routineId);
      if (delErr) throw delErr;
      if (exerciseTexts.length) {
        const rows = exerciseTexts.map((text, i) => ({ routine_id: routineId, position: i, text }));
        const { error } = await client.from('routine_exercises').insert(rows);
        if (error) throw error;
      }
    },

    async addTrainerExercise(clientUserId, trainerUserId, text) {
      const routineId = await ensureRoutine(clientUserId, 'trainer', null, trainerUserId);
      const maxRows = unwrap(await client.from('routine_exercises').select('position').eq('routine_id', routineId).order('position', { ascending: false }).limit(1));
      const nextPosition = maxRows.length ? maxRows[0].position + 1 : 0;
      const { error } = await client.from('routine_exercises').insert({ routine_id: routineId, position: nextPosition, text });
      if (error) throw error;
    },

    async removeExercise(exerciseId) {
      const { error } = await client.from('routine_exercises').delete().eq('id', exerciseId);
      if (error) throw error;
    },
  };

  /* ---------------- cobros en efectivo ---------------- */
  // create/confirm/cancel pasan por RPC a propósito — son las únicas
  // funciones que pueden tocar payments/membership_status, y exigen rol
  // admin en el servidor. Ver supabase/migrations/..._functions.sql.

  const payments = {
    async createCashCharge(clientUserId) {
      return unwrap(await client.rpc('create_cash_charge', { p_client_user_id: clientUserId }));
    },
    async confirm(paymentId) {
      const { error } = await client.rpc('confirm_cash_payment', { p_payment_id: paymentId });
      if (error) throw error;
    },
    async cancel(paymentId) {
      const { error } = await client.rpc('cancel_cash_payment', { p_payment_id: paymentId });
      if (error) throw error;
    },
    async getPendingForClient(clientUserId) {
      const rows = unwrap(await client.from('payments').select('id, amount, status').eq('client_user_id', clientUserId).eq('status', 'pending').order('created_at', { ascending: false }).limit(1));
      return rows[0] || null;
    },
    async getById(paymentId) {
      return unwrap(await client.from('payments').select('id, client_user_id, amount, status').eq('id', paymentId).single());
    },
  };

  /* ---------------- reseñas ---------------- */

  const reviews = {
    async listForGym(gymId) {
      // reviews.client_user_id -> client_profiles.user_id -> profiles.id:
      // dos saltos, no uno — PostgREST no infiere un embed directo
      // reviews->profiles porque no hay FK directa entre esas dos tablas.
      const rows = unwrap(await client.from('reviews')
        .select('id, rating, text, created_at, client_profiles!inner(profiles!inner(name))')
        .eq('gym_id', gymId).order('created_at', { ascending: false }));
      return rows.map(r => ({ id: r.id, name: r.client_profiles.profiles.name, rating: r.rating, text: r.text, date: r.created_at.slice(0, 10) }));
    },
    async add(gymId, clientUserId, rating, text) {
      const { error } = await client.from('reviews').insert({ gym_id: gymId, client_user_id: clientUserId, rating, text });
      if (error) throw error;
    },
  };

  window.BolaAPI = { auth, gyms, equipment, plans, trainers, clients, photos, progress, routines, payments, reviews };
})();
