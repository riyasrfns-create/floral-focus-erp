CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  has_any boolean;
  requested text;
  final_role public.app_role;
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''));

  SELECT EXISTS(SELECT 1 FROM public.user_roles) INTO has_any;
  requested := lower(COALESCE(NEW.raw_user_meta_data->>'role',''));

  IF NOT has_any THEN
    final_role := 'owner'::public.app_role;
  ELSIF requested IN ('manager','cashier','staff') THEN
    final_role := requested::public.app_role;
  ELSE
    final_role := 'staff'::public.app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, final_role);
  RETURN NEW;
END; $function$;