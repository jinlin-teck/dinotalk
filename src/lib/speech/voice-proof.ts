import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, desc, eq, gt, lte, notInArray } from "drizzle-orm";
import { getDb } from "@/db";
import { voiceProofs } from "@/db/schema";
import { PET_SNACKS } from "@/data/curriculum";
import { parseJsonStringArray } from "@/lib/services/learning-service";
import type { VoiceProofPurpose } from "./constants";
import { scorePronunciation } from "./pronunciation-scorer";

const VOICE_PROOF_TTL_MS = 2 * 60 * 1000;
const MAX_VOICE_PROOFS = 200;

type VoiceProofDb = Pick<ReturnType<typeof getDb>, "select" | "delete">;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function fingerprintTranscript(token: string, transcript: string): string {
  return createHmac("sha256", token).update(transcript.trim()).digest("hex");
}

export function issueVoiceProof(
  transcript: string,
  profileId: number,
  purpose: VoiceProofPurpose,
  now = Date.now()
): string {
  const token = randomBytes(16).toString("hex");
  // Reward verification needs the matched snack IDs or a fingerprint, never the raw transcript.
  const evidence = purpose === "feed"
    ? JSON.stringify(PET_SNACKS.filter((snack) => scorePronunciation(transcript, snack.nameEn).passed)
        .map((snack) => snack.id))
    : fingerprintTranscript(token, transcript);
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(voiceProofs).where(lte(voiceProofs.expiresAt, now)).run();
    const recent = tx.select({ tokenHash: voiceProofs.tokenHash })
      .from(voiceProofs)
      .orderBy(desc(voiceProofs.expiresAt))
      .limit(MAX_VOICE_PROOFS - 1);
    tx.delete(voiceProofs).where(notInArray(voiceProofs.tokenHash, recent)).run();
    tx.insert(voiceProofs).values({
      tokenHash: hashToken(token),
      profileId,
      purpose,
      evidence,
      expiresAt: now + VOICE_PROOF_TTL_MS,
    }).run();
  }, { behavior: "immediate" });
  return token;
}

// Consume in the same transaction as the reward so any failed write restores the proof.
export function consumeVoiceProof(
  tx: VoiceProofDb,
  token: string | undefined,
  profileId: number,
  expected: { purpose: "feed"; snackId: string } | { purpose: "roleplay"; transcript: string }
): boolean {
  if (!token) return false;
  const matchesScope = and(
    eq(voiceProofs.tokenHash, hashToken(token)),
    eq(voiceProofs.profileId, profileId),
    eq(voiceProofs.purpose, expected.purpose),
    gt(voiceProofs.expiresAt, Date.now())
  );
  const proof = tx.select({ evidence: voiceProofs.evidence })
    .from(voiceProofs).where(matchesScope).get();
  if (!proof) return false;

  const matchesReward = expected.purpose === "feed"
    ? parseJsonStringArray(proof.evidence).includes(expected.snackId)
    : proof.evidence === fingerprintTranscript(token, expected.transcript);
  return matchesReward && Number(tx.delete(voiceProofs).where(matchesScope).run().changes) === 1;
}
