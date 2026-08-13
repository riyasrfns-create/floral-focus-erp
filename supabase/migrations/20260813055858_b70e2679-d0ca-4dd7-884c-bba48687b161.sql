
CREATE OR REPLACE FUNCTION public.is_staff_member()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
  ) AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND p.active
  );
$$;

-- user_roles: only own roles or owner
DROP POLICY IF EXISTS "roles readable" ON public.user_roles;
CREATE POLICY "own roles or owner reads roles" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_owner());

-- profiles: own profile or owner
DROP POLICY IF EXISTS "profiles readable by staff" ON public.profiles;
CREATE POLICY "own profile or owner reads profiles" ON public.profiles
FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_owner());

-- business settings / categories readable by active staff only
DROP POLICY IF EXISTS "settings readable" ON public.business_settings;
CREATE POLICY "staff read settings" ON public.business_settings
FOR SELECT TO authenticated
USING (public.is_staff_member());

DROP POLICY IF EXISTS "categories readable" ON public.categories;
CREATE POLICY "staff read categories" ON public.categories
FOR SELECT TO authenticated
USING (public.is_staff_member());

-- customers
DROP POLICY IF EXISTS "staff manage customers" ON public.customers;
CREATE POLICY "staff manage customers" ON public.customers
FOR ALL TO authenticated
USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage inventory" ON public.inventory_items;
CREATE POLICY "staff manage inventory" ON public.inventory_items
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage stock movements" ON public.stock_movements;
CREATE POLICY "staff manage stock movements" ON public.stock_movements
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage flowers" ON public.flower_batches;
CREATE POLICY "staff manage flowers" ON public.flower_batches
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage wastage" ON public.wastage_log;
CREATE POLICY "staff manage wastage" ON public.wastage_log
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage orders" ON public.orders;
CREATE POLICY "staff manage orders" ON public.orders
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage order items" ON public.order_items;
CREATE POLICY "staff manage order items" ON public.order_items
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage deliveries" ON public.deliveries;
CREATE POLICY "staff manage deliveries" ON public.deliveries
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage invoices" ON public.invoices;
CREATE POLICY "staff manage invoices" ON public.invoices
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage invoice items" ON public.invoice_items;
CREATE POLICY "staff manage invoice items" ON public.invoice_items
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage payments" ON public.payments;
CREATE POLICY "staff manage payments" ON public.payments
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());

DROP POLICY IF EXISTS "staff manage sales entries" ON public.sales_entries;
CREATE POLICY "staff manage sales entries" ON public.sales_entries
FOR ALL TO authenticated USING (public.is_staff_member()) WITH CHECK (public.is_staff_member());
