import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assert, assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.test("Validation: transfer should fail if target email already exists", async () => {
  const emailA = `test_a_${Date.now()}@example.com`;
  const emailB = `test_b_${Date.now()}@example.com`;
  const password = "password123";

  try {
    // 1. Create User A
    const { data: userA, error: errA } = await supabase.auth.admin.createUser({
      email: emailA,
      password,
      email_confirm: true,
    });
    if (errA) throw errA;
    assertExists(userA.user, "User A should be created");

    // 2. Create User B (The one that will block the transfer)
    const { data: userB, error: errB } = await supabase.auth.admin.createUser({
      email: emailB,
      password,
      email_confirm: true,
    });
    if (errB) throw errB;
    assertExists(userB.user, "User B should be created");

    // 3. Try to transfer User A to Email B (should fail)
    const { data, error } = await supabase.rpc("safe_transfer_user_email", {
      old_email: emailA,
      new_email: emailB
    });

    // 4. Validate that it failed with the correct error message
    assertExists(error, "The transfer should have failed because target exists");
    assert(error.message.includes("já existe"), `Error message should mention that target exists. Got: ${error.message}`);

    // 5. Cleanup
    await supabase.auth.admin.deleteUser(userA.user.id);
    await supabase.auth.admin.deleteUser(userB.user.id);

  } catch (err) {
    console.error("Test failed with error:", err);
    throw err;
  }
});

Deno.test("Validation: transfer should succeed if target email does NOT exist", async () => {
    const emailSource = `source_${Date.now()}@example.com`;
    const emailTarget = `target_${Date.now()}@example.com`;
    const password = "password123";
  
    try {
      // 1. Create Source User
      const { data: user, error: errCreate } = await supabase.auth.admin.createUser({
        email: emailSource,
        password,
        email_confirm: true,
      });
      if (errCreate) throw errCreate;
      assertExists(user.user, "Source user should be created");
  
      // 2. Perform the transfer
      const { data, error } = await supabase.rpc("safe_transfer_user_email", {
        old_email: emailSource,
        new_email: emailTarget
      });
  
      if (error) throw error;
      assert(data.includes("Sucesso"), "The transfer should have succeeded");
  
      // 3. Verify that the user now has the new email
      const { data: updatedUser, error: errFetch } = await supabase.auth.admin.getUserById(user.user.id);
      if (errFetch) throw errFetch;
      assertEquals(updatedUser.user?.email, emailTarget, "Email should have been updated to target");
  
      // 4. Cleanup
      await supabase.auth.admin.deleteUser(user.user.id);
  
    } catch (err) {
      console.error("Test failed with error:", err);
      throw err;
    }
  });
