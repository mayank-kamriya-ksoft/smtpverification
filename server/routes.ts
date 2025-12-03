import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { SMTPVerifier } from "./smtp-verifier";
import { z } from "zod";

const verifyEmailSchema = z.object({
  email: z.string().email("Invalid email format"),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const smtpVerifier = new SMTPVerifier();

  /**
   * POST /api/verify/smtp
   * Verify an email using deep SMTP handshake
   */
  app.post("/api/verify/smtp", async (req, res) => {
    console.log("\n" + "=".repeat(80));
    console.log("🔒 NEW SMTP VERIFICATION REQUEST");
    console.log("=".repeat(80));

    try {
      // Validate request body
      const parseResult = verifyEmailSchema.safeParse(req.body);
      
      if (!parseResult.success) {
        console.error("❌ Validation failed:", parseResult.error.errors);
        return res.status(400).json({
          error: "Invalid request",
          details: parseResult.error.errors
        });
      }

      const { email } = parseResult.data;
      console.log(`📧 Email to verify: ${email}`);

      // Perform SMTP verification
      const result = await smtpVerifier.verifyEmail(email);

      console.log("\n✅ VERIFICATION COMPLETE");
      console.log("Result:", JSON.stringify(result, null, 2));
      console.log("=".repeat(80) + "\n");

      return res.status(200).json(result);

    } catch (error: any) {
      console.error("\n❌ VERIFICATION ERROR:");
      console.error(error);
      console.error("=".repeat(80) + "\n");

      return res.status(500).json({
        error: "Verification failed",
        message: error.message || "Unknown error occurred",
        email: req.body?.email || "unknown"
      });
    }
  });

  /**
   * GET /api/health
   * Health check endpoint
   */
  app.get("/api/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "CleanSignups SMTP Verification"
    });
  });

  return httpServer;
}
