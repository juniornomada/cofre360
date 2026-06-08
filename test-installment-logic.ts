import { supabase } from "./src/integrations/supabase/client";
import { calculateInstallmentDetails } from "./src/lib/installment-utils";

async function runTest() {
  const amount = 100;
  const count = 3;
  const mode = "fixed";
  const fixedValue = 40;

  console.log("Testing Installment Logic:");
  const details = calculateInstallmentDetails(amount, count, mode, fixedValue);
  console.log("Details:", JSON.stringify(details, null, 2));

  if (details.valorParcela === 40 && details.totalCalculado === 120) {
    console.log("SUCCESS: Logic is correct.");
  } else {
    console.log("FAILURE: Logic mismatch.");
  }
}

runTest();
