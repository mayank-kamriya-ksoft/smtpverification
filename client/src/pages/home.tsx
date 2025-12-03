import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Loader2, Check, Server, ShieldCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { VerificationCard, type VerificationResult } from "@/components/verification-card";
import bgImage from "@assets/generated_images/clean_abstract_network_technology_background.png";

const formSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type Step = {
  id: string;
  label: string;
  status: "pending" | "active" | "completed" | "error";
};

export default function Home() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [steps, setSteps] = useState<Step[]>([
    { id: "dns", label: "Resolving DNS Records", status: "pending" },
    { id: "mx", label: "Identifying MX Servers", status: "pending" },
    { id: "connect", label: "Establishing SMTP Connection", status: "pending" },
    { id: "handshake", label: "Performing SMTP Handshake", status: "pending" },
    { id: "verify", label: "Deep Mailbox Verification", status: "pending" },
  ]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
    },
  });

  const updateStep = (id: string, status: Step["status"]) => {
    setSteps(current =>
      current.map(step => (step.id === id ? { ...step, status } : step))
    );
  };

  const simulateVerification = async (email: string) => {
    setIsVerifying(true);
    setResult(null);
    
    // Reset steps
    setSteps(steps.map(s => ({ ...s, status: "pending" })));

    // Step 1: DNS
    updateStep("dns", "active");
    await new Promise(r => setTimeout(r, 600));
    updateStep("dns", "completed");

    // Step 2: MX
    updateStep("mx", "active");
    await new Promise(r => setTimeout(r, 800));
    updateStep("mx", "completed");

    // Step 3: Connection
    updateStep("connect", "active");
    await new Promise(r => setTimeout(r, 1200));
    updateStep("connect", "completed");

    // Step 4: Handshake
    updateStep("handshake", "active");
    await new Promise(r => setTimeout(r, 1000));
    updateStep("handshake", "completed");

    // Step 5: Verify
    updateStep("verify", "active");
    await new Promise(r => setTimeout(r, 800));
    updateStep("verify", "completed");

    // Generate Result
    const isYahoo = email.toLowerCase().includes("yahoo");
    const isInvalid = email.toLowerCase().includes("invalid");
    const isCatchAll = email.toLowerCase().includes("catchall");
    
    let finalResult: VerificationResult;

    if (isInvalid) {
      finalResult = {
        email,
        status: "invalid",
        smtp_code: 550,
        mx_server: "mx1.mail-server.com",
        attempts: 1,
        is_catch_all: false,
        is_temporary_error: false,
        reason: "Mailbox does not exist",
        time_taken_ms: 456
      };
    } else if (isCatchAll) {
      finalResult = {
        email,
        status: "catch_all",
        smtp_code: 250,
        mx_server: "aspmx.l.google.com",
        attempts: 1,
        is_catch_all: true,
        is_temporary_error: false,
        reason: "Server accepts all emails",
        time_taken_ms: 320
      };
    } else if (isYahoo) {
      // Simulate a retry scenario that eventually succeeds or fails
      finalResult = {
        email,
        status: "valid",
        smtp_code: 250,
        mx_server: "mta7.am0.yahoodns.net",
        attempts: 3,
        is_catch_all: false,
        is_temporary_error: true,
        reason: "Verified after retry",
        time_taken_ms: 1250
      };
    } else {
      finalResult = {
        email,
        status: "valid",
        smtp_code: 250,
        mx_server: "mx.example.com",
        attempts: 1,
        is_catch_all: false,
        is_temporary_error: false,
        reason: "Mailbox exists",
        time_taken_ms: 245
      };
    }

    setResult(finalResult);
    setIsVerifying(false);
  };

  function onSubmit(values: z.infer<typeof formSchema>) {
    simulateVerification(values.email);
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-100">
      {/* Hero Section with Background */}
      <div className="relative h-[500px] overflow-hidden bg-slate-900">
        <div className="absolute inset-0 z-0 opacity-40">
          <img 
            src={bgImage} 
            alt="Network Background" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50/90 z-10" />
        
        <div className="relative z-20 container mx-auto px-4 pt-32 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 backdrop-blur-sm text-blue-600 mb-6 font-medium text-sm">
              <ShieldCheck className="w-4 h-4" />
              <span>Enterprise Grade SMTP Verification</span>
            </div>
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6">
              Deep SMTP <span className="text-blue-600">Verification</span>
            </h1>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-10">
              Verify email existence in real-time without sending a single email. 
              Reduce bounce rates and protect your sender reputation with our deep handshake technology.
            </p>
          </motion.div>

          {/* Input Card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-xl mx-auto"
          >
            <Card className="border-0 shadow-2xl ring-1 ring-slate-200/50 bg-white/90 backdrop-blur-xl">
              <CardContent className="p-2">
                <form onSubmit={form.handleSubmit(onSubmit)} className="flex gap-2 p-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3.5 top-3.5 w-5 h-5 text-slate-400" />
                    <Input
                      placeholder="Enter email to verify (e.g. john@company.com)"
                      {...form.register("email")}
                      className="pl-11 h-12 text-lg bg-white border-slate-200 focus-visible:ring-blue-500 transition-all"
                      data-testid="input-email"
                    />
                  </div>
                  <Button 
                    type="submit" 
                    size="lg" 
                    disabled={isVerifying}
                    className="h-12 px-8 text-base font-medium bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-600/20 transition-all duration-300"
                    data-testid="button-verify"
                  >
                    {isVerifying ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Verify <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
            {form.formState.errors.email && (
              <p className="text-red-500 text-sm mt-2 text-left ml-4">{form.formState.errors.email.message}</p>
            )}
          </motion.div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="container mx-auto px-4 pb-24 -mt-20 relative z-30">
        {isVerifying && !result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-2xl mx-auto bg-white rounded-xl shadow-xl border border-slate-100 p-8"
          >
            <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
              Running Deep Verification...
            </h3>
            <div className="space-y-4">
              {steps.map((step, index) => (
                <div key={step.id} className="flex items-center gap-4">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center border transition-colors duration-300
                    ${step.status === 'completed' ? 'bg-green-50 border-green-200 text-green-600' : 
                      step.status === 'active' ? 'bg-blue-50 border-blue-200 text-blue-600' : 
                      'bg-slate-50 border-slate-100 text-slate-300'}
                  `}>
                    {step.status === 'completed' ? <Check className="w-4 h-4" /> : 
                     step.status === 'active' ? <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" /> :
                     <div className="w-2 h-2 rounded-full bg-slate-300" />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-sm font-medium transition-colors duration-300 ${
                      step.status === 'pending' ? 'text-slate-400' : 'text-slate-700'
                    }`}>
                      {step.label}
                    </div>
                    {step.status === 'active' && (
                      <div className="h-1 w-full bg-slate-100 rounded-full mt-2 overflow-hidden">
                        <motion.div 
                          className="h-full bg-blue-500 rounded-full"
                          initial={{ width: "0%" }}
                          animate={{ width: "100%" }}
                          transition={{ duration: 1, repeat: Infinity }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {result && (
          <VerificationCard result={result} />
        )}
      </div>
    </div>
  );
}