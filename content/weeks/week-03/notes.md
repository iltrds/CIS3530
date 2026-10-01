## Finishing relational algebra

- **Division** (÷) answers "every" questions. See Week 2.
- **Set difference** answers "not" questions: actors who do *not* work in movie 1 are all actors minus those who do: `π aID (Artists) − π aID (σ mID = 1 (Roles))`.
- **Every problem has several RA solutions**, and each one suggests a different *query execution plan*. Selecting before joining keeps intermediate relations small, so it's usually the cheaper plan.
- To solve a problem: find the relations involved, work the answer out by hand if you have an instance, build intermediate relations with assignment, and draw them with real data.

## SQL

SQL is the standard language for relational databases. It has a **DDL** (defining schemas), a **DML** (querying and changing data; this week) and a **DCL** (permissions).

### Tables are bags

Unlike RA, an SQL table or result **may contain duplicate rows**. You get set behaviour from a PRIMARY KEY or UNIQUE constraint on a table, or from **DISTINCT** in a query.

### SELECT–FROM–WHERE

```sql
SELECT sname          -- 3. which columns (like π)
FROM   S              -- 1. which tables
WHERE  city = 'LONDON'; -- 2. which rows (like σ)
```

Logically, FROM runs first, then WHERE, then SELECT. SQL's SELECT is **projection**, not RA's σ. ORDER BY sorts the final rows; the slides place it at the end, just before results are returned. (Standard SQL applies it after the SELECT list, which is why ORDER BY can use column aliases.)

String comparisons are **case-sensitive**. The Week 3 instance stores 'LONDON' and 'RED' in capitals, so `city = 'London'` finds nothing.

### FROM

| Form | Meaning |
|---|---|
| `FROM S, SP` | Cartesian product; add the join condition in WHERE |
| `FROM S NATURAL JOIN SP` | natural join on every same-named column |
| `FROM S JOIN SP USING (sno)` | join on the listed columns only |
| `FROM S JOIN SP ON S.sno = SP.sno` | join on any condition (theta join) |
| `FROM S LEFT JOIN SP ON …` | left outer join: keeps suppliers with no shipments |
| `FROM S S1, S S2` or `S AS S1` | two aliases of the same table for a self join |
| `FROM (SELECT …) AS t` | a subquery as a table (it needs a name) |

Careful with NATURAL JOIN across three tables: `S NATURAL JOIN SP NATURAL JOIN P` also matches **S.city = P.city**, because both tables have a city column.

### WHERE

- Comparisons `= <> != < <= > >=`, combined with AND, OR, NOT, and brackets.
- `LIKE 'A%'`: `%` matches any sequence of characters (including none), `_` exactly one.
- `BETWEEN 100 AND 200` is **inclusive** at both ends.
- `IN (100, 200)` tests set membership; `IN (subquery)` does the same against a query's result.
- `= NULL` is never true. Use **IS NULL** / **IS NOT NULL**.

### DISTINCT, AS, ORDER BY

`SELECT DISTINCT city FROM S` removes duplicate rows. `AS` names a column or table (the keyword is optional for tables). `ORDER BY sname` sorts ascending by default; add `DESC` for descending.

### Subqueries

A subquery in parentheses can appear in WHERE (commonly) or FROM. `WHERE sno = (SELECT sno FROM SP)` **fails** when the subquery returns more than one row; use `IN`. `NOT IN` finds rows with no match, e.g. suppliers who don't supply P2.

### Set operators

`UNION`, `INTERSECT` and `EXCEPT` combine two queries whose results are union compatible (same number of columns, compatible types, same order). They **remove duplicates**.

### Aggregates

`COUNT`, `SUM`, `MAX`, `MIN`, `AVG` turn a column into one value. `COUNT(*)` counts rows (nulls included); `COUNT(col)` counts non-null values; `COUNT(DISTINCT col)` counts different non-null values. On the Week 3 instance, `SELECT COUNT(DISTINCT sno), COUNT(*) FROM SP` gives 5 and 12.
