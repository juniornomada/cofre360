import { supabase } from "./src/integrations/supabase/client";

async function testAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  console.log("Current session:", session ? `Logged in as ${session.user.email}` : "Not logged in");
  
  if (!session) {
      console.log("Warning: Queries without a session might fail RLS checks and return 0 results.");
  }

  const { data, count } = await supabase
    .from("transactions")
    .select("card", { count: 'exact' });

  console.log("Total visible transactions (RLS):", count);
}

testAuth();
