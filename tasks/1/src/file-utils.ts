/**
 * File preprocessing utilities for Tripletex agent.
 * Handles CSV decoding (LLMs can't read CSV as file content parts)
 * and file metadata for classification.
 */

import type { FileAttachment } from "./dtos.js";

export interface ProcessedFiles {
  /** CSV content decoded to text, ready to inject into prompt */
  csvText: string | null;
  /** Non-CSV files (PDFs, images) to pass as native content parts */
  nativeFiles: FileAttachment[];
  /** File metadata for classification hints */
  fileHints: string[];
}

/** Max CSV text to inject into prompt (50KB to avoid context overflow) */
const MAX_CSV_TEXT = 50_000;

/**
 * Preprocess files: decode CSVs to text, keep PDFs/images as-is.
 * CSVs must be decoded because LLMs can't read base64 CSV content parts.
 */
export function preprocessFiles(files: FileAttachment[]): ProcessedFiles {
  const csvTexts: string[] = [];
  const nativeFiles: FileAttachment[] = [];
  const fileHints: string[] = [];

  for (const f of files) {
    const isCSV =
      f.mime_type === "text/csv" ||
      f.mime_type === "application/csv" ||
      f.filename.toLowerCase().endsWith(".csv");

    if (isCSV) {
      try {
        const decoded = Buffer.from(f.content_base64, "base64").toString("utf-8");
        const truncated = decoded.length > MAX_CSV_TEXT
          ? decoded.slice(0, MAX_CSV_TEXT) + "\n... [truncated]"
          : decoded;
        csvTexts.push(`--- CSV File: ${f.filename} ---\n${truncated}\n--- End CSV ---`);
        fileHints.push(`csv:${f.filename}`);
      } catch {
        // If decoding fails, pass as native file
        nativeFiles.push(f);
        fileHints.push(`file:${f.filename}`);
      }
    } else {
      nativeFiles.push(f);
      const type = f.mime_type.startsWith("image/") ? "image" : "pdf";
      fileHints.push(`${type}:${f.filename}`);
    }
  }

  return {
    csvText: csvTexts.length > 0 ? csvTexts.join("\n\n") : null,
    nativeFiles,
    fileHints,
  };
}

/**
 * Classify file attachments to boost task classification.
 * Returns a task type hint based on filename patterns, or null.
 */
export function classifyFromFiles(files: FileAttachment[]): string | null {
  for (const f of files) {
    const name = f.filename.toLowerCase();
    // Invoice/receipt patterns
    if (/faktura|invoice|factura|rechnung|facture/.test(name)) return "supplier-invoice";
    if (/kvittering|receipt|recibo|quittung|reçu/.test(name)) return "supplier-invoice";
    // Travel expense patterns
    if (/utgift|expense|reise|travel|viaje|viagem|voyage/.test(name)) return "travel-expense-full";
    // CSV = likely bank reconciliation
    if (name.endsWith(".csv") || f.mime_type === "text/csv") return "voucher";
  }
  return null;
}
