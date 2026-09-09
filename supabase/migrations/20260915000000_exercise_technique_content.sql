-- Bolá — contenido real por ejercicio (para qué sirve, qué músculo
-- trabaja, buenas prácticas y errores comunes) + el patrón de movimiento
-- que arma la ilustración esquemática de 2 etapas en la ficha de cada
-- ejercicio (ver src/diagrams.js — son diagramas de figura de palitos
-- generados por código, NO fotos: seguimos sin tener fotos reales de cada
-- ejercicio y nunca se inventa una que parezca serlo, mismo criterio que
-- las medallas de logros).

alter table public.exercises add column if not exists muscle_worked text;
alter table public.exercises add column if not exists purpose text;
alter table public.exercises add column if not exists best_practices text[];
alter table public.exercises add column if not exists common_mistakes text[];
alter table public.exercises add column if not exists diagram_pattern text;

update public.exercises set
  muscle_worked = 'Cuádriceps, glúteos e isquiotibiales, con el core estabilizando el tronco.',
  purpose = 'El ejercicio base para ganar fuerza y volumen en toda la pierna — el que más carga tolera con el tiempo.',
  best_practices = array['Pecho arriba, mirada al frente, peso repartido en todo el pie.', 'Bajá hasta que el muslo quede paralelo al piso o más, sin perder la curva lumbar.'],
  common_mistakes = array['Las rodillas colapsan hacia adentro al subir.', 'Levantar los talones o irse sobre la punta de los pies.'],
  diagram_pattern = 'squat'
  where gym_id is null and name = 'Sentadilla con barra';

update public.exercises set
  muscle_worked = 'Cuádriceps y glúteos, con menos carga en la zona lumbar que la sentadilla con barra.',
  purpose = 'La mejor entrada a la sentadilla — la mancuerna al pecho ayuda a mantener el torso vertical sin pensarlo.',
  best_practices = array['Codos por dentro de las rodillas al final del descenso.', 'Empujá el piso con los talones para subir.'],
  common_mistakes = array['Dejar caer el peso lejos del cuerpo, perdiendo el equilibrio.', 'Redondear la espalda baja al llegar abajo.'],
  diagram_pattern = 'squat'
  where gym_id is null and name = 'Sentadilla goblet';

update public.exercises set
  muscle_worked = 'Cuádriceps principalmente, con el core y la espalda alta trabajando para sostener la barra.',
  purpose = 'Más exigente para el cuádriceps y el torso que la sentadilla tradicional, con menos carga en la zona lumbar.',
  best_practices = array['Codos altos, apuntando al frente, para que la barra no se caiga.', 'Bajá recto, sin llevar la cadera muy atrás.'],
  common_mistakes = array['Dejar caer los codos, lo que hace resbalar la barra.', 'Usar más peso del que la movilidad de muñeca permite.'],
  diagram_pattern = 'squat'
  where gym_id is null and name = 'Sentadilla frontal';

update public.exercises set
  muscle_worked = 'Cuádriceps de forma muy dirigida — la máquina fija el recorrido y saca a la espalda baja de la ecuación.',
  purpose = 'Sumar volumen a la pierna con una técnica más segura para quien todavía no domina la sentadilla libre.',
  best_practices = array['Espalda y cabeza apoyadas en el respaldo durante todo el recorrido.', 'Pies un poco adelantados a la cadera para no forzar la rodilla.'],
  common_mistakes = array['Bajar tan hondo que la cadera se despega del respaldo.', 'Frenar de golpe abajo en vez de controlar el descenso.'],
  diagram_pattern = 'squat'
  where gym_id is null and name = 'Sentadilla hack';

update public.exercises set
  muscle_worked = 'Cuádriceps, glúteos e isquiotibiales, según dónde se apoyen los pies en la plataforma.',
  purpose = 'Mover mucho peso en las piernas sin exigirle equilibrio ni estabilidad al tronco.',
  best_practices = array['Pies a la altura de los hombros, apoyados enteros en la plataforma.', 'No bajes tanto que la zona lumbar se despegue del asiento.'],
  common_mistakes = array['Bloquear las rodillas del todo arriba (le saca la tensión al músculo y castiga la articulación).', 'Apoyar solo la punta de los pies.'],
  diagram_pattern = 'squat'
  where gym_id is null and name = 'Prensa de piernas';

update public.exercises set
  muscle_worked = 'Isquiotibiales y glúteos — el ejercicio de bisagra de cadera por excelencia.',
  purpose = 'Fortalecer toda la cadena posterior de la pierna, clave para correr, saltar y proteger la zona lumbar.',
  best_practices = array['Llevá la cadera hacia atrás, no hacia abajo — las rodillas casi no se doblan.', 'La barra roza los muslos y las canillas durante todo el recorrido.'],
  common_mistakes = array['Redondear la espalda baja en vez de mantenerla recta.', 'Confundirlo con una sentadilla y flexionar mucho la rodilla.'],
  diagram_pattern = 'hinge'
  where gym_id is null and name = 'Peso muerto rumano';

update public.exercises set
  muscle_worked = 'Isquiotibiales, glúteos y espalda baja como estabilizadora.',
  purpose = 'Misma bisagra de cadera que el peso muerto rumano, con mancuernas para quien recién arranca con el patrón.',
  best_practices = array['Bajá las mancuernas pegadas a las piernas.', 'Terminá el movimiento apretando el glúteo, no arqueando la espalda.'],
  common_mistakes = array['Alejar las mancuernas del cuerpo, sobrecargando la espalda baja.', 'Bajar demasiado sin la movilidad de isquios para sostener la técnica.'],
  diagram_pattern = 'hinge'
  where gym_id is null and name = 'Peso muerto con mancuernas';

update public.exercises set
  muscle_worked = 'Glúteo mayor de forma muy directa — el ejercicio que más lo aísla de toda la lista.',
  purpose = 'Ganar fuerza y forma en el glúteo sin cargarle nada extra a la zona lumbar.',
  best_practices = array['Apoyá la parte alta de la espalda en el banco, no la media.', 'Arriba, el cuerpo queda en línea recta de hombro a rodilla — sin hiperextender la espalda.'],
  common_mistakes = array['Empujar con la espalda baja en vez de con el glúteo.', 'No completar el recorrido arriba, quedándose a mitad de camino.'],
  diagram_pattern = 'hinge'
  where gym_id is null and name = 'Hip thrust con barra';

update public.exercises set
  muscle_worked = 'Glúteo mayor, con los isquiotibiales ayudando.',
  purpose = 'La versión sin banco del hip thrust — para activar el glúteo antes de entrenar piernas o para principiantes.',
  best_practices = array['Talones cerca de los glúteos antes de empezar.', 'Subí apretando el glúteo, sin empujar con la espalda.'],
  common_mistakes = array['Apoyar los pies muy lejos del cuerpo, perdiendo tensión en el glúteo.', 'Arquear demasiado la espalda baja arriba.'],
  diagram_pattern = 'hinge'
  where gym_id is null and name = 'Puente de glúteos';

update public.exercises set
  muscle_worked = 'Cuádriceps y glúteos de cada pierna por separado, más el equilibrio y el core.',
  purpose = 'Fuerza de pierna unilateral — corrige desbalances entre un lado del cuerpo y el otro.',
  best_practices = array['El torso se mantiene derecho durante todo el paso.', 'La rodilla de adelante baja hasta quedar cerca de 90°, sin pasar mucho la punta del pie.'],
  common_mistakes = array['Dar un paso demasiado corto, que fuerza la rodilla de adelante hacia el frente.', 'Perder el equilibrio por ir muy rápido.'],
  diagram_pattern = 'lunge'
  where gym_id is null and name = 'Zancadas caminando';

update public.exercises set
  muscle_worked = 'Cuádriceps y glúteos, con menos exigencia de equilibrio que la zancada caminando.',
  purpose = 'La variante más amigable para la rodilla de las zancadas — buena entrada al trabajo unilateral de pierna.',
  best_practices = array['El pie de atrás solo toca de punta, apoyando el peso en la pierna de adelante.', 'Bajá recto, no hacia adelante.'],
  common_mistakes = array['Cargar peso en el pie de atrás en vez de en el de adelante.', 'Dar un paso atrás demasiado corto.'],
  diagram_pattern = 'lunge'
  where gym_id is null and name = 'Zancada atrás';

update public.exercises set
  muscle_worked = 'Cuádriceps y glúteo de la pierna de adelante, con gran exigencia de equilibrio.',
  purpose = 'La zancada más exigente — el pie trasero elevado obliga a toda la fuerza a salir de una sola pierna.',
  best_practices = array['Apoyá solo la punta del pie de atrás en el banco.', 'El pie de adelante va lo bastante lejos como para que la rodilla no pase mucho la punta al bajar.'],
  common_mistakes = array['Poner el pie de adelante muy cerca del banco, cargando de más la rodilla.', 'Dejar que la cadera rote hacia un costado.'],
  diagram_pattern = 'lunge'
  where gym_id is null and name = 'Split squat búlgaro';

update public.exercises set
  muscle_worked = 'Cuádriceps y glúteos de la pierna que sube, con equilibrio de todo el cuerpo.',
  purpose = 'Fuerza de pierna unilateral usando un cajón o banco — traduce directo a subir escaleras y correr.',
  best_practices = array['Subí empujando con el talón de la pierna de arriba, no con el impulso de la de abajo.', 'Parate del todo arriba antes de bajar con control.'],
  common_mistakes = array['Impulsarse con la pierna de abajo en vez de trabajar con la de arriba.', 'Usar un banco tan alto que fuerza la cadera.'],
  diagram_pattern = 'lunge'
  where gym_id is null and name = 'Step-up';

update public.exercises set
  muscle_worked = 'Cuádriceps de forma aislada — ningún otro músculo ayuda.',
  purpose = 'Aislar el cuádriceps para sumar volumen extra después de los ejercicios compuestos de pierna.',
  best_practices = array['Espalda apoyada en el respaldo durante todo el recorrido.', 'Subí hasta extender del todo la rodilla, sin rebotar.'],
  common_mistakes = array['Usar tanto peso que hay que impulsarse con la espalda.', 'Bajar de golpe en vez de controlar la vuelta.'],
  diagram_pattern = 'leg_machine'
  where gym_id is null and name = 'Extensión de piernas';

update public.exercises set
  muscle_worked = 'Isquiotibiales — el complemento directo de la extensión de piernas.',
  purpose = 'Aislar los isquiotibiales, muy descuidados frente al cuádriceps en la mayoría de las rutinas.',
  best_practices = array['Cadera pegada al banco durante todo el movimiento.', 'Llevá el talón hacia el glúteo con control, sin tirón.'],
  common_mistakes = array['Levantar la cadera del banco para "ayudar" con el peso.', 'Soltar el peso de golpe en la bajada.'],
  diagram_pattern = 'leg_machine'
  where gym_id is null and name = 'Curl femoral tumbado';

update public.exercises set
  muscle_worked = 'Isquiotibiales, en una posición más cómoda para la zona lumbar que la versión tumbada.',
  purpose = 'Misma idea que el curl femoral tumbado, mejor opción para quien no está cómodo boca abajo.',
  best_practices = array['Ajustá el respaldo para que la rodilla quede alineada con el eje de la máquina.', 'Doblá la rodilla del todo antes de volver.'],
  common_mistakes = array['Dejar el respaldo mal ajustado, forzando la rodilla en un ángulo raro.', 'Usar impulso en vez de fuerza controlada.'],
  diagram_pattern = 'leg_machine'
  where gym_id is null and name = 'Curl femoral sentado';

update public.exercises set
  muscle_worked = 'Gastrocnemio (pantorrilla), con la rodilla extendida.',
  purpose = 'Fuerza y volumen de pantorrilla — el músculo que más cuesta hacer crecer si no se entrena directo.',
  best_practices = array['Subí hasta la punta de los dedos del todo, pausá arriba.', 'Bajá hasta sentir un buen estiramiento en la pantorrilla.'],
  common_mistakes = array['Hacer el recorrido muy corto, a media subida.', 'Rebotar en vez de controlar cada repetición.'],
  diagram_pattern = 'leg_machine'
  where gym_id is null and name = 'Elevación de talones de pie';

update public.exercises set
  muscle_worked = 'Sóleo (pantorrilla profunda), con la rodilla flexionada.',
  purpose = 'Complementa la elevación de pie — con la rodilla doblada se enfatiza un músculo distinto de la pantorrilla.',
  best_practices = array['Rodillas dobladas a 90° durante todo el ejercicio.', 'Subí y bajá el talón en rango completo.'],
  common_mistakes = array['Usar un rango tan corto que casi no hay movimiento.', 'Cargar tanto peso que el talón no baja del todo.'],
  diagram_pattern = 'leg_machine'
  where gym_id is null and name = 'Elevación de talones sentado';

update public.exercises set
  muscle_worked = 'Glúteo medio — estabiliza la cadera al caminar y correr, y da forma lateral al glúteo.',
  purpose = 'Fortalecer un músculo que casi no trabaja en los ejercicios grandes de pierna, pero que sostiene la cadera.',
  best_practices = array['Espalda apoyada, movimiento controlado hacia afuera.', 'Volvé sin dejar que el peso tire de golpe hacia adentro.'],
  common_mistakes = array['Inclinar el torso para ayudarse con el peso del cuerpo.', 'Usar tanto peso que el rango se acorta mucho.'],
  diagram_pattern = 'leg_machine'
  where gym_id is null and name = 'Abducción de cadera';

update public.exercises set
  muscle_worked = 'Aductores (cara interna del muslo).',
  purpose = 'Complementa a la abducción — fortalece el lado interno de la cadera, clave para deportes con cambios de dirección.',
  best_practices = array['Movimiento controlado, sin tirones, en todo el rango.', 'No fuerces más allá de donde la cadera se siente cómoda.'],
  common_mistakes = array['Empezar con las piernas ya muy abiertas, forzando la cadera.', 'Ir demasiado rápido y perder el control del recorrido.'],
  diagram_pattern = 'leg_machine'
  where gym_id is null and name = 'Aducción de cadera';

update public.exercises set
  muscle_worked = 'Pecho, hombro delantero y tríceps.',
  purpose = 'El ejercicio de referencia para fuerza y volumen de pecho.',
  best_practices = array['Omóplatos juntos y hacia abajo, pecho un poco arriba.', 'La barra baja hasta rozar el pecho, en línea con la parte media.'],
  common_mistakes = array['Rebotar la barra en el pecho en vez de controlar el descenso.', 'Despegar los pies del piso, perdiendo estabilidad.'],
  diagram_pattern = 'horizontal_press'
  where gym_id is null and name = 'Press de banca con barra';

