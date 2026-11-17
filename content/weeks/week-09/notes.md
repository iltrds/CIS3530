## DDL: defining the database

Weeks 3 and 4 used SQL's **DML** (SELECT, INSERT, UPDATE, DELETE) on tables that already existed. This week is the **DDL** side, which creates and changes the tables themselves:

| Command | Does |
|---|---|
| `CREATE TABLE` | defines a new table: its columns, types and constraints |
| `ALTER TABLE` | changes an existing table's definition |
| `DROP TABLE` | removes a table, its rows and its definition |
| `TRUNCATE TABLE` | removes every row but keeps the table |

Then two kinds of database objects that run code: **user-defined functions** and **triggers**.

## Schemas

A **schema** groups the tables and other objects that belong to one database application. Many DBMSs put every table in one schema; Postgres lets you create your own and choose which one unqualified names refer to:

```sql
CREATE SCHEMA for3530;
SET SEARCH_PATH TO for3530;   -- CREATE TABLE S (…) now creates for3530.S
```

## CREATE TABLE

```sql
CREATE TABLE DEPARTMENT (
  DNAME        VARCHAR(10) NOT NULL,
  DNUMBER      INTEGER     NOT NULL,
  MGRSSN       CHAR(9),
  MGRSTARTDATE CHAR(9)
);
```

Each column gets a name and a **data type**:

| Kind | Types | Notes |
|---|---|---|
| integers | `INTEGER` / `INT` | |
| real numbers | `REAL`, `DECIMAL(i, j)`, `NUMERIC` | `DECIMAL(i, j)`: i digits in all, j after the decimal point |
| fixed-length text | `CHAR(n)` | always n characters (padded with spaces) |
| varying-length text | `VARCHAR(n)`, `VARCHAR` | up to n characters |

Postgres has many more (`TEXT`, `DATE`, `BOOLEAN`, `SERIAL`…); see its data-types documentation. `--` starts a comment that runs to the end of the line.

### Constraints

SQL supports the relational model's three basic constraints from Week 1:

- **key constraint**: a primary key value can't be duplicated,
- **entity integrity**: a primary key value can't be null,
- **referential integrity**: a foreign key value must already exist as a primary key value, or be null.

```sql
CREATE TABLE S (
  sno    CHAR(5) PRIMARY KEY,            -- simple primary key, declared on the column
  sname  VARCHAR(20),
  status INTEGER,
  city   VARCHAR(15)
);

CREATE TABLE SP (
  sno CHAR(5),
  pno CHAR(6),
  qty INTEGER,
  PRIMARY KEY (sno, pno),                -- composite key: must be a table constraint
  FOREIGN KEY (sno) REFERENCES S (sno),
  FOREIGN KEY (pno) REFERENCES P (pno)
);
```

Two more column constraints:

