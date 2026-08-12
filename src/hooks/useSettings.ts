import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BusinessSettings = {
  id: string;
  business_name: string;
  logo_url: string | null;
  address: string;
  phone: string;
  email: string;
  currency: string;
  default_tax_rate: number;
  invoice_prefix: string;
  invoice_next_number: number;
};

export function useSettings() {
  const query = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_settings")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as BusinessSettings | null;
    },
  });

  return { settings: query.data ?? null, currency: query.data?.currency ?? "LKR", ...query };
}
