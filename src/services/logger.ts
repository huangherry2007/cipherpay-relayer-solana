// src/services/logger.ts
import pino from "pino";
import chalk from "chalk";

const isDev = process.env.NODE_ENV !== "production";

export const logger = isDev
  ? {
      info: (...a: any[]) => console.log(chalk.cyan("ℹ"), ...a),
      ok: (...a: any[]) => console.log(chalk.green("✓"), ...a),
      warn: (...a: any[]) => console.log(chalk.yellow("⚠"), ...a),
      error: (...a: any[]) => console.log(chalk.red("✖"), ...a),
      debug: (...a: any[]) => console.log(chalk.gray("🐛"), ...a),
    }
  : pino({ level: process.env.LOG_LEVEL ?? "info" });

