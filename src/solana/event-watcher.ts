// src/solana/event-watcher.ts
import { Connection, PublicKey } from "@solana/web3.js";
import { EventParser, Program } from "@coral-xyz/anchor";
import type { CipherpayAnchor } from "@/types/cipherpay_anchor.js";
import { logger } from "@/utils/logger.js";

export type SolanaEvent = {
  name: string;
  data: any;
  signature: string;
  logs: string[];
};

type ProgramHarness = {
  programId: PublicKey;
  connection: Connection;
  program?: Program<CipherpayAnchor>;
};

export class EventWatcher {
  private readonly programId: PublicKey;
  private readonly connection: Connection;
  private readonly parser?: EventParser;

  private subId: number | null = null;
  private cb: ((e: SolanaEvent) => void) | null = null;

  constructor(h: ProgramHarness) {
    this.programId = h.programId;
    this.connection = h.connection;
    this.parser = h.program ? new EventParser(this.programId, h.program.coder) : undefined;
  }

  async onAll(callback: (event: SolanaEvent) => void) {
    this.cb = callback;
    if (this.subId !== null) return;

    this.subId = await this.connection.onLogs(
      this.programId,
      (entry) => {
        const logs = entry.logs ?? [];
        const sig = entry.signature;
        if (!logs.length) return;

        if (this.parser) {
          try {
            for (const ev of this.parser.parseLogs(logs)) {
              this.cb?.({ name: ev.name, data: ev.data, signature: sig, logs });
            }
            return;
          } catch (err) {
            logger.app.warn({ sig, err: String(err) }, "Event decode failed; forwarding raw logs");
          }
        }
        this.cb?.({ name: "__logs", data: null, signature: sig, logs });
      },
      "confirmed"
    );

    logger.app.info({ programId: this.programId.toBase58(), subId: this.subId }, "EventWatcher subscribed via connection.onLogs");
  }

  async stop() {
    if (this.subId !== null) {
      try {
        await this.connection.removeOnLogsListener(this.subId);
      } catch (e) {
        logger.app.warn({ err: String(e) }, "removeOnLogsListener failed");
      }
      this.subId = null;
      this.cb = null;
      logger.app.info("EventWatcher unsubscribed");
    }
  }
}
