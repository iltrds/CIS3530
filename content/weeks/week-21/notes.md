## The schema

Four tables, from `create_LE1.sql` and `insert_LE1.sql`:

| Table | Columns (key underlined) | Foreign keys |
|---|---|---|
| manuSupp (suppliers) | <u>manuSupitemNo</u> VARCHAR(3), SNAME VARCHAR(10), STATUS INTEGER, CITY VARCHAR(10) | |
| items | <u>itemNo</u> VARCHAR(3), INAME VARCHAR(10), COLOR VARCHAR(5), WEIGHT NUMERIC(5,2), CITY VARCHAR(10) | |
| proj (projects) | <u>proJNo</u> VARCHAR(3), proJNAME VARCHAR(10), CITY VARCHAR(10) | |
| combine | <u>manuSupitemNo, itemNo, projNo</u>, QTY INTEGER | manuSupitemNo → manuSupp, itemNo → items, projNo → proj |

It's the classic supplier–parts–projects database: **combine** says supplier *s* supplies item *i* to project *j* in quantity *q*. 5 suppliers (M1–M5), 6 items (I1–I6), 7 projects (J1–J7), 24 combine rows. The **Datasets** tab shows every row and the key diagram.

Things that will matter in the exam:

- **Names are folded to lower case.** The script doesn't quote names, so `manuSupp` is really `manusupp` and `proJNo` is `projno`. You can type them either way; results show them in lower case.
- **The supplier number column is called `manuSupitemNo`**, in both manuSupp and combine (an odd name for a supplier number; don't confuse it with `itemNo`). Joining manuSupp and combine with NATURAL JOIN works because they share only that column. Joining **items** with **manuSupp** or **proj** by NATURAL JOIN matches on **CITY** too.
- **Values are uppercase**: `'LONDON'`, `'RED'`, `'SCREW'`.
- **Lengths are enforced**: supplier, item and project numbers are VARCHAR(3), COLOR VARCHAR(5), WEIGHT NUMERIC(5,2) (at most 999.99). `'M10'` fits; `'M100'` doesn't.
- **Every supplier, item and project appears in combine** in this instance. Questions like "suppliers who supply nothing" return no rows here, but your query should still be written to find them. The practice questions are also checked against a second, hidden set of rows that does have such suppliers.

## Running the scripts more than once

`create_LE1.sql` drops `manuSupp` **before** `combine`. On an empty database that's fine, but the **second** time you run it, Postgres refuses:

```
ERROR:  cannot drop table manusupp because other objects depend on it
```

because combine's foreign key still refers to manuSupp. Either drop combine first, or drop the referenced tables with CASCADE:

```sql
DROP TABLE IF EXISTS combine;          -- the referencing table first…
DROP TABLE IF EXISTS manuSupp;         -- …then the ones it refers to
-- or: DROP TABLE IF EXISTS manuSupp CASCADE;  (drops combine's foreign key, not combine)
```

## Using the sandbox

**Open the SQL sandbox** runs real PostgreSQL in your browser with these tables loaded. INSERT, UPDATE, DELETE and even CREATE TABLE stick until you press **Reset this dataset**, so you can rehearse a whole sequence of exam steps. Wrap risky statements in `BEGIN; … ROLLBACK;` to try them without keeping the change.

Practice questions are marked by running your SQL against the original rows **and** a hidden second set, and comparing results. A query that hard-codes `'M5'` or relies on these exact rows will be marked wrong.

## Patterns to have ready

| Task | Pattern |
|---|---|
| names of suppliers who supply X | join manuSupp and combine (or `WHERE manuSupitemNo IN (SELECT … FROM combine WHERE …)`), with DISTINCT |
| per supplier / item / project totals | `GROUP BY` the key, `SUM(qty)`, `COUNT(DISTINCT …)` |
| only groups that… | `HAVING` after `GROUP BY` |
| the largest / smallest | compare with a subquery: `= (SELECT MAX(…) …)` or `>= ALL (…)` |
| none / never | `NOT EXISTS`, `NOT IN` or `LEFT JOIN … IS NULL` |
| every / all | division: `NOT EXISTS (… EXCEPT …)` or `GROUP BY … HAVING COUNT(DISTINCT x) = (SELECT COUNT(*) …)` |
| change data | `INSERT`, `UPDATE … SET … WHERE`, `DELETE … WHERE` (check the foreign keys first) |
