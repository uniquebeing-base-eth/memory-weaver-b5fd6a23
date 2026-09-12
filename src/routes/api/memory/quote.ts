import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { createQuote } from "@/lib/agent/pipeline.server";

const Body = z.object({ memory: z.string().min(1).max(4000) });

export const Route = createFileRoute("/api/memory/quote")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json(
            {
              error: {
                code: "memory_too_short",
                message: "Tell us a little more about this memory.",
                retryable: true,
              },
            },
            { status: 400 },
          );
        }

        const outcome = await createQuote(parsed.data.memory);
        if (!outcome.ok) return Response.json({ error: outcome.error }, { status: 422 });
        return Response.json(outcome.quote);
      },
    },
  },
});