update public.exercises set
  muscle_worked = 'Pecho superior (clavicular), hombro delantero y tríceps.',
  purpose = 'Le da más trabajo a la parte alta del pecho que el press plano.',
  best_practices = array['Banco entre 30° y 45° — más inclinado pasa a ser trabajo de hombro.', 'La barra baja hacia la parte alta del pecho, no hacia el cuello.'],
  common_mistakes = array['Inclinar demasiado el banco, quitándole trabajo al pecho.', 'Arquear mucho la espalda para compensar el ángulo.'],
  diagram_pattern = 'incline_press'
  where gym_id is null and name = 'Press inclinado con barra';

update public.exercises set
  muscle_worked = 'Pecho, hombro delantero y tríceps, con más recorrido que la barra.',
  purpose = 'Mismo trabajo que el press con barra, con más rango de movimiento y cada brazo trabajando por separado.',
  best_practices = array['Bajá las mancuernas hasta sentir un buen estiramiento en el pecho.', 'Empezá y terminá con las mancuernas alineadas sobre los hombros.'],
  common_mistakes = array['Chocar las mancuernas arriba en cada repetición, perdiendo tensión.', 'Bajar tan hondo que el hombro se resiente.'],
  diagram_pattern = 'horizontal_press'
  where gym_id is null and name = 'Press de banca con mancuernas';

update public.exercises set
  muscle_worked = 'Pecho superior, hombro delantero y tríceps.',
  purpose = 'Pecho superior con el rango extra que dan las mancuernas frente a la barra.',
  best_practices = array['Mismo ángulo de banco que la versión con barra, 30°-45°.', 'Controlá la bajada — no dejes que el peso "caiga".'],
  common_mistakes = array['Dejar que los codos se abran demasiado, cargando el hombro.', 'Usar un ángulo de banco muy alto.'],
  diagram_pattern = 'incline_press'
  where gym_id is null and name = 'Press inclinado con mancuernas';

update public.exercises set
  muscle_worked = 'Pecho, con menos exigencia de estabilización que la barra o las mancuernas.',
  purpose = 'Trabajar pecho con una técnica más simple de aprender — buena entrada al press para principiantes.',
  best_practices = array['Ajustá el asiento para que las agarraderas queden a la altura del pecho.', 'Empujá hasta extender los brazos sin bloquear del todo el codo.'],
  common_mistakes = array['Dejar el asiento mal ajustado, forzando el hombro.', 'Usar impulso con el torso en vez de empujar con los brazos.'],
  diagram_pattern = 'horizontal_press'
  where gym_id is null and name = 'Press en máquina';

update public.exercises set
  muscle_worked = 'Pecho inferior y tríceps, con el hombro delantero como ayuda.',
  purpose = 'Un ejercicio de empuje muy exigente con el propio peso del cuerpo.',
  best_practices = array['Inclinate un poco hacia adelante para cargarle más trabajo al pecho.', 'Bajá hasta sentir un buen estiramiento, sin forzar el hombro.'],
  common_mistakes = array['Bajar demasiado hondo si el hombro no tiene la movilidad para eso.', 'Dejar que los hombros se suban hacia las orejas.'],
  diagram_pattern = 'horizontal_press'
  where gym_id is null and name = 'Fondos en paralelas';

update public.exercises set
  muscle_worked = 'Pecho, de forma aislada — sin ayuda del tríceps.',
  purpose = 'Estirar y contraer el pecho en un arco amplio, algo que el press no logra igual.',
  best_practices = array['Codos con una flexión leve y fija durante todo el movimiento.', 'Bajá solo hasta donde el hombro se sienta cómodo.'],
  common_mistakes = array['Doblar y estirar el codo durante el movimiento (eso lo convierte en un press).', 'Bajar demasiado, forzando el hombro hacia adelante.'],
  diagram_pattern = 'chest_fly'
  where gym_id is null and name = 'Aperturas con mancuernas';

update public.exercises set
  muscle_worked = 'Pecho, con tensión constante gracias a la polea (a diferencia de las mancuernas).',
  purpose = 'Misma idea que las aperturas, con tensión que no baja en ningún punto del recorrido.',
  best_practices = array['Inclinate un poco adelante y cruzá las manos frente a la cadera.', 'Mantené los codos con una leve flexión fija.'],
  common_mistakes = array['Usar tanto peso que el movimiento termina siendo con los hombros.', 'Pararse muy lejos de las poleas, perdiendo el ángulo de cruce.'],
  diagram_pattern = 'chest_fly'
  where gym_id is null and name = 'Cruce de poleas';

update public.exercises set
  muscle_worked = 'Pecho, hombro delantero, tríceps y core como estabilizador.',
  purpose = 'El empuje más básico con el propio peso del cuerpo — no necesita ningún equipo.',
  best_practices = array['Cuerpo en línea recta de la cabeza a los talones, sin que la cadera caiga.', 'Bajá hasta que el pecho casi toque el piso.'],
  common_mistakes = array['Dejar caer la cadera a mitad de camino.', 'Hacer solo medio recorrido en vez de bajar del todo.'],
  diagram_pattern = 'horizontal_press'
  where gym_id is null and name = 'Flexiones';

update public.exercises set
  muscle_worked = 'Hombros (los tres deltoides) y tríceps, con el core estabilizando.',
  purpose = 'El ejercicio de referencia para fuerza de hombro — empujar peso por encima de la cabeza.',
  best_practices = array['Apretá el glúteo y el abdomen para no arquear la espalda al empujar.', 'La barra sube en línea recta, pasando cerca de la cara.'],
  common_mistakes = array['Arquear mucho la espalda baja para ayudarse a empujar.', 'Empujar la barra hacia adelante en vez de hacia arriba.'],
  diagram_pattern = 'vertical_press'
  where gym_id is null and name = 'Press militar con barra';

update public.exercises set
  muscle_worked = 'Hombros y tríceps, con cada brazo trabajando de forma independiente.',
  purpose = 'Misma idea que el press militar, con más libertad de movimiento para el hombro.',
  best_practices = array['Las mancuernas empiezan a la altura de la oreja.', 'Subí hasta casi extender el codo, sin bloquearlo de golpe.'],
  common_mistakes = array['Bajar las mancuernas de más, forzando el hombro.', 'Usar impulso de las piernas en vez de fuerza del hombro.'],
  diagram_pattern = 'vertical_press'
  where gym_id is null and name = 'Press de hombros con mancuernas';

update public.exercises set
  muscle_worked = 'Hombros y tríceps, con la máquina guiando el recorrido.',
  purpose = 'Trabajar el hombro con una técnica simple, sin exigir estabilización extra.',
  best_practices = array['Espalda bien apoyada en el respaldo durante todo el ejercicio.', 'Empujá en línea recta hasta casi extender el brazo.'],
  common_mistakes = array['Despegar la espalda del respaldo al empujar.', 'Ajustar mal el asiento, forzando el hombro en un ángulo incómodo.'],
  diagram_pattern = 'vertical_press'
  where gym_id is null and name = 'Press de hombros en máquina';

