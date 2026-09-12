import { createFileRoute } from "@tanstack/react-router";

import { checkGeneration } from "@/lib/agent/pipeline.server";

export const Route = createFileRoute("/api/memory/status/$taskId")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await checkGeneration(params.taskId);
        if (!result) {
          return Response.json(
            {
              error: {
                code: "generation_failed",
                message: "We lost track of this memory. Please create it again.",
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
