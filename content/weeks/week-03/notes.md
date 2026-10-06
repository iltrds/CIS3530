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

## Reading a query: degree and cardinality

Quizzes ask for the size of a query's result on a given instance. Work through it in evaluation order:

1. **FROM.** `FROM S, SP` is the Cartesian product (|S| × |SP| rows) until WHERE links the tables. A NATURAL JOIN matches on every column name the tables share, so check what they share first: S and SP share `sno`, P and SP share `pno`, but **S and P share `city`**. `S NATURAL JOIN P` pairs suppliers and parts in the same city.
2. **WHERE** keeps the rows that pass.
3. **SELECT** sets the **degree**: the number of columns listed. `SELECT *` after a comma product keeps both copies of a shared column (`S.sno` and `SP.sno`); after NATURAL JOIN or USING the shared column appears once.
4. **DISTINCT** merges identical rows. Without it, every row from step 2 stays, repeats included.
5. **ORDER BY** never changes the count. Aggregates without GROUP BY give exactly one row.

## Rewriting an IN subquery as a join

`WHERE sno IN (SELECT sno FROM SP …)` keeps each supplier **at most once**. A join produces one row **per matching shipment**, so a supplier with three matching shipments appears three times. An equivalent join query therefore needs:

- **the join condition**: `S.sno = SP.sno` with a comma product, or a NATURAL JOIN / JOIN … USING. Without it every supplier pairs with every shipment.
- **only the outer table's columns**: `SELECT *` would also return SP's columns.
- **DISTINCT**, to put back the "at most once".
- **qualified names** for shared columns in a comma product: `S.sno`, because plain `sno` is ambiguous. With NATURAL JOIN or USING, plain `sno` works (and so does `S.sno`).

Listing the columns in a different order doesn't change the relation.

**DISTINCT goes straight after SELECT** and applies to the whole row. `SELECT sno, DISTINCT city` is a syntax error. `SELECT sno, city DISTINCT` is a quieter mistake: Postgres accepts it and treats `DISTINCT` as a new *name* for the city column, so nothing is de-duplicated.
