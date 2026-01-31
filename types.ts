// Types for SMS (Script Management System)

export interface ScriptEntry {
  path: string;           // Relative path within ~/.sms/scripts/
  description?: string;   // Optional description
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
  suggestedFix?: string;
}
