import { z } from "zod";

export const PredictRequestSchema = z.object({
  // Replace with actual task request schema
});

export const PredictResponseSchema = z.object({
  // Replace with actual task response schema
});

export type PredictRequest = z.infer<typeof PredictRequestSchema>;
export type PredictResponse = z.infer<typeof PredictResponseSchema>;
