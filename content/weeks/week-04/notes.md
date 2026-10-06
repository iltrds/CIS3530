## Aggregates, recapped

`COUNT`, `SUM`, `MAX`, `MIN` and `AVG` turn a column into one value. Without GROUP BY the whole result of FROM and WHERE is one group, so the answer is a single row: on the Week 3 instance, `SELECT COUNT(sno), MAX(qty), SUM(qty) FROM SP` gives 12, 800 and 3700.

## GROUP BY

`GROUP BY sno` splits the rows into one group per sno value; each aggregate is then computed **within each group**, and the result has **one row per group**.

```sql
SELECT sno, COUNT(pno)      -- how many parts each supplier supplies
FROM SP
GROUP BY sno;
```

**The rule.** Once a query groups or aggregates, every item in SELECT must be either an aggregate or an attribute listed in GROUP BY. So these are invalid:

| Query | Problem |
|---|---|
| `SELECT sno, MAX(qty) FROM SP;` | sno isn't grouped, and there's one row but many sno values |
| `SELECT sno FROM SP WHERE qty = MAX(qty);` | aggregates can't appear in WHERE at all |

Fixes: `GROUP BY sno` for the first; a subquery, `WHERE qty = (SELECT MAX(qty) FROM SP)`, for the second.

Postgres is a little more lenient than the course rule: if you group by a table's primary key, it lets you select that table's other columns (`GROUP BY sno` then `SELECT sname`). Follow the course rule and list every non-aggregated column in GROUP BY: `GROUP BY sno, sname`.

An aggregate can be given a name, `SUM(qty) AS sq` (or just `SUM(qty) sq`), and ORDER BY can sort by it. HAVING can't use the name in Postgres; repeat the aggregate there.

## HAVING

HAVING is a condition on **groups**, checked after grouping; WHERE is a condition on **rows**, checked before. HAVING has the same restriction as SELECT: it may use aggregates and grouping attributes.

```sql
SELECT sno, SUM(qty) AS sq
FROM SP
GROUP BY sno
HAVING SUM(qty) > 1000;     -- only S5 (2000)
```

## The six clauses

Written in this order; only SELECT and FROM are required:

```
SELECT    <attribute list>
FROM      <table list>
WHERE     <row condition>
GROUP BY  <grouping attributes>
HAVING    <group condition>
ORDER BY  <attribute list>
```

Logically they run as FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY.

## Correlated subqueries: EXISTS and NOT EXISTS

A subquery that refers to a table from the outer query is **correlated**: it's evaluated again for each outer row. `EXISTS (subquery)` is true when the subquery returns at least one row; `NOT EXISTS` when it returns none. What the subquery selects doesn't matter, so `SELECT *` is usual.

```sql
SELECT sname
FROM S
WHERE EXISTS (SELECT *
              FROM SP
              WHERE SP.sno = S.sno);   -- S.sno comes from the outer row
```

Without the `SP.sno = S.sno` link the subquery doesn't depend on the outer row, so it gives the same answer for every supplier: all of them or none.

## Division in SQL

SQL has no "for all". Rewrite it with two negations: "suppliers who supply **every** part" becomes "suppliers for whom there is **no** part that they do **not** supply".

```sql
SELECT sname
FROM S
WHERE NOT EXISTS (SELECT *                         -- no part …
                  FROM P
                  WHERE NOT EXISTS (SELECT *       -- … that this supplier doesn't supply
                                    FROM SP
                                    WHERE SP.sno = S.sno
                                      AND SP.pno = P.pno));
```

In general, NUM(A, B) ÷ DEN(C) is:

```sql
SELECT DISTINCT A
FROM num N1
WHERE NOT EXISTS (SELECT * FROM den
                  WHERE NOT EXISTS (SELECT * FROM num N2
                                    WHERE N2.A = N1.A
                                      AND N2.B = den.C));
```

**The COUNT method** does the same with grouping: count how many divisor values each candidate has, and keep those that have all of them.

```sql
SELECT sname
FROM S
WHERE sno IN (SELECT sno
              FROM SP
              GROUP BY sno
              HAVING COUNT(pno) = (SELECT COUNT(*) FROM P));
```

It only works if the rows being counted can't repeat (SP's key guarantees that) and only belong to the divisor. For "every red part", count only red parts: add `WHERE pno IN (SELECT pno FROM P WHERE color = 'RED')` before grouping, and compare with the number of red parts.

## Changing data

| Statement | What it does | Watch out for |
|---|---|---|
| `INSERT INTO SP VALUES ('S6', 'P2', 250);` | adds a row; values in the table's column order, `null` for a missing value | key and foreign key constraints: a duplicate (sno, pno) or an unknown supplier is rejected |
| `INSERT INTO S_COPY (SELECT * FROM S);` | adds every row a query returns | the query's columns must match the table's |
| `DELETE FROM SP WHERE qty < 200;` | removes the rows that match | **no WHERE deletes every row**; deleting a supplier who still has shipments is rejected (referential integrity) unless the foreign key says CASCADE |
| `UPDATE SP SET qty = 150 WHERE qty = 100;` | changes the matching rows | **no WHERE changes every row**; the new values must still satisfy the constraints |

Each statement changes one table.
