import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createBetterSqliteCompatClient } from "./node-sqlite-adapter";

it("takes the write lock again after a failed IMMEDIATE transaction", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dinotalk-tx-"));
  const dbPath = path.join(dir, "test.db");
  const primary = createBetterSqliteCompatClient(dbPath);
  const peer = createBetterSqliteCompatClient(dbPath);
  try {
    primary.exec("CREATE TABLE entries (id INTEGER PRIMARY KEY)");
    peer.exec("BEGIN IMMEDIATE");
    try {
      expect(() => primary.transaction(() => undefined).immediate()).toThrow(/locked/);
    } finally {
      peer.exec("ROLLBACK");
    }

    primary.transaction(() => {
      expect(() => peer.exec("INSERT INTO entries VALUES (1)")).toThrow(/locked/);
      primary.exec("INSERT INTO entries VALUES (2)");
    }).immediate();
    expect(peer.prepare("SELECT id FROM entries").all()).toEqual([{ id: 2 }]);
  } finally {
    peer.close();
    primary.close();
    fs.unlinkSync(dbPath);
    fs.rmdirSync(dir);
  }
});