update public.exercises set
  muscle_worked = 'Deltoide lateral — el que le da ancho al hombro.',
  purpose = 'El ejercicio más directo para el deltoide lateral, algo que el press casi no toca.',
  best_practices = array['Subí los brazos hasta la altura del hombro, no más arriba.', 'Codos con una leve flexión fija durante todo el recorrido.'],
  common_mistakes = array['Usar impulso del cuerpo para "ayudar" a subir el peso.', 'Subir por encima de la altura del hombro, metiendo el trapecio.'],
  diagram_pattern = 'lateral_raise'
  where gym_id is null and name = 'Elevaciones laterales';

update public.exercises set
  muscle_worked = 'Deltoide lateral, con tensión constante gracias a la polea.',
  purpose = 'Misma idea que las elevaciones con mancuerna, con tensión que no se pierde en ningún punto.',
  best_practices = array['Parate de costado a la polea, con el cable cruzando el cuerpo.', 'Subí con control, sin tirones.'],
  common_mistakes = array['Inclinar el torso lejos de la polea para ganar impulso.', 'Usar tanto peso que el hombro se sube hacia la oreja.'],
  diagram_pattern = 'lateral_raise'
  where gym_id is null and name = 'Elevaciones laterales en polea';

update public.exercises set
  muscle_worked = 'Deltoide posterior — la parte trasera del hombro, casi siempre la más débil.',
  purpose = 'Equilibrar el hombro: la mayoría entrena mucho press y poco la parte de atrás.',
  best_practices = array['Inclinate hacia adelante desde la cadera, espalda recta.', 'Subí los brazos hacia los costados, apretando entre los omóplatos.'],
  common_mistakes = array['Usar tanto peso que el movimiento termina siendo con la espalda.', 'Pararse casi derecho, perdiendo el ángulo hacia adelante.'],
  diagram_pattern = 'lateral_raise'
  where gym_id is null and name = 'Pájaros con mancuernas';

update public.exercises set
  muscle_worked = 'Deltoide posterior y músculos que rotan el hombro hacia afuera — clave para la salud del hombro.',
  purpose = 'Uno de los mejores ejercicios preventivos: equilibra tanto press que la mayoría hace de más.',
  best_practices = array['Tirá la cuerda hacia la cara, separando las manos al final.', 'Codos altos, a la altura del hombro, durante todo el recorrido.'],
  common_mistakes = array['Tirar hacia abajo en vez de hacia la cara.', 'Usar tanto peso que los codos bajan.'],
  diagram_pattern = 'lateral_raise'
  where gym_id is null and name = 'Face pull';

update public.exercises set
  muscle_worked = 'Trapecio superior — la parte que va del cuello al hombro.',
  purpose = 'Fuerza y volumen de trapecio, útil para todo lo que implique cargar peso (farmer walk, peso muerto).',
  best_practices = array['Subí los hombros derecho hacia arriba, sin rodarlos.', 'Pausá arriba un segundo antes de bajar con control.'],
  common_mistakes = array['Rotar los hombros en círculo en vez de subir y bajar recto.', 'Usar impulso del cuerpo para mover el peso.'],
  diagram_pattern = 'lateral_raise'
  where gym_id is null and name = 'Encogimientos con mancuernas';

update public.exercises set
  muscle_worked = 'Dorsal ancho, bíceps y espalda media.',
  purpose = 'El ejercicio de tracción vertical más exigente — mueve todo el peso del cuerpo.',
  best_practices = array['Empezá desde los brazos completamente extendidos.', 'Subí hasta que la barbilla pase la barra, llevando los codos hacia abajo y atrás.'],
  common_mistakes = array['Hacer solo medio recorrido, sin extender los brazos abajo.', 'Balancear el cuerpo para ganar impulso.'],
  diagram_pattern = 'pull_vertical'
  where gym_id is null and name = 'Dominadas';

update public.exercises set
  muscle_worked = 'Dorsal ancho, bíceps y espalda media, igual que la dominada libre.',
  purpose = 'El camino para llegar a la dominada libre — la máquina compensa el peso que todavía falta.',
  best_practices = array['Usá la menor asistencia posible que te permita completar el rango.', 'Misma técnica que la dominada libre: recorrido completo, sin balanceo.'],
  common_mistakes = array['Apoyarse en tanta asistencia que ya no hay progreso real.', 'Rebotar en la posición de abajo.'],
  diagram_pattern = 'pull_vertical'
  where gym_id is null and name = 'Dominadas asistidas';

update public.exercises set
  muscle_worked = 'Dorsal ancho y bíceps — la versión sentada y con menos carga corporal de la dominada.',
  purpose = 'Fuerza de espalda ancha para quien todavía no puede hacer una dominada completa.',
  best_practices = array['Llevá la barra hacia la parte alta del pecho, sacando pecho.', 'Volvé arriba con control, sin dejar que el peso tire de los brazos.'],
  common_mistakes = array['Tirar la barra hacia atrás de la nuca, forzando el hombro.', 'Usar el impulso del torso echándose hacia atrás.'],
  diagram_pattern = 'pull_vertical'
  where gym_id is null and name = 'Jalón al pecho';

update public.exercises set
  muscle_worked = 'Espalda media, dorsal y bíceps.',
  purpose = 'El ejercicio de tracción horizontal de referencia para dar espesor a la espalda.',
  best_practices = array['Torso inclinado hacia adelante, espalda recta, no redondeada.', 'Llevá la barra hacia el abdomen, apretando los omóplatos.'],
  common_mistakes = array['Redondear la espalda baja para levantar más peso.', 'Usar impulso del cuerpo (remo de cadera) en vez de tirar con la espalda.'],
  diagram_pattern = 'pull_horizontal'
  where gym_id is null and name = 'Remo con barra';

update public.exercises set
  muscle_worked = 'Espalda media, dorsal y bíceps, un lado a la vez.',
  purpose = 'Misma idea que el remo con barra, trabajando cada lado por separado — bueno para corregir asimetrías.',
  best_practices = array['Apoyá la mano y la rodilla del mismo lado en el banco para fijar la espalda.', 'Llevá el codo hacia atrás y arriba, cerca del cuerpo.'],
  common_mistakes = array['Rotar el torso para ayudarse a levantar el peso.', 'Tirar con el brazo estirado en vez de llevar el codo atrás.'],
  diagram_pattern = 'pull_horizontal'
  where gym_id is null and name = 'Remo con mancuerna';

update public.exercises set
  muscle_worked = 'Espalda media, dorsal y bíceps, con tensión constante de la polea.',
  purpose = 'Trabajar toda la espalda media sentado, sin exigirle nada a la zona lumbar.',
  best_practices = array['Espalda derecha durante todo el recorrido, sin balancearte hacia atrás.', 'Llevá el agarre al abdomen, apretando los omóplatos al final.'],
  common_mistakes = array['Balancear el torso adelante y atrás para ganar impulso.', 'Encorvar los hombros hacia adelante al soltar el peso.'],
  diagram_pattern = 'pull_horizontal'
  where gym_id is null and name = 'Remo sentado en polea';

update public.exercises set
  muscle_worked = 'Espalda media y dorsal, con el pecho apoyado para quitarle trabajo a la zona lumbar.',
  purpose = 'La forma más segura de entrenar remo — el apoyo en el pecho elimina cualquier compensación con la espalda baja.',
  best_practices = array['Pecho bien apoyado durante todo el movimiento.', 'Llevá los codos atrás, apretando entre los omóplatos.'],
  common_mistakes = array['Despegar el pecho del apoyo para sumar impulso.', 'Usar un rango tan corto que casi no hay contracción.'],
  diagram_pattern = 'pull_horizontal'
  where gym_id is null and name = 'Remo en máquina';

