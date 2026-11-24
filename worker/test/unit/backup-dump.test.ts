import { test } from "node:test";
import assert from "node:assert/strict";
import pkg from "../../../scripts/backup-d1.js";
const { sqlLiteral, quoteIdent } = pkg as any;

/** P0-2: dump literal/identifier quoting (FTS5-safe backup redesign). */

test("backup-dump: sqlLiteral quotes every D1 JSON value", () => {
  assert.equal(sqlLiteral(null), "NULL");
  assert.equal(sqlLiteral(undefined), "NULL");
  assert.equal(sqlLiteral(42), "42");
  assert.equal(sqlLiteral(-1.5), "-1.5");
  assert.equal(sqlLiteral(Number.NaN), "NULL");
  assert.equal(sqlLiteral(true), "1");
  assert.equal(sqlLiteral(false), "0");
  assert.equal(sqlLiteral("plain"), "'plain'");
  assert.equal(sqlLiteral("o'clock"), "'o''clock'");
  assert.equal(sqlLiteral("세oul'한"), "'세oul''한'");
  assert.equal(sqlLiteral([222, 173, 190, 239]), "X'deadbeef'");
  assert.equal(sqlLiteral(new Uint8Array([0, 255])), "X'00ff'");
});

test("backup-dump: quoteIdent escapes double quotes", () => {
  assert.equal(quoteIdent("bookings"), '"bookings"');
  assert.equal(quoteIdent('we"ird'), '"we""ird"');
});
