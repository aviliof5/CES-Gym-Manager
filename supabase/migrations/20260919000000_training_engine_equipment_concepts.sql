-- Bolá — Fight Club Training Engine, Fase 5: conceptos de equipamiento por
-- máquina + limpieza de required_equipment de la Fase 4.
-- Ver docs/FIGHT_CLUB_TRAINING_ENGINE_AUDIT.md.
--
-- equipment.concepts = qué "conceptos" (barra, mancuernas, polea, prensa,
-- máquina de piezas, barra fija, cinta, ...) ofrece esa máquina. El motor
-- cruza esto con exercises.required_equipment: un ejercicio es posible si
-- TODOS sus conceptos están cubiertos por la unión de conceptos de las
-- máquinas ACTIVAS (equipment.is_active, agregado en la Fase 4) del gimnasio.
-- 'peso_corporal' se da siempre por sentado. Nada destructivo — columna
-- nueva nullable + un seed de mejor esfuerzo; el admin corrige desde
-- Configuración, y equipment.add() del lado del cliente completa los
-- conceptos de las máquinas nuevas.

alter table public.equipment add column if not exists concepts text[];

-- ==================== Seed de mejor esfuerzo por nombre ====================
-- Espeja inferEquipmentConcepts() de src/data.js. Solo toca filas donde
-- concepts sigue NULL (no pisa nada que un admin ya haya ajustado).
do $$
declare
  e record;
  c text[];
  s text;
begin
  for e in select id, name from public.equipment where concepts is null loop
    c := '{}';
    s := lower(coalesce(e.name, ''));
    if s ~ 'caminadora|cinta|trotadora' then c := c || 'cinta'; end if;
    if s ~ 'bicicleta|spinning' then c := c || 'bicicleta'; end if;
    if s ~ 'rack|jaula|sentadilla|smith' then c := c || array['barra','barra_fija']; end if;
    if s ~ 'banco de press|banco press|press de banca|press banca' then c := c || array['banco','barra'];
    elsif s ~ '\mbanco\M' then c := c || 'banco'; end if;
    if s ~ 'mancuerna' then c := c || 'mancuernas'; end if;
    if s ~ 'polea|cable|cruce' then c := c || 'polea'; end if;
    if s ~ 'prensa' then c := c || 'prensa'; end if;
    if s ~ 'hack' then c := c || 'maquina_hack'; end if;
    if s ~ 'asistid' then c := c || array['maquina_asistida','barra_fija']; end if;
    if s ~ 'predicador|scott' then c := c || 'banco_predicador'; end if;
    if s ~ 'dominad|paralel|fondos|barra fija|dip' then c := c || 'barra_fija'; end if;
    if s ~ 'kettlebell|pesa rusa' then c := c || 'kettlebell'; end if;
    if s ~ 'saco|boxeo|bolsa' then c := c || array['saco_boxeo','guantes']; end if;
    if s ~ 'caj[oó]n|plyo|\mbox\M' then c := c || 'cajon'; end if;
    if s ~ 'soga|battle' then c := c || 'battle_ropes'; end if;
    if s ~ 'bal[oó]n medicinal|medicine ball' then c := c || 'balon_medicinal'; end if;
    if s ~ 'barra ez|barra z' then c := c || 'barra_ez';
    elsif s ~ '\mbarra\M' and not ('barra' = any(c)) then c := c || 'barra'; end if;
    if s ~ 'remo' and not ('polea' = any(c)) and not ('maquina' = any(c)) then c := c || 'remo_ergometro'; end if;
    if s ~ 'm[aá]quina' and not ('maquina_hack' = any(c)) and not ('maquina_asistida' = any(c)) then c := c || 'maquina'; end if;
    update public.equipment set concepts = (select array_agg(distinct x) from unnest(c) x) where id = e.id;
  end loop;
end $$;

-- ==================== Limpieza de required_equipment (Fase 4) ====================
-- 4-6 ejercicios de polea quedaron pidiendo 'cuerda_saltar' porque su
-- equipment_name decía "Polea + cuerda"/"Polea/cuerda" (la cuerda es un
-- accesorio del cable, no una soga de saltar). Y algunos de barra fija
-- quedaron con 'barra' redundante. Se corrige acá.
update public.exercises
  set required_equipment = array_remove(required_equipment, 'cuerda_saltar')
  where gym_id is null and 'polea' = any(required_equipment) and 'cuerda_saltar' = any(required_equipment);

update public.exercises
  set required_equipment = array_remove(required_equipment, 'barra')
  where gym_id is null and 'barra_fija' = any(required_equipment) and 'barra' = any(required_equipment);

-- (equipment NO está en la publicación realtime a propósito — es
-- catálogo/config que no cambia mientras alguien tiene la app abierta, ver
-- 20260913000100_realtime_everything.sql. El editor de Configuración
-- refresca su propia lista tras cada cambio.)