update public.exercises set
  muscle_worked = 'Dorsal ancho y, en menor medida, pecho.',
  purpose = 'Un movimiento de brazo estirado que estira bien el dorsal, distinto a cualquier otro ejercicio de espalda.',
  best_practices = array['Codos con flexión leve y fija durante todo el recorrido.', 'Llevá los brazos desde arriba de la cabeza hasta los muslos, sin doblar los codos.'],
  common_mistakes = array['Doblar los codos a mitad de camino (se vuelve un ejercicio de tríceps).', 'Usar el torso para ayudarse a bajar el peso.'],
  diagram_pattern = 'pull_horizontal'
  where gym_id is null and name = 'Pullover en polea';

update public.exercises set
  muscle_worked = 'Bíceps braquial.',
  purpose = 'El ejercicio de referencia para fuerza y volumen de bíceps.',
  best_practices = array['Codos pegados al cuerpo, fijos, durante todo el recorrido.', 'Subí sin balancear el torso hacia atrás.'],
  common_mistakes = array['Balancear el cuerpo para levantar más peso del que el bíceps puede solo.', 'Mover los codos hacia adelante al subir.'],
  diagram_pattern = 'curl_arm'
  where gym_id is null and name = 'Curl de bíceps con barra';

update public.exercises set
  muscle_worked = 'Bíceps braquial, un brazo a la vez.',
  purpose = 'Trabajar cada brazo por separado, útil para corregir cuál está más débil.',
  best_practices = array['Girá la muñeca hacia afuera (supinación) a medida que subís.', 'Bajá del todo antes de empezar la otra repetición.'],
  common_mistakes = array['Balancear el hombro del brazo que está trabajando.', 'No completar el giro de muñeca.'],
  diagram_pattern = 'curl_arm'
  where gym_id is null and name = 'Curl alterno con mancuernas';

update public.exercises set
  muscle_worked = 'Braquial y antebrazo, además del bíceps — el agarre neutro cambia el énfasis.',
  purpose = 'Suma grosor al brazo en una zona que el curl tradicional no toca tanto.',
  best_practices = array['Mantené la muñeca neutra (como sosteniendo un martillo) todo el recorrido.', 'Codos fijos, pegados al cuerpo.'],
  common_mistakes = array['Rotar la muñeca durante el movimiento (eso ya es otro ejercicio).', 'Usar impulso del hombro para subir el peso.'],
  diagram_pattern = 'curl_arm'
  where gym_id is null and name = 'Curl martillo';

update public.exercises set
  muscle_worked = 'Bíceps braquial, con el brazo fijo en el banco — imposible hacer trampa con el cuerpo.',
  purpose = 'Aislar el bíceps del todo, sin que el hombro o la espalda puedan ayudar.',
  best_practices = array['Apoyá el brazo entero en el banco, desde la axila hasta el codo.', 'Subí sin despegar el brazo del apoyo.'],
  common_mistakes = array['Despegar el codo del banco para levantar más peso.', 'No extender el brazo del todo abajo.'],
  diagram_pattern = 'curl_arm'
  where gym_id is null and name = 'Curl predicador';

update public.exercises set
  muscle_worked = 'Bíceps braquial, con tensión constante de la polea.',
  purpose = 'Misma idea que el curl con barra, sin que el peso se sienta más liviano arriba.',
  best_practices = array['Codos fijos, pegados al cuerpo, mirando hacia la polea.', 'Controlá la vuelta — no dejes que el peso tire del brazo.'],
  common_mistakes = array['Alejarse mucho de la polea, cambiando el ángulo del ejercicio.', 'Balancear el torso para ayudarse a subir el peso.'],
  diagram_pattern = 'curl_arm'
  where gym_id is null and name = 'Curl en polea';

update public.exercises set
  muscle_worked = 'Tríceps, con el pecho y el hombro delantero como ayuda.',
  purpose = 'Un press de banca con las manos juntas — le carga la mayoría del trabajo al tríceps.',
  best_practices = array['Manos a la altura de los hombros, no más juntas.', 'Codos pegados al cuerpo durante todo el recorrido.'],
  common_mistakes = array['Poner las manos demasiado juntas, forzando la muñeca.', 'Dejar que los codos se abran como en un press normal.'],
  diagram_pattern = 'horizontal_press'
  where gym_id is null and name = 'Press cerrado';

update public.exercises set
  muscle_worked = 'Tríceps, cabeza larga — la que más volumen le da al brazo.',
  purpose = 'Estira y trabaja el tríceps en un ángulo que el press cerrado no logra.',
  best_practices = array['Codos apuntando al techo, fijos, durante todo el recorrido.', 'Bajá la barra hacia la frente con control.'],
  common_mistakes = array['Dejar que los codos se abran hacia los costados.', 'Usar tanto peso que hay que ayudarse con el hombro.'],
  diagram_pattern = 'triceps'
  where gym_id is null and name = 'Press francés';

update public.exercises set
  muscle_worked = 'Tríceps, con tensión constante de la polea.',
  purpose = 'Aislar el tríceps con una técnica simple — buen cierre para el día de empuje.',
  best_practices = array['Codos pegados al cuerpo, fijos, sin moverse del lugar.', 'Extendé del todo abajo, apretando el tríceps.'],
  common_mistakes = array['Despegar los codos del cuerpo, metiendo el hombro.', 'No extender el brazo del todo al final.'],
  diagram_pattern = 'triceps'
  where gym_id is null and name = 'Extensión de tríceps en polea';

update public.exercises set
  muscle_worked = 'Tríceps, cabeza larga, con un buen estiramiento por encima de la cabeza.',
  purpose = 'Otro ángulo para la cabeza larga del tríceps, la parte que más le cuesta crecer a la mayoría.',
  best_practices = array['Codos apuntando al techo, cerca de la cabeza, sin abrirse.', 'Bajá la mancuerna detrás de la cabeza con control.'],
  common_mistakes = array['Dejar que los codos se abran hacia los costados.', 'Arquear la espalda para compensar el peso.'],
  diagram_pattern = 'triceps'
  where gym_id is null and name = 'Extensión de tríceps sobre cabeza';

update public.exercises set
  muscle_worked = 'Tríceps, de forma muy aislada, al final del recorrido.',
  purpose = 'Un ejercicio de acabado — poco peso, mucho enfoque en apretar el tríceps al extender.',
  best_practices = array['Codo fijo, pegado al cuerpo, a la altura de las costillas.', 'Extendé el antebrazo hacia atrás sin mover el codo.'],
  common_mistakes = array['Mover el codo en vez de solo el antebrazo.', 'Usar impulso del cuerpo para levantar el peso.'],
  diagram_pattern = 'triceps'
  where gym_id is null and name = 'Patada de tríceps';

update public.exercises set
  muscle_worked = 'Recto abdominal, oblicuos y core profundo, trabajando de forma isométrica.',
  purpose = 'El ejercicio base de estabilidad del core — enseña a mantener el tronco firme bajo tensión.',
  best_practices = array['Cuerpo en línea recta de la cabeza a los talones.', 'Apretá el abdomen y el glúteo durante todo el tiempo que dure.'],
  common_mistakes = array['Dejar caer la cadera hacia el piso.', 'Levantar demasiado la cadera, perdiendo la línea recta.'],
  diagram_pattern = 'plank'
  where gym_id is null and name = 'Plancha';

