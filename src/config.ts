#!/usr/bin/env bun
/**
 * SMS Configuration and Constants
 */

import * as path from "path";

export const SMS_DIR = path.join(process.env.HOME || "~", ".sms");
export const SCRIPTS_DIR = path.join(SMS_DIR, "scripts");
export const INDEX_PATH = path.join(SMS_DIR, "index.json");