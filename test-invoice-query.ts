import { supabase } from "./src/integrations/supabase/client";

async function testQuery() {
  const cardName = 'Porto Bank';
  console.log(`Querying for: "${cardName}"`);

  const { data, error } = await supabase
    .from("transactions")
    .select("card, name")
    .eq("card", cardName)
    .limit(5);

  if (error) console.error("Error:", error);
  console.log("Results with .eq():", data);

  const { data: dataIlike } = await supabase
    .from("transactions")
    .select("card, name")
    .ilike("card", cardName)
    .limit(5);
    
  console.log("Results with .ilike():", dataIlike);
}

testQuery();
