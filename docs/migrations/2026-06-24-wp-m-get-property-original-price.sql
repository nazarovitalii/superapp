-- WP-M (Task 5 companion): get_property отдаёт original_price (numeric).
-- ПРИЧИНА: форма редактирования показывает OP read-only, если он уже задан (originalPriceLocked),
--   и подставляет текущее значение. get_property возвращал только производный is_below_op, но не
--   само original_price → фронт не мог ни показать значение, ни корректно заблокировать поле.
--   (Серверный edit_property всё равно защищает OP через COALESCE — это про корректность UI.)
-- ЧТО: добавить ключ 'original_price' в json_build_object перед 'previous_price'.
-- Патч staleness-proof: pg_get_functiondef + plain replace по живому определению (НЕ переписываем
--   тело), с guard «якорь не найден». Якорь — ключ 'previous_price', (одно вхождение). Аддитивно.
-- ОБРАТИМО: повторно применить предыдущее определение get_property из applied/. Применять под supabase_admin.
DO $$
DECLARE def text; new_def text;
BEGIN
  def := pg_get_functiondef('public.get_property(uuid,uuid)'::regprocedure);
  new_def := replace(
    def,
    '''previous_price'',',
    '''original_price'', p.original_price, ''previous_price'','
  );
  IF new_def = def THEN
    RAISE NOTICE 'якорь "previous_price" не найден — формат get_property изменился, патч НЕ применён';
  ELSE
    EXECUTE new_def;
  END IF;
END $$;
