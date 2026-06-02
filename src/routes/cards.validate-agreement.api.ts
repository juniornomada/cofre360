import { createAPI } from "@tanstack/react-start/api";
import { validateAgreement } from "@/server-fns/validate-agreement";

export const handler = createAPI()
  .post(async ({ request }) => {
    try {
      const result = await validateAgreement();
      return new Response(JSON.stringify(result), {
        status: result.status === 'ok' ? 200 : (result.status === 'partial' ? 207 : 500),
        headers: { "Content-Type": "application/json" }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ status: "critical", error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  });
