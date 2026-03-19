// Types for SMS (Script Management System)

export interface ScriptEntry {
  path: string;           // Relative path within ~/.sms/scripts/
  sourcePath?: string;    // Original source path (for updates)
  description?: string;   // Optional description
  env?: Record<string, string>; // Optional environment variables
  addedAt: string;        // ISO timestamp
  updatedAt: string;      // ISO timestamp
}

export interface Index {
  version: string;
  scripts: Record<string, ScriptEntry>;  // alias -> entry
}

export interface DoctorResult {
  alias: string;
  path: string;
  exists: boolean;
  kind?: "script-missing" | "source-missing";
  sourcePath?: string;
  suggestedFix?: string;
}
