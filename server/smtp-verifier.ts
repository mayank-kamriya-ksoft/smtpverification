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

const SMTP_TIMEOUT = 15000; // 15 seconds per attempt
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 10000]; // 1s, 3s, 10s with jitter

export class SMTPVerifier {
  private fromEmail: string;

  constructor(fromEmail: string = "verify@cleansignups.com") {
    this.fromEmail = fromEmail;
  }

  /**
   * Add random jitter to delay (±30%)
   */
  private addJitter(delay: number): number {
    const jitter = delay * 0.3;
    return delay + (Math.random() * jitter * 2 - jitter);
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
      let lastResult: VerificationResult | null = null;
      
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        console.log(`\n🔄 Attempt ${attempt + 1}/${MAX_RETRIES}`);

        if (attempt > 0) {
          const delay = Math.round(this.addJitter(RETRY_DELAYS[attempt - 1]));
          console.log(`⏳ Waiting ${delay}ms before retry (with jitter)...`);
          await this.sleep(delay);
        }

        try {
          const result = await this.attemptSMTPVerification(email, mxRecords, attempt + 1, startTime);
          
          // If successful or definitively invalid, return immediately
          if (result.status === "valid" || result.status === "invalid" || result.status === "catch_all") {
            console.log(`✅ Definitive result on attempt ${attempt + 1}: ${result.status}`);
            return result;
          }

          // Store this result for potential return
          lastResult = result;

          // For temporary errors or blocked, continue retrying
          if (result.status === "blocked" || result.status === "retry_later" || result.status === "greylisted") {
            console.log(`⚠️ Got ${result.status}, will retry...`);
            continue;
          }

          // Unknown - try again
          if (result.status === "unknown") {
            console.log(`❓ Unknown result, will retry...`);
            continue;
          }

        } catch (error: any) {
          console.error(`❌ Attempt ${attempt + 1} failed with error:`, error.message);
          lastResult = this.createResult(
            email,
            "unknown",
            0,
            mxRecords[0]?.exchange || "error",
            attempt + 1,
            false,
            true,
            error.message,
            Date.now() - startTime
          );
        }
      }

      // All attempts exhausted - return last result
      console.error(`❌ All ${MAX_RETRIES} attempts exhausted`);
      if (lastResult) {
        lastResult.attempts = MAX_RETRIES;
        lastResult.time_taken_ms = Date.now() - startTime;
        return lastResult;
      }

      return this.createResult(
        email,
        "unknown",
        0,
        mxRecords[0]?.exchange || "unknown",
        MAX_RETRIES,
        false,
        true,
        "Verification failed after all retries",
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
   * Properly handles multi-line SMTP responses
   */
  private async performSMTPHandshake(
    email: string,
    mxServer: string,
    attemptNumber: number
  ): Promise<Omit<VerificationResult, "time_taken_ms"> | null> {
    return new Promise((resolve, reject) => {
      const socket = new Socket();
      let currentStep = "CONNECT";
      const handshakeStart = Date.now();
      let responseBuffer = "";

      const log = (direction: string, message: string) => {
        console.log(`  ${direction} ${message}`);
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

      socket.on("close", () => {
        console.log(`🔌 Connection closed during ${currentStep}`);
      });

      /**
       * Parse SMTP response - handles multi-line responses
       * Multi-line format: "220-text" (dash = more lines coming)
       * Final line format: "220 text" (space = last line)
       */
      const parseSmtpResponse = (buffer: string): { code: number; complete: boolean; message: string } | null => {
        const lines = buffer.split("\r\n").filter(l => l.trim());
        if (lines.length === 0) return null;

        const lastLine = lines[lines.length - 1];
        
        // Check if we have a complete response (line with "code " pattern)
        const match = lastLine.match(/^(\d{3})([ -])(.*)/);
        if (!match) return null;

        const code = parseInt(match[1]);
        const separator = match[2];
        const isComplete = separator === " "; // Space means final line

        if (!isComplete) {
          return null; // Wait for more data
        }

        // Collect full message from all lines
        const fullMessage = lines.map(line => {
          const m = line.match(/^\d{3}[ -](.*)/);
          return m ? m[1] : line;
        }).join(" ");

        return { code, complete: true, message: fullMessage };
      };

      const processResponse = () => {
        const parsed = parseSmtpResponse(responseBuffer);
        if (!parsed || !parsed.complete) {
          return; // Wait for more data
        }

        const { code, message } = parsed;
        log("<<<", `${code} ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
        
        // Clear buffer after processing
        responseBuffer = "";

        try {
          if (currentStep === "CONNECT") {
            if (code === 220) {
              currentStep = "EHLO";
              const cmd = `EHLO cleansignups.com\r\n`;
              socket.write(cmd);
              log(">>>", "EHLO cleansignups.com");
            } else {
              cleanup();
              resolve(this.createResult(email, "blocked", code, mxServer, attemptNumber, false, false, `Server rejected connection: ${message}`, 0));
              return;
            }
          } else if (currentStep === "EHLO") {
            if (code === 250) {
              currentStep = "MAIL_FROM";
              const cmd = `MAIL FROM:<${this.fromEmail}>\r\n`;
              socket.write(cmd);
              log(">>>", `MAIL FROM:<${this.fromEmail}>`);
            } else if (code === 500 || code === 502) {
              // EHLO not supported, try HELO
              currentStep = "HELO";
              const cmd = `HELO cleansignups.com\r\n`;
              socket.write(cmd);
              log(">>>", "HELO cleansignups.com (fallback)");
            } else {
              cleanup();
              resolve(this.createResult(email, "blocked", code, mxServer, attemptNumber, false, code >= 400 && code < 500, `EHLO rejected: ${message}`, 0));
              return;
            }
          } else if (currentStep === "HELO") {
            if (code === 250) {
              currentStep = "MAIL_FROM";
              const cmd = `MAIL FROM:<${this.fromEmail}>\r\n`;
              socket.write(cmd);
              log(">>>", `MAIL FROM:<${this.fromEmail}>`);
            } else {
              cleanup();
              resolve(this.createResult(email, "blocked", code, mxServer, attemptNumber, false, code >= 400 && code < 500, `HELO rejected: ${message}`, 0));
              return;
            }
          } else if (currentStep === "MAIL_FROM") {
            if (code === 250) {
              currentStep = "RCPT_TO";
              const cmd = `RCPT TO:<${email}>\r\n`;
              socket.write(cmd);
              log(">>>", `RCPT TO:<${email}>`);
            } else {
              cleanup();
              resolve(this.createResult(email, "blocked", code, mxServer, attemptNumber, false, code >= 400 && code < 500, `MAIL FROM rejected: ${message}`, 0));
              return;
            }
          } else if (currentStep === "RCPT_TO") {
            // This is the critical response
            const responseTime = Date.now() - handshakeStart;

            socket.write("QUIT\r\n");
            log(">>>", "QUIT");

            let status: VerificationStatus;
            let isCatchAll = false;
            let isTemporary = false;
            let reason = message;

            if (code === 250) {
              console.log(`✅ RCPT TO accepted (250 OK) in ${responseTime}ms`);
              status = "valid";
              reason = "Mailbox exists";
            } else if (code === 251) {
              console.log(`✅ User not local, will forward (251)`);
              status = "valid";
              reason = "User not local but will forward";
            } else if (code === 252) {
              console.log(`🛡️ Server returned 252 (Cannot verify, but will accept)`);
              status = "catch_all";
              isCatchAll = true;
              reason = "Cannot verify user, but will accept message";
            } else if (code === 550 || code === 551 || code === 552 || code === 553 || code === 554) {
              console.log(`❌ Mailbox not found or rejected (${code})`);
              status = "invalid";
              reason = `Mailbox rejected: ${message}`;
            } else if (code === 450 || code === 451 || code === 452) {
              console.log(`⏳ Temporary error (${code})`);
              status = "retry_later";
              isTemporary = true;
              reason = `Temporary error: ${message}`;
            } else if (code === 421) {
              console.log(`🚫 Server busy (421)`);
              status = "retry_later";
              isTemporary = true;
              reason = `Server busy: ${message}`;
            } else if (message.toLowerCase().includes("greylist")) {
              console.log(`🔒 Greylisted`);
              status = "greylisted";
              isTemporary = true;
              reason = `Greylisted: ${message}`;
            } else if (code >= 500) {
              console.log(`❌ Permanent error (${code})`);
              status = "invalid";
              reason = `Permanent error: ${message}`;
            } else if (code >= 400) {
              console.log(`⏳ Temporary error (${code})`);
              status = "retry_later";
              isTemporary = true;
              reason = `Temporary error: ${message}`;
            } else {
              console.log(`⚠️ Unknown response code: ${code}`);
              status = "unknown";
              reason = `Unknown SMTP response: ${code} ${message}`;
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
      };

      socket.on("data", (data) => {
        responseBuffer += data.toString();
        processResponse();
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
