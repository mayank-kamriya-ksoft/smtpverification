import { resolveMx } from "dns/promises";
import { Socket } from "net";

export type VerificationStatus = "valid" | "invalid" | "unknown" | "catch_all" | "retry_later" | "blocked" | "greylisted";

export interface VerificationResult {
  email: string;
  status: VerificationStatus;
  smtp_code: number;
  mx_server: string;
  attempts: number;
  is_catch_all: boolean;
  is_temporary_error: boolean;
  reason: string;
  time_taken_ms: number;
}

interface MXRecord {
  exchange: string;
  priority: number;
}

const SMTP_TIMEOUT = 10000; // 10 seconds per attempt
const MAX_RETRIES = 3;
const RETRY_DELAYS = [0, 30000, 90000]; // immediate, 30s, 90s

export class SMTPVerifier {
  private fromEmail: string;

  constructor(fromEmail: string = "verify@cleansignups.com") {
    this.fromEmail = fromEmail;
  }

  /**
   * Main entry point for email verification
   */
  async verifyEmail(email: string): Promise<VerificationResult> {
    const startTime = Date.now();
    console.log(`\n🔍 Starting SMTP verification for: ${email}`);

    try {
      // Step 1: Extract domain
      const domain = this.extractDomain(email);
      console.log(`📧 Domain extracted: ${domain}`);

      // Step 2: Get MX Records
      const mxRecords = await this.getMXRecords(domain);
      if (mxRecords.length === 0) {
        console.error(`❌ No MX records found for domain: ${domain}`);
        return this.createResult(
          email,
          "invalid",
          550,
          "No MX",
          1,
          false,
          false,
          "No MX records found for domain",
          Date.now() - startTime
        );
      }

      console.log(`✅ Found ${mxRecords.length} MX record(s):`, mxRecords.map(mx => mx.exchange));

      // Step 3: Try verification with retry logic
      let lastError: any = null;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        console.log(`\n🔄 Attempt ${attempt + 1}/${MAX_RETRIES}`);

        if (attempt > 0) {
          const delay = RETRY_DELAYS[attempt];
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }

        try {
          const result = await this.attemptSMTPVerification(email, mxRecords, attempt + 1, startTime);
          
          // If successful or definitively invalid, return immediately
          if (result.status === "valid" || result.status === "invalid" || result.status === "catch_all") {
            return result;
          }

          // For temporary errors, continue retrying
          if (result.is_temporary_error) {
            lastError = result;
            continue;
          }

          return result;
        } catch (error: any) {
          console.error(`❌ Attempt ${attempt + 1} failed:`, error.message);
          lastError = error;
          
          // Continue to next attempt
          if (attempt < MAX_RETRIES - 1) {
            continue;
          }
        }
      }

      // All attempts exhausted
      console.error(`❌ All ${MAX_RETRIES} attempts failed`);
      return this.createResult(
        email,
        "unknown",
        0,
        mxRecords[0].exchange,
        MAX_RETRIES,
        false,
        true,
        lastError?.reason || lastError?.message || "Verification failed after multiple attempts",
        Date.now() - startTime
      );

    } catch (error: any) {
      console.error(`❌ Fatal error during verification:`, error);
      return this.createResult(
        email,
        "unknown",
        0,
        "error",
        1,
        false,
        false,
        error.message || "Unknown error occurred",
        Date.now() - startTime
      );
    }
  }

  /**
   * Attempt SMTP verification against MX servers
   */
  private async attemptSMTPVerification(
    email: string,
    mxRecords: MXRecord[],
    attemptNumber: number,
    startTime: number
  ): Promise<VerificationResult> {
    // Try each MX server in priority order
    for (const mx of mxRecords) {
      console.log(`🌐 Connecting to MX server: ${mx.exchange} (priority: ${mx.priority})`);

      try {
        const result = await this.performSMTPHandshake(email, mx.exchange, attemptNumber);
        
        if (result) {
          const timeTaken = Date.now() - startTime;
          return { ...result, time_taken_ms: timeTaken };
        }
      } catch (error: any) {
        console.warn(`⚠️ MX server ${mx.exchange} failed: ${error.message}`);
        // Try next MX server
        continue;
      }
    }

    throw new Error("All MX servers failed to respond");
  }

  /**
   * Perform SMTP handshake with a mail server
   */
  private async performSMTPHandshake(
    email: string,
    mxServer: string,
    attemptNumber: number
  ): Promise<Omit<VerificationResult, "time_taken_ms"> | null> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let transcript = "";
      let currentStep = "CONNECT";
      const handshakeStart = Date.now();

      const addToTranscript = (direction: string, message: string) => {
        const line = `${direction} ${message}`;
        transcript += line + "\n";
        console.log(`  ${line}`);
      };

      const cleanup = () => {
        socket.removeAllListeners();
        socket.destroy();
      };

      socket.setTimeout(SMTP_TIMEOUT);

      socket.on("timeout", () => {
        console.error(`⏱️ Timeout during ${currentStep}`);
        cleanup();
        reject(new Error(`Connection timeout during ${currentStep}`));
      });

      socket.on("error", (error) => {
        console.error(`❌ Socket error during ${currentStep}:`, error.message);
        cleanup();
        reject(error);
      });

      let responseBuffer = "";

      socket.on("data", (data) => {
        responseBuffer += data.toString();
        const lines = responseBuffer.split("\r\n");
        
        // Keep incomplete line in buffer
        responseBuffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          
          addToTranscript("<<<", line);
          const code = parseInt(line.substring(0, 3));

          try {
            if (currentStep === "CONNECT") {
              if (code === 220) {
                currentStep = "HELO";
                socket.write(`HELO cleansignups.com\r\n`);
                addToTranscript(">>>", "HELO cleansignups.com");
              } else {
                cleanup();
                resolve(this.createResult(email, "blocked", code, mxServer, attemptNumber, false, false, `Server rejected connection: ${line}`, 0));
                return;
              }
            } else if (currentStep === "HELO") {
              if (code === 250) {
                currentStep = "MAIL_FROM";
                socket.write(`MAIL FROM:<${this.fromEmail}>\r\n`);
                addToTranscript(">>>", `MAIL FROM:<${this.fromEmail}>`);
              } else {
                cleanup();
                resolve(this.createResult(email, "blocked", code, mxServer, attemptNumber, false, false, `HELO rejected: ${line}`, 0));
                return;
              }
            } else if (currentStep === "MAIL_FROM") {
              if (code === 250) {
                currentStep = "RCPT_TO";
                socket.write(`RCPT TO:<${email}>\r\n`);
                addToTranscript(">>>", `RCPT TO:<${email}>`);
              } else {
                cleanup();
                resolve(this.createResult(email, "blocked", code, mxServer, attemptNumber, false, false, `MAIL FROM rejected: ${line}`, 0));
                return;
              }
            } else if (currentStep === "RCPT_TO") {
              // This is the critical response
              const responseTime = Date.now() - handshakeStart;

              socket.write("QUIT\r\n");
              addToTranscript(">>>", "QUIT");

              let status: VerificationStatus;
              let isCatchAll = false;
              let isTemporary = false;
              let reason = line;

              if (code === 250) {
                console.log(`✅ RCPT TO accepted (250 OK) in ${responseTime}ms`);
                status = "valid";
                reason = "Mailbox exists";
              } else if (code === 252) {
                console.log(`🛡️ Server returned 252 (Catch-all)`);
                status = "catch_all";
                isCatchAll = true;
                reason = "Server accepts all emails (catch-all)";
              } else if (code === 550 || code === 551 || code === 553) {
                console.log(`❌ Mailbox not found (${code})`);
                status = "invalid";
                reason = "Mailbox does not exist";
              } else if (code === 450 || code === 451 || code === 452) {
                console.log(`⏳ Temporary error (${code})`);
                status = "retry_later";
                isTemporary = true;
                reason = "Temporary error - retry later";
              } else if (code === 421) {
                console.log(`🚫 Server busy (421)`);
                status = "retry_later";
                isTemporary = true;
                reason = "Server busy - retry later";
              } else if (line.toLowerCase().includes("greylist")) {
                console.log(`🔒 Greylisted`);
                status = "greylisted";
                isTemporary = true;
                reason = "Greylisted - retry after delay";
              } else {
                console.log(`⚠️ Unknown response code: ${code}`);
                status = "unknown";
                reason = `Unknown SMTP response: ${line}`;
              }

              cleanup();
              resolve(this.createResult(email, status, code, mxServer, attemptNumber, isCatchAll, isTemporary, reason, 0));
              return;
            }
          } catch (error: any) {
            console.error(`❌ Error processing SMTP response:`, error);
            cleanup();
            reject(error);
          }
        }
      });

      console.log(`🔌 Connecting to ${mxServer}:25...`);
      socket.connect(25, mxServer);
    });
  }

  /**
   * Get MX records for a domain
   */
  private async getMXRecords(domain: string): Promise<MXRecord[]> {
    try {
      console.log(`🔍 Looking up MX records for: ${domain}`);
      const records = await resolveMx(domain);
      
      // Sort by priority (lower is higher priority)
      const sorted = records.sort((a, b) => a.priority - b.priority);
      
      console.log(`✅ Found MX records:`, sorted);
      return sorted;
    } catch (error: any) {
      console.error(`❌ MX lookup failed for ${domain}:`, error.message);
      return [];
    }
  }

  /**
   * Extract domain from email address
   */
  private extractDomain(email: string): string {
    const parts = email.split("@");
    if (parts.length !== 2) {
      throw new Error("Invalid email format");
    }
    return parts[1].toLowerCase();
  }

  /**
   * Helper to create result object
   */
  private createResult(
    email: string,
    status: VerificationStatus,
    smtp_code: number,
    mx_server: string,
    attempts: number,
    is_catch_all: boolean,
    is_temporary_error: boolean,
    reason: string,
    time_taken_ms: number
  ): VerificationResult {
    return {
      email,
      status,
      smtp_code,
      mx_server,
      attempts,
      is_catch_all,
      is_temporary_error,
      reason,
      time_taken_ms
    };
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
