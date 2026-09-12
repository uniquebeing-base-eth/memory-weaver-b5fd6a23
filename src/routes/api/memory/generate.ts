import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { retryGeneration, runGeneration } from "@/lib/agent/pipeline.server";

const Body = z.object({
  quoteId: z.string().min(1),
  retry: z.boolean().optional(),
  payments: z
    .object({
      agent: z.unknown().optional(),
      fee: z.unknown().optional(),
    })
    .optional(),
});

export const Route = createFileRoute("/api/memory/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: { code: "generation_failed", message: "Bad request", retryable: false } }, { status: 400 });
        }

        const { quoteId, retry, payments } = parsed.data;
        const result = retry
          ? await retryGeneration(quoteId)
          : await runGeneration(quoteId, payments ?? {});

        if (!result) {
          return Response.json(
            {
              error: {
                code: "generation_failed",
                message: "This memory expired. Write it again and we'll make your artwork.",
                retryable: false,
              },
            },
            { status: 404 },
          );
        }

        return Response.json(result);
      },
    },
  },
});