update public.exercises set
  muscle_worked = 'Oblicuos, principalmente del lado de apoyo.',
  purpose = 'Complementa la plancha frontal trabajando el costado del core, clave para la estabilidad al girar.',
  best_practices = array['Cadera levantada, cuerpo en línea recta de la cabeza a los pies.', 'Apoyo en el antebrazo, con el codo justo debajo del hombro.'],
  common_mistakes = array['Dejar caer la cadera hacia el piso.', 'Rotar el torso hacia adelante en vez de mantenerlo de costado.'],
  diagram_pattern = 'plank'
  where gym_id is null and name = 'Plancha lateral';

update public.exercises set
  muscle_worked = 'Recto abdominal — el "six pack".',
  purpose = 'El movimiento más directo para el abdomen: flexionar el tronco contra resistencia.',
  best_practices = array['El movimiento sale del abdomen, no del cuello.', 'Subí solo los omóplatos del piso, sin sentarte del todo.'],
  common_mistakes = array['Tirar del cuello con las manos.', 'Usar impulso en vez de apretar el abdomen.'],
  diagram_pattern = 'crunch'
  where gym_id is null and name = 'Crunch';

update public.exercises set
  muscle_worked = 'Recto abdominal, con resistencia extra de la polea.',
  purpose = 'Sumarle carga al crunch una vez que el peso del cuerpo ya no alcanza para seguir progresando.',
  best_practices = array['El movimiento sale de la cadera hacia el pecho, no de los brazos.', 'Mantené las caderas fijas — solo se dobla el torso.'],
  common_mistakes = array['Tirar con los brazos en vez de flexionar con el abdomen.', 'Mover la cadera hacia atrás en vez de solo doblar el torso.'],
  diagram_pattern = 'crunch'
  where gym_id is null and name = 'Crunch en polea';

update public.exercises set
  muscle_worked = 'Recto abdominal inferior y flexores de cadera.',
  purpose = 'Trabajar la parte baja del abdomen, la que menos toca el crunch tradicional.',
  best_practices = array['Subí las rodillas hacia el pecho con control, sin balancear el cuerpo.', 'Bajá las piernas sin dejar que el cuerpo se balancee.'],
  common_mistakes = array['Usar el impulso del balanceo en vez de la fuerza del abdomen.', 'Arquear la espalda baja al bajar las piernas.'],
  diagram_pattern = 'crunch'
  where gym_id is null and name = 'Elevación de rodillas';

update public.exercises set
  muscle_worked = 'Recto abdominal inferior y flexores de cadera — más exigente que con las rodillas dobladas.',
  purpose = 'Versión más difícil de la elevación de rodillas, con las piernas extendidas.',
  best_practices = array['Piernas lo más rectas posible, subiendo con control.', 'Bajá solo hasta donde puedas mantener la zona lumbar pegada al cuerpo.'],
  common_mistakes = array['Balancear el cuerpo para ganar impulso.', 'Dejar que la espalda baja se arquee al bajar las piernas.'],
  diagram_pattern = 'crunch'
  where gym_id is null and name = 'Elevación de piernas';

update public.exercises set
  muscle_worked = 'Core profundo, con foco en mantener la zona lumbar estable mientras brazos y piernas se mueven.',
  purpose = 'Enseña a estabilizar el tronco mientras el resto del cuerpo se mueve — clave para levantar peso sin lastimarse.',
  best_practices = array['La zona lumbar se queda pegada al piso durante todo el ejercicio.', 'Movés brazo y pierna opuestos a la vez, despacio.'],
  common_mistakes = array['Dejar que la espalda baja se despegue del piso.', 'Ir tan rápido que se pierde el control del movimiento.'],
  diagram_pattern = 'plank'
  where gym_id is null and name = 'Dead bug';

update public.exercises set
  muscle_worked = 'Core profundo y espalda baja, trabajando el equilibrio en cuatro apoyos.',
  purpose = 'Misma idea que el dead bug, en cuatro apoyos — muy usado para prevenir dolor lumbar.',
  best_practices = array['Extendé brazo y pierna opuestos sin rotar la cadera.', 'La espalda se mantiene plana, sin arquearse ni hundirse.'],
  common_mistakes = array['Rotar la cadera hacia el costado que se extiende.', 'Levantar el brazo o la pierna más alto de lo que el equilibrio permite.'],
  diagram_pattern = 'plank'
  where gym_id is null and name = 'Bird dog';

update public.exercises set
  muscle_worked = 'Core, con las piernas y los hombros trabajando de forma dinámica.',
  purpose = 'Sumar ritmo cardíaco a un ejercicio de core — combina fuerza y cardio en uno.',
  best_practices = array['Cadera baja y estable, como en una plancha, durante todo el ejercicio.', 'Llevá la rodilla hacia el pecho sin que la cadera suba y baje.'],
  common_mistakes = array['Levantar demasiado la cadera, perdiendo la posición de plancha.', 'Ir tan rápido que se pierde el control de cada paso.'],
  diagram_pattern = 'cardio_dynamic'
  where gym_id is null and name = 'Mountain climbers';

update public.exercises set
  muscle_worked = 'Todo el cuerpo — piernas, pecho, hombros y core en una sola secuencia.',
  purpose = 'El ejercicio de acondicionamiento más completo con el propio peso del cuerpo.',
  best_practices = array['Mantené la técnica de la flexión y el salto aunque estés cansado.', 'Aterrizá suave, doblando las rodillas.'],
  common_mistakes = array['Dejar caer la cadera en la posición de plancha por el cansancio.', 'Aterrizar con las piernas rígidas.'],
  diagram_pattern = 'cardio_dynamic'
  where gym_id is null and name = 'Burpees';

update public.exercises set
  muscle_worked = 'Todo el cuerpo, de forma liviana — ideal para elevar el pulso antes de entrenar.',
  purpose = 'Calentamiento clásico para subir la temperatura corporal y activar el sistema cardiovascular.',
  best_practices = array['Aterrizá suave, con las rodillas ligeramente flexionadas.', 'Mantené un ritmo constante durante toda la serie.'],
  common_mistakes = array['Aterrizar con las piernas rígidas.', 'Encoger los hombros en vez de abrir bien los brazos.'],
  diagram_pattern = 'cardio_dynamic'
  where gym_id is null and name = 'Jumping jacks';

update public.exercises set
  muscle_worked = 'Pantorrillas y todo el sistema cardiovascular.',
  purpose = 'Cardio de bajo impacto por salto y muy eficiente para acondicionamiento y coordinación.',
  best_practices = array['Saltos cortos, apenas despegando del piso.', 'Mové la cuerda con la muñeca, no con todo el brazo.'],
  common_mistakes = array['Saltar demasiado alto, gastando energía de más.', 'Mover el brazo entero en vez de la muñeca.'],
  diagram_pattern = 'cardio_dynamic'
  where gym_id is null and name = 'Cuerda de saltar';

update public.exercises set
  muscle_worked = 'Piernas y sistema cardiovascular al máximo esfuerzo.',
  purpose = 'Trabajo de alta intensidad para mejorar velocidad y capacidad cardiovascular.',
  best_practices = array['Subí la velocidad de forma progresiva, no de golpe.', 'Corré en el centro de la cinta, con pasos cortos y rápidos.'],
  common_mistakes = array['Agarrarse de las barandas al correr rápido.', 'Empezar a máxima velocidad sin entrar en calor antes.'],
  diagram_pattern = 'cardio_machine'
  where gym_id is null and name = 'Sprint en cinta';

