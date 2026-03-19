import { z } from "zod";

// --- Request ---

export const FileAttachmentSchema = z.object({
  filename: z.string(),
  content_base64: z.string(),
  mime_type: z.string(),
});

export const TripletexCredentialsSchema = z.object({
  base_url: z.string().min(1),
  session_token: z.string(),
});

export const SolveRequestSchema = z.object({
  prompt: z.string(),
  files: z.array(FileAttachmentSchema).default([]),
  tripletex_credentials: TripletexCredentialsSchema,
});

// --- Response ---

export const SolveResponseSchema = z.object({
  status: z.literal("completed"),
});

// --- Inferred types ---

export type FileAttachment = z.infer<typeof FileAttachmentSchema>;
export type TripletexCredentials = z.infer<typeof TripletexCredentialsSchema>;
export type SolveRequest = z.infer<typeof SolveRequestSchema>;
export type SolveResponse = z.infer<typeof SolveResponseSchema>;
