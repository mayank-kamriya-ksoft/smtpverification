import { motion } from "framer-motion";
import { CheckCircle, XCircle, AlertCircle, Shield, Server, Clock, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type VerificationResult = {
  email: string;
  status: "valid" | "invalid" | "unknown" | "catch_all" | "retry_later" | "blocked" | "greylisted";
  smtp_code: number;
  mx_server: string;
  attempts: number;
  is_catch_all: boolean;
  is_temporary_error: boolean;
  reason: string;
  time_taken_ms: number;
};

interface VerificationCardProps {
  result: VerificationResult;
}

export function VerificationCard({ result }: VerificationCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "valid": return "text-green-600 bg-green-50 border-green-200";
      case "invalid": return "text-red-600 bg-red-50 border-red-200";
      case "catch_all": return "text-amber-600 bg-amber-50 border-amber-200";
      default: return "text-blue-600 bg-blue-50 border-blue-200";
    }
  };

  const getIcon = (status: string) => {
    switch (status) {
      case "valid": return <CheckCircle className="w-12 h-12 text-green-500" />;
      case "invalid": return <XCircle className="w-12 h-12 text-red-500" />;
      case "catch_all": return <Shield className="w-12 h-12 text-amber-500" />;
      default: return <AlertCircle className="w-12 h-12 text-blue-500" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-4xl mx-auto mt-8"
    >
      <Card className="overflow-hidden border-2 shadow-lg">
        <CardHeader className="bg-slate-50/50 border-b pb-8 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white rounded-full shadow-sm ring-1 ring-slate-100">
                {getIcon(result.status)}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{result.email}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className={`text-sm font-medium px-3 py-0.5 rounded-full border ${getStatusColor(result.status)}`}>
                    {result.status.toUpperCase()}
                  </Badge>
                  <span className="text-sm text-slate-500 font-mono">SMTP Code: {result.smtp_code}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500">Confidence Score</div>
              <div className="text-3xl font-bold text-slate-900">
                {result.status === "valid" ? "98%" : result.status === "catch_all" ? "75%" : "100%"}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <Server className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">MX Server</div>
                <div className="text-sm font-medium text-slate-900 font-mono mt-1 truncate" title={result.mx_server}>
                  {result.mx_server}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <Clock className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Response Time</div>
                <div className="text-sm font-medium text-slate-900 font-mono mt-1">
                  {result.time_taken_ms}ms
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-50 border border-slate-100">
              <Activity className="w-5 h-5 text-slate-400 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">Attempts</div>
                <div className="text-sm font-medium text-slate-900 font-mono mt-1">
                  {result.attempts} (Success)
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute top-0 right-0 px-2 py-1 bg-slate-100 text-xs font-mono text-slate-500 rounded-bl-lg rounded-tr-lg border-l border-b">
              JSON Output
            </div>
            <pre className="bg-slate-950 text-slate-50 p-6 rounded-xl overflow-x-auto text-sm font-mono border border-slate-800 shadow-inner">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}