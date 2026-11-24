## What a transaction is

A **transaction** is a group of one or more changes (INSERT, UPDATE, DELETE) that together do one logical piece of work, such as moving money between two accounts. Until the transaction ends, its changes aren't yet permanent.

- **COMMIT** ends the transaction and makes its changes permanent.
- **ROLLBACK** ends it and undoes every change it made.

The key promise is **all or nothing**: either every step of the transaction takes effect, or none does. During a transaction the database may be briefly inconsistent (money has left account A but hasn't reached B yet); before and after it, it must be consistent.

The usual shape:

```text
BEGIN
  do the work
  if everything worked: COMMIT
  otherwise:            ROLLBACK (and report the error)
END
```

## Transactions in Postgres

- **Autocommit.** Outside a transaction block, every statement that changes data is its own transaction and is committed the moment it succeeds. A later ROLLBACK can't undo it (Postgres just warns that no transaction is in progress).
- **BEGIN** starts a transaction block. Everything up to **COMMIT** (or **END**, which means the same) is one transaction.
- **An error inside a block dooms the whole block.** After the failing statement, Postgres refuses every further statement ("current transaction is aborted, commands ignored until end of transaction block"), and the COMMIT or END that closes the block actually rolls back. Every change in the block is gone, including the ones that ran fine before the error.

Compare two sessions on an empty table `enrol(sid, course)` whose primary key is (sid, course):

| | Session 1 | Session 2 |
|---|---|---|
| | `BEGIN;` | |
| | insert (1, 'CIS3530') (ok) | insert (1, 'CIS3530') (ok, committed) |
| | insert (2, 'CIS3530') (ok) | insert (2, 'CIS3530') (ok, committed) |
| | insert (1, 'CIS3530') again: duplicate key error | insert (1, 'CIS3530') again: duplicate key error |
| | `COMMIT;` → Postgres replies ROLLBACK | `ROLLBACK;` → warning, nothing to undo |
| **Rows left** | none | (1, 'CIS3530') and (2, 'CIS3530') |

## What COMMIT and ROLLBACK do behind the scenes

Every change is recorded in three places, in this order:

1. the **redo log**: what the change was, so it can be *replayed*;
2. the **undo entries**: the old values, so it can be *reversed*;
3. the **database** tables themselves.

So the tables already hold the new values before the transaction ends.

- **COMMIT** just discards the transaction's undo entries: the changes are already in the tables and the redo log, and now nothing can take them back. A **checkpoint** is logged; after a crash, what came before the checkpoint is restored from a backup, and what came after is recovered with the redo and undo logs.
- **ROLLBACK** writes to the redo log (so the rollback itself can be reconstructed), applies the undo entries to put the old values back, and then deletes the undo entries.

## ACID

If every transaction has these four properties, the database stays consistent.

| Property | Meaning | Who looks after it |
|---|---|---|
| **A**tomicity | All of the transaction happens, or none of it. | Rollback on error or failure |
| **C**onsistency | A consistent database stays consistent: the transaction doesn't break integrity constraints (keys, foreign keys, CHECKs). | The constraints, plus correct transactions |
| **I**solation | Concurrent transactions don't affect each other; each behaves as if it ran alone. (Like eating at a busy restaurant: your meal is the same as if you were the only diner.) | The **concurrency control** unit |
| **D**urability | Once committed, the changes stay, even after a crash. | The **recovery manager**: roll forward (REDO) and roll back (UNDO) |

## Many users at once

A **single-user** DBMS serves one user at a time (a database on a home computer). A **multiuser** DBMS serves many at once (an airline reservation system), so transactions run **concurrently**:

- **interleaved**: one CPU switches between transactions, running a piece of A, then a piece of B, then more of A;
- **parallel**: several CPUs run transactions at literally the same time.

### Data items and the two operations

A **data item** can be a record, a disk block or a single attribute value; the theory doesn't depend on which, so we call them X, Y, A, B.

- **Read(X)** copies the database item X into a program variable, also called X (find the disk block, copy it into a buffer, then into the variable).
- **Write(X)** copies the program variable X back into the database item X (into the buffer, and the block back to disk).

Arithmetic such as `A = A - 50` happens only on the program variable: the database doesn't change until `Write(A)`.

A transfer of $100 from A to B:

```text
Read(A); A = A - 100; Write(A); Read(B); B = B + 100; Write(B)
```

### Schedules

A **schedule** of transactions T1 … Tn is an order for all their operations. Operations from different transactions can be interleaved, but **each transaction's own operations stay in their original order**. A **serial** schedule runs the transactions one after another, with no interleaving.

Two serial orders can give different final values (both are "correct"); what matters for an interleaved schedule is whether it ends up like *some* serial order. When transactions only move money between accounts, every serial order keeps the total the same, so a schedule that changes the total has gone wrong.

## What goes wrong without concurrency control

In every example below there's no locking: a Read sees whatever was last written, committed or not.

### Dirty read

**Dirty data** is data written by a transaction that hasn't committed yet. A **dirty read** is reading another transaction's dirty data. If the writer then fails or rolls back, the reader has used a value that never officially existed.

| T1 | T2 |
|---|---|
| Read(A) *(A = 5)* | |
| A = 10 | |
| Write(A) | |
| | Read(A) *(reads 10)* |
| | COMMIT |
| Failure *(A goes back to 5)* | |

T2 committed work based on A = 10, which was undone.

### Unrepeatable read

A transaction reads the same item twice and gets different values, because another transaction **updated** it in between.

| T1 | T2 |
|---|---|
| Read(A) | |
| A = 10 | |
| | Read(A) *(5)* |
| Write(A) | |
| | Read(A) *(10)* |

### Phantom read

A transaction reads a set of rows twice, and rows have **appeared or disappeared** in between, because another transaction inserted or deleted them.

| T1 | T2 |
|---|---|
| Read(A) | |
| | Read(A) *(A is there)* |
| Delete(A) | |
| | Read(A) *(A is gone)* |

Unrepeatable: the same row has a different **value**. Phantom: the **set of rows** changed.

### Lost update (write–write conflict)

A transaction overwrites another's update without ever having seen it.

| T1 | T2 | A |
|---|---|---|
| Read(A) | | 5 |
| A = A - 2 | | 5 |
| | Read(A) | 5 |
| | A = A + 10 | 5 |
| Write(A) | | 3 |
| | Write(A) | 15 |

Either serial order gives 5 − 2 + 10 = 13. Here A ends at 15: T2 computed from the old 5, so T1's −2 is lost.

## How to work out a schedule

1. Keep a column for each database item and, for each transaction, its own copies of the variables.
2. **Read(X)**: copy the database's current X into that transaction's X.
3. **Assignments** change only that transaction's variables.
4. **Write(X)**: copy that transaction's X into the database.
5. **Rollback / Failure**: put back the values the transaction's writes replaced.
6. Compare the result with the serial orders. For transfers, check whether the total is still the same.

## Common mistakes

- Thinking `A = A - 50` changes the database. Only `Write(A)` does.
- Forgetting that each transaction uses the value *it* read, even if the database has changed since.
- Expecting ROLLBACK to undo statements that ran without BEGIN: in Postgres each was already committed.
- Expecting the rows before an error in a `BEGIN … END` block to survive: the whole block is rolled back.
- Mixing up unrepeatable reads (a value changed) and phantom reads (rows appeared or disappeared).
- Calling every concurrent schedule wrong: an interleaving that ends like some serial order is fine.
