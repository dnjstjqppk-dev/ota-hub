import { test } from "node:test";
import assert from "node:assert/strict";
import { splitSql } from "../../../scripts/verify-backup-restore.mjs";

/** TG-20: dump statement splitter (trigger bodies + quoted semicolons). */

test("restore-verify: splits plain statements", () => {
  assert.deepEqual(splitSql("CREATE TABLE a (x);\nINSERT INTO a VALUES (1);"), [
    "CREATE TABLE a (x)",
    "INSERT INTO a VALUES (1)",
  ]);
});

test("restore-verify: keeps trigger bodies whole", () => {
  const stmts = splitSql(`CREATE TRIGGER t BEFORE UPDATE ON a
BEGIN SELECT RAISE(ABORT, 'x;y'); END;
INSERT INTO a VALUES (2);`);
  assert.equal(stmts.length, 2);
  assert.ok(stmts[0].includes("RAISE(ABORT, 'x;y')"));
  assert.equal(stmts[1], "INSERT INTO a VALUES (2)");
});

test("restore-verify: quoted semicolons and comments never split", () => {
  const stmts = splitSql(`-- leading comment;
INSERT INTO a VALUES ('semi;colon', "dq;dq", \`bt;bt\`, [br;br]); /* tail; comment */
SELECT 1;`);
  // Comments ride along with their chunk (harmless to SQLite); the point is
  // the count: no phantom statements from comment/quoted semicolons.
  assert.equal(stmts.length, 2);
  assert.ok(stmts[0].includes("'semi;colon'"));
  assert.ok(stmts[1].includes("SELECT 1"));
});

test("restore-verify: escaped quotes and empty input", () => {
  const stmts = splitSql("INSERT INTO a VALUES ('it''s; fine');");
  assert.equal(stmts.length, 1);
  assert.deepEqual(splitSql(""), []);
  assert.deepEqual(splitSql("  \n -- only a comment\n"), []);
});