update public.exercises set
  muscle_worked = 'Glúteos, isquiotibiales y sistema cardiovascular, con bajo impacto en las articulaciones.',
  purpose = 'Cardio constante y de bajo impacto — muy usado para quemar calorías sin desgastar las rodillas.',
  best_practices = array['Caminá erguido, sin apoyarte en las barandas.', 'Elegí una inclinación y velocidad que puedas sostener sin perder la postura.'],
  common_mistakes = array['Sostenerse de las barandas, restándole trabajo a las piernas.', 'Inclinar demasiado el cuerpo hacia adelante.'],
  diagram_pattern = 'cardio_machine'
  where gym_id is null and name = 'Caminata inclinada';

update public.exercises set
  muscle_worked = 'Cuádriceps, isquiotibiales y sistema cardiovascular, sin impacto en las articulaciones.',
  purpose = 'Cardio de bajo impacto, ideal para quien está recuperándose de una lesión de rodilla o tobillo.',
  best_practices = array['Ajustá el asiento para que la rodilla quede casi extendida en el punto más bajo del pedaleo.', 'Mantené un ritmo de pedaleo constante.'],
  common_mistakes = array['Dejar el asiento muy bajo, forzando la rodilla.', 'Apoyar todo el peso en el manubrio en vez de en el asiento.'],
  diagram_pattern = 'cardio_machine'
  where gym_id is null and name = 'Bicicleta estática';

update public.exercises set
  muscle_worked = 'Espalda, piernas y core — de los pocos cardios que trabajan casi todo el cuerpo a la vez.',
  purpose = 'Cardio de cuerpo completo, de bajo impacto, muy eficiente para quemar calorías.',
  best_practices = array['El impulso arranca con las piernas, después el torso, después los brazos.', 'Volvé en el mismo orden invertido: brazos, torso, piernas.'],
  common_mistakes = array['Tirar solo con los brazos, sin usar las piernas.', 'Redondear la espalda baja durante el remo.'],
  diagram_pattern = 'cardio_machine'
  where gym_id is null and name = 'Remo ergómetro';

update public.exercises set
  muscle_worked = 'Hombros, brazos y core, con el corazón trabajando a alta intensidad.',
  purpose = 'Acondicionamiento de cuerpo completo con muy bajo impacto en las articulaciones de la pierna.',
  best_practices = array['Rodillas ligeramente flexionadas, core firme durante toda la serie.', 'El movimiento sale del hombro, con ondas parejas en las dos sogas.'],
  common_mistakes = array['Pararse demasiado erguido, perdiendo estabilidad.', 'Mover solo los antebrazos en vez de todo el brazo.'],
  diagram_pattern = 'cardio_dynamic'
  where gym_id is null and name = 'Battle ropes';

update public.exercises set
  muscle_worked = 'Glúteos e isquiotibiales, con el core estabilizando — no es un ejercicio de brazos.',
  purpose = 'Potencia de cadera: enseña a generar fuerza explosiva desde el glúteo, útil para saltar y correr.',
  best_practices = array['La fuerza sale de la cadera hacia atrás y adelante, no de los brazos.', 'El kettlebell sube por la inercia de la cadera, los brazos solo lo acompañan.'],
  common_mistakes = array['Hacer sentadilla en vez de bisagra de cadera.', 'Levantar el peso con los brazos y el hombro.'],
  diagram_pattern = 'hinge'
  where gym_id is null and name = 'Kettlebell swing';

update public.exercises set
  muscle_worked = 'Antebrazos, trapecio y todo el core, que trabaja para mantener el cuerpo derecho.',
  purpose = 'Fuerza de agarre y estabilidad de todo el cuerpo — se traduce directo a la vida diaria.',
  best_practices = array['Hombros hacia atrás y abajo, torso derecho durante toda la caminata.', 'Pasos cortos y controlados, sin balancear el peso.'],
  common_mistakes = array['Encorvar los hombros hacia adelante por el peso.', 'Caminar demasiado rápido y perder el control del peso.'],
  diagram_pattern = 'carry'
  where gym_id is null and name = 'Farmer walk';

update public.exercises set
  muscle_worked = 'Todo el cuerpo — hombro, core y piernas trabajando juntos en una secuencia larga.',
  purpose = 'El ejercicio más completo de control corporal: pasar de acostado a parado sosteniendo peso arriba.',
  best_practices = array['El brazo con el peso se mantiene extendido y vertical durante toda la secuencia.', 'Movete despacio, un paso de la secuencia a la vez.'],
  common_mistakes = array['Apurar la secuencia y saltarse pasos.', 'Dejar que el brazo del peso se incline de la vertical.'],
  diagram_pattern = 'explosive'
  where gym_id is null and name = 'Turkish get-up';

update public.exercises set
  muscle_worked = 'Glúteos, espalda y hombros, en un movimiento explosivo de cadera.',
  purpose = 'Llevar el kettlebell del piso al hombro con potencia, usando la cadera como motor.',
  best_practices = array['La potencia sale de la cadera, no de tirar con el brazo.', 'Dejá que el kettlebell "gire" alrededor de la muñeca en vez de forzarlo con el brazo.'],
  common_mistakes = array['Tirar del peso con el brazo en vez de con la cadera.', 'Golpearse el antebrazo por no dejar que la muñeca gire.'],
  diagram_pattern = 'explosive'
  where gym_id is null and name = 'Clean con kettlebell';

update public.exercises set
  muscle_worked = 'Cuádriceps y glúteos, en un movimiento explosivo de salto.',
  purpose = 'Desarrollar potencia de pierna — la capacidad de generar fuerza rápido, no solo fuerza máxima.',
  best_practices = array['Aterrizá suave, con las rodillas flexionadas, en el centro del cajón.', 'Elegí una altura de cajón que puedas saltar con buena técnica.'],
  common_mistakes = array['Elegir un cajón demasiado alto y aterrizar mal.', 'Bajar saltando en vez de bajar caminando (mayor riesgo de lesión).'],
  diagram_pattern = 'squat'
  where gym_id is null and name = 'Box jump';

update public.exercises set
  muscle_worked = 'Todo el cuerpo, con foco en el core y los hombros liberando potencia de golpe.',
  purpose = 'Trabajar la potencia explosiva del tren superior, algo que el press tradicional no entrena igual.',
  best_practices = array['La fuerza arranca desde las piernas y sube hasta los brazos.', 'Soltá el balón con todo el cuerpo, no solo con los brazos.'],
  common_mistakes = array['Lanzar solo con los brazos, sin usar las piernas ni el core.', 'Pararse demasiado cerca de la pared o del compañero.'],
  diagram_pattern = 'explosive'
  where gym_id is null and name = 'Lanzamiento de balón medicinal';

update public.exercises set
  muscle_worked = 'Hombros, core y piernas, con todo el cuerpo generando la potencia del golpe.',
  purpose = 'Técnica de boxeo y acondicionamiento — el golpe sale de la cadera y las piernas, no solo del brazo.',
  best_practices = array['Girá la cadera y el pie de atrás con cada golpe.', 'Volvé siempre la mano a la posición de guardia.'],
  common_mistakes = array['Golpear solo con el brazo, sin rotar la cadera.', 'Bajar la guardia después de cada golpe.'],
  diagram_pattern = 'boxing'
  where gym_id is null and name = 'Golpes al saco';