- **UNIQUE**: no two rows may have the same value (nulls are allowed, and don't clash with each other).
- **CHECK (condition)**: every row must satisfy the condition, e.g. `CHECK (ATTR1 > 0)`. A row for which it's false is refused.

A primary key is **UNIQUE and NOT NULL by definition**, so there's no need to add either to it. A constraint can be given a name, `CONSTRAINT pk1 PRIMARY KEY (a)`, which is how you refer to it later (to drop it, or in an error message).

### Copying a table: CREATE TABLE … AS

```sql
CREATE TABLE DEPARTMENT2 AS SELECT * FROM DEPARTMENT;              -- columns and rows
CREATE TABLE DEPARTMENT2 AS SELECT * FROM DEPARTMENT WHERE 1 = 2;  -- columns only
```

The new table gets the query's columns and types, and its rows. **Keys and other constraints aren't copied** (NOT NULL isn't either). `WHERE 1 = 2` is a condition that's never true, so the copy has the structure and no rows: a quick way to make an empty table shaped like another, such as a log or history table.

## DROP TABLE

`DROP TABLE DEPARTMENT;` removes the table, its rows and its definition. `DROP TABLE IF EXISTS DEPARTMENT;` does nothing (instead of failing) if there's no such table.

If another table's **foreign key refers to it**, the drop fails: with SP's foreign key on S, `DROP TABLE S` is refused, because SP's rows would be left pointing at nothing.

- `DROP TABLE S RESTRICT;` is the default: refuse if anything depends on S.
- `DROP TABLE S CASCADE;` drops S **and the dependent constraint**, here SP's foreign key. SP itself and its rows stay. Use it carefully.

There's no recycle bin in Postgres: once a DROP is committed, only a backup brings the table back. (Oracle has one: a normal DROP may go to its Recycle Bin and come back with `FLASHBACK TABLE … TO BEFORE DROP`, unless dropped with `PURGE`.) In Postgres, a DROP inside a transaction that hasn't been committed can still be undone with ROLLBACK.

## ALTER TABLE

```sql
ALTER TABLE Test ADD b INTEGER;                 -- add a column
ALTER TABLE Test ADD c VARCHAR, ADD d TEXT;     -- several changes at once
ALTER TABLE Test ALTER b TYPE TEXT;             -- change a column's type
ALTER TABLE Test DROP d;                        -- remove a column
ALTER TABLE Test ADD CONSTRAINT pk1 PRIMARY KEY (a);
ALTER TABLE Took ADD CONSTRAINT fk_stu FOREIGN KEY (sid) REFERENCES Student (sid);
ALTER TABLE demo ADD CONSTRAINT ch1 CHECK (dnumber > 0 AND dnumber < 21);
```

A newly added column is **null in every existing row**, so it can't be declared NOT NULL when the table already has rows (unless it's also given a DEFAULT). Adding a constraint checks the existing rows: a primary key on a column with duplicates, or a CHECK that some row fails, is refused.

**When ALTER TABLE is required.** EMP(empid, fname, lname, salary, dno, superid) and DEPT(dno, dname, mgrid): every employee's dno refers to DEPT, and every department's mgrid refers to EMP. Whichever table you create first, the other doesn't exist yet, so its foreign key can't be declared. Create both without the cross-reference, then add it:

```sql
CREATE TABLE EMP  (empid INT PRIMARY KEY, fname VARCHAR(15), lname VARCHAR(15),
                   salary INT, dno INT, superid INT REFERENCES EMP (empid));
CREATE TABLE DEPT (dno INT PRIMARY KEY, dname VARCHAR(15), mgrid INT REFERENCES EMP (empid));
ALTER TABLE EMP ADD CONSTRAINT fk_dept FOREIGN KEY (dno) REFERENCES DEPT (dno);
```

(EMP's superid can reference EMP in its own CREATE TABLE: a table can refer to itself.)

## TRUNCATE

`TRUNCATE TABLE Course;` removes **all** rows and keeps the table's definition. There's no WHERE clause; use DELETE to choose rows. Postgres doesn't scan the rows one by one, so on a large table it's usually much faster than `DELETE FROM Course;`.

- `TRUNCATE TABLE Course RESTART IDENTITY;` also resets the table's auto-numbering (identity/serial) sequences.
- If another table's foreign key refers to it, TRUNCATE is refused unless that table is truncated too (list both) or you add CASCADE.

## Transactions: COMMIT and ROLLBACK

A **transaction** is a sequence of one or more changes that aren't yet permanent. **COMMIT** makes them permanent; **ROLLBACK** undoes all of them. The DBMS keeps **undo** and **redo** logs to make both possible.

```sql
BEGIN;
TRUNCATE TABLE Course;
SELECT COUNT(*) FROM Course;   -- 0
ROLLBACK;                      -- the rows are back
```

In **Postgres**, DDL is transactional: TRUNCATE, DROP TABLE and ALTER TABLE inside an uncommitted transaction can all be rolled back. In **Oracle**, TRUNCATE is DDL that commits immediately: it can't be rolled back, and not even FLASHBACK TABLE recovers the rows. The lesson: don't assume two DBMSs behave the same.

| | DELETE | TRUNCATE | DROP TABLE |
|---|---|---|---|
| Removes | selected or all rows | all rows | the table and all its rows |
| Table remains? | yes | yes | no |
| WHERE allowed? | yes | no | no |
| Rollback in Postgres? | yes, in a transaction | yes, in a transaction | yes, before commit |
| Think of it as | delete rows | empty the table | remove the table |

(Oracle: DELETE can be rolled back, TRUNCATE can't, and a dropped table may be recoverable from the Recycle Bin.)

**Before running destructive SQL:** check which database and schema you're connected to; try RESTRICT before CASCADE; use DELETE when you need a WHERE; wrap a risky DROP or TRUNCATE in BEGIN … check … COMMIT; and remember that after a commit, a backup is the only way back.

## User-defined functions

Postgres functions are usually written in **PL/pgSQL**:

```sql
CREATE OR REPLACE FUNCTION find_max_qty(s_no CHAR(5))
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  m INTEGER;                             -- variable declarations
BEGIN
  SELECT MAX(qty) INTO m FROM SP WHERE sno = s_no;
  RETURN m;
END;
$$;

SELECT find_max_qty('S1');
```

The body between `$$` and `$$` is a block: optional DECLARE (local variables), then BEGIN … END. `SELECT … INTO variable` stores a query's result in a variable, and RETURN gives the function's value. `RAISE NOTICE 'text %', value;` prints a message (each `%` is replaced by the next value).

## Triggers

A **trigger** is an action the DBMS runs **automatically** when a specified event happens on a table (or view). Nobody calls it: it's attached to the table. Typical uses are auditing (log every change to S), maintaining history or summary data, and business rules the built-in constraints can't express.

Prefer a built-in constraint when one fits: NOT NULL for a required value, CHECK for a simple rule on a row, and a foreign key with ON DELETE CASCADE for deleting dependent rows.

A trigger has three parts, **event, condition, action**:

- **Event**: INSERT, UPDATE or DELETE (Postgres also allows TRUNCATE).
- **Condition**: optional; in Postgres, a WHEN clause.
- **Action**: in Postgres, a call to a **trigger function**.

**Timing.** BEFORE fires before the row operation completes, and can check or change the new row. AFTER fires once the operation has succeeded, the usual choice for logging. INSTEAD OF is for views.

**Granularity.** FOR EACH ROW fires once for every affected row: a DELETE that removes 5 rows fires it 5 times. FOR EACH STATEMENT fires once per statement, however many rows it affects (even none).

In a row-level trigger function, two special variables hold the row:

| Event | NEW | OLD |
|---|---|---|
| INSERT | the row being inserted | (none) |
| UPDATE | the row after the change | the row before it |
| DELETE | (none) | the row being deleted |

### Creating one in Postgres: two steps

1. **Create the trigger function.** It takes no parameters and `RETURNS TRIGGER`.

```sql
CREATE OR REPLACE FUNCTION log_supplier()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO log_transaction VALUES (NEW.sno, CURRENT_DATE);
  RETURN NEW;
END;
$$;
```

2. **Create the trigger**, connecting an event on a table to the function.

```sql
CREATE TRIGGER log_supplier_insert
AFTER INSERT ON S
FOR EACH ROW
EXECUTE FUNCTION log_supplier();

INSERT INTO S VALUES ('S7', 'PATEL', 20, 'GUELPH');   -- a log row appears automatically
```

What the function returns matters for a **BEFORE** row trigger: returning NEW lets the operation go ahead (with any changes made to NEW), and returning NULL silently skips that row. For an **AFTER** trigger the return value is ignored, so `RETURN NEW;`, `RETURN OLD;` and `RETURN NULL;` all work; in a DELETE trigger, NEW is null.

In psql, `\sf log_supplier` shows a function's definition. `DROP TRIGGER log_supplier_insert ON S;` removes the trigger, but **not the function**, which needs its own `DROP FUNCTION log_supplier();`.

## Common mistakes

- Declaring a composite primary key as two column-level PRIMARY KEYs. A table has one primary key; a composite one is a table constraint, `PRIMARY KEY (sno, pno)`.
- Expecting CREATE TABLE … AS to copy the primary and foreign keys. It copies columns, types and rows only.
- Adding a NOT NULL column to a table that already has rows.
- Thinking DROP … CASCADE drops the referencing tables. It drops the dependent **constraints**; the other tables stay.
- Using TRUNCATE when only some rows should go. It has no WHERE.
- Assuming TRUNCATE can't be rolled back. That's Oracle; in Postgres it can, inside a transaction.
- Expecting a FOR EACH STATEMENT trigger to run once per row, or using NEW in a DELETE trigger.
- Dropping a trigger and assuming its function is gone too.