update public.exercises set
  muscle_worked = 'Todo el cuerpo, con foco en piernas y hombros, sin el impacto de golpear algo.',
  purpose = 'Practicar técnica y ritmo sin saco ni compañero — calienta y afina la forma antes de golpear en serio.',
  best_practices = array['Movete en tus pies todo el tiempo, sin quedarte parado.', 'Mantené la guardia arriba entre combinación y combinación.'],
  common_mistakes = array['Quedarse quieto en vez de moverse como en una pelea real.', 'Bajar los brazos por cansancio.'],
  diagram_pattern = 'boxing'
  where gym_id is null and name = 'Sombra de boxeo';

update public.exercises set
  muscle_worked = 'Hombros y core, con la cadera y las piernas aportando la potencia de cada golpe.',
  purpose = 'La combinación básica de boxeo — el jab mide distancia, el cross pone la potencia.',
  best_practices = array['El jab sale rápido y vuelve rápido a la guardia.', 'El cross gira la cadera y el talón trasero.'],
  common_mistakes = array['Dejar la mano del jab afuera después de golpear.', 'No rotar la cadera en el cross, perdiendo potencia.'],
  diagram_pattern = 'boxing'
  where gym_id is null and name = 'Combinación jab-cross';

update public.exercises set
  muscle_worked = 'Core y hombros, con rotación de cadera generando la potencia del golpe.',
  purpose = 'Golpe circular que suma otro ángulo de ataque a la combinación de boxeo.',
  best_practices = array['El codo se mantiene a la altura del hombro durante el golpe.', 'La potencia sale de rotar la cadera, no solo el brazo.'],
  common_mistakes = array['Golpear con el brazo estirado en vez de con el codo flexionado.', 'No rotar la cadera, perdiendo potencia en el golpe.'],
  diagram_pattern = 'boxing'
  where gym_id is null and name = 'Hook al saco';

update public.exercises set
  muscle_worked = 'Piernas, core y hombros, con el golpe saliendo desde abajo.',
  purpose = 'Golpe vertical de corta distancia, muy usado en el cuerpo a cuerpo.',
  best_practices = array['Flexioná un poco la rodilla antes de subir el golpe.', 'El golpe sube derecho, cerca del cuerpo.'],
  common_mistakes = array['Bajar demasiado la guardia para tomar impulso.', 'Golpear en arco amplio en vez de subir cerca del cuerpo.'],
  diagram_pattern = 'boxing'
  where gym_id is null and name = 'Uppercut al saco';

update public.exercises set
  muscle_worked = 'Todo el cuerpo — combina la exigencia del burpee con la técnica del golpe.',
  purpose = 'Acondicionamiento de alta intensidad que mezcla fuerza, cardio y técnica de boxeo.',
  best_practices = array['Completá bien el burpee antes de tirar el golpe.', 'Golpeá con técnica aunque llegues cansado.'],
  common_mistakes = array['Apurar el burpee para llegar antes al golpe.', 'Perder la guardia por el cansancio.'],
  diagram_pattern = 'cardio_dynamic'
  where gym_id is null and name = 'Burpee + golpe';

update public.exercises set
  muscle_worked = 'Articulación del tobillo — mejora el rango para sentadillas y zancadas más profundas.',
  purpose = 'Ganar rango de movimiento en un tobillo rígido, causa frecuente de mala técnica en sentadilla.',
  best_practices = array['Llevá la rodilla hacia adelante sobre el pie sin despegar el talón.', 'Hacelo despacio, sintiendo el estiramiento en la parte de atrás del tobillo.'],
  common_mistakes = array['Despegar el talón del piso para ganar más rango.', 'Hacerlo con rebotes en vez de con control.'],
  diagram_pattern = 'mobility'
  where gym_id is null and name = 'Movilidad de tobillo';

update public.exercises set
  muscle_worked = 'Columna torácica (espalda alta) — mejora la rotación para press, golpes y deportes de raqueta.',
  purpose = 'Soltar una zona de la espalda que se pone rígida por estar mucho tiempo sentado.',
  best_practices = array['La cadera se queda quieta — el giro sale solo de la espalda alta.', 'Acompañá el giro con la mirada, sin forzar el cuello.'],
  common_mistakes = array['Girar la cadera junto con el torso, perdiendo el estiramiento.', 'Forzar el rango en vez de ir ganándolo de a poco.'],
  diagram_pattern = 'mobility'
  where gym_id is null and name = 'Rotación torácica';

update public.exercises set
  muscle_worked = 'Flexores de cadera — se acortan por estar mucho tiempo sentado y limitan la zancada.',
  purpose = 'Devolverle rango a la cadera para sentadillas, zancadas y peso muerto más cómodos.',
  best_practices = array['Apretá el glúteo del lado de atrás para profundizar el estiramiento.', 'Mantené el torso derecho, sin inclinarte hacia adelante.'],
  common_mistakes = array['Arquear la espalda baja en vez de usar el glúteo para profundizar.', 'Forzar el estiramiento hasta sentir dolor en vez de tensión suave.'],
  diagram_pattern = 'mobility'
  where gym_id is null and name = 'Estiramiento flexor de cadera';

update public.exercises set
  muscle_worked = 'Isquiotibiales — más rango acá ayuda directo al peso muerto y a la sentadilla profunda.',
  purpose = 'Soltar la parte de atrás del muslo, frecuentemente tensa en quien entrena piernas seguido.',
  best_practices = array['Espalda recta, inclinándote desde la cadera, no desde la espalda.', 'Sostené la posición sin rebotar, dejando que el músculo se suelte solo.'],
  common_mistakes = array['Redondear la espalda para "llegar más lejos".', 'Rebotar en vez de mantener el estiramiento quieto.'],
  diagram_pattern = 'mobility'
  where gym_id is null and name = 'Estiramiento de isquiotibiales';

update public.exercises set
  muscle_worked = 'Pecho y hombro delantero — se acortan con tanto press y poco trabajo de espalda.',
  purpose = 'Devolverle movilidad al hombro para que no se cierre hacia adelante con el tiempo.',
  best_practices = array['Brazo apoyado en la pared a la altura del hombro, codo con leve flexión.', 'Girá el cuerpo despacio hasta sentir el estiramiento, sin forzar.'],
  common_mistakes = array['Poner el brazo demasiado alto o bajo, perdiendo el ángulo correcto.', 'Forzar el giro hasta sentir dolor en el hombro.'],
  diagram_pattern = 'mobility'
  where gym_id is null and name = 'Estiramiento de pectoral';

update public.exercises set
  muscle_worked = 'Dorsal ancho — se pone tenso después de mucho trabajo de tracción (dominadas, remo).',
  purpose = 'Soltar la espalda ancha para recuperar rango de hombro por encima de la cabeza.',
  best_practices = array['Sentate en los talones y dejá caer el pecho hacia el piso con los brazos extendidos.', 'Respirá hondo y dejá que el peso del cuerpo haga el estiramiento.'],
  common_mistakes = array['Forzar con los brazos en vez de dejar caer el peso del cuerpo.', 'Levantar la cadera de los talones.'],
  diagram_pattern = 'mobility'
  where gym_id is null and name = 'Estiramiento de dorsal';
