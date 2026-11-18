## The schema

Three tables, from `create_and_insert_LE2.sql`:

| Table | Columns |
|---|---|
| Movie | mID int, title text, year int, director text |
| Reviewer | rID int, name text |
| Rating | rID int, mID int, stars int, ratingDate date |

A **Rating** row says reviewer *rID* gave movie *mID* some stars on some date. 8 movies, 8 reviewers, 20 ratings. The **Datasets** tab shows every row.

Things that will matter in the exam:

- **There are no keys at all.** The script declares no PRIMARY KEY and no FOREIGN KEY. Nothing stops a duplicate movie, a rating for a movie that doesn't exist, or a second rating of the same movie by the same reviewer. Sarah Martinez rates Gone with the Wind twice, and Michael Walsh rates Raiders of the Lost Ark twice.
- Because of that, **you can't add a foreign key from Rating to Movie** until Movie.mID has a primary key (or UNIQUE constraint), and **(rID, mID) can't be Rating's primary key**: it has duplicates.
- **Nulls:** Snow White has no director, and two ratings have no date. `director = NULL` never matches; use `IS NULL`. Aggregates skip nulls.
- Every movie and every reviewer has at least one rating in this instance, so "movies nobody rated" returns no rows here, but write the query to find them anyway. Practice questions are also checked against a hidden second set of rows that has such movies and reviewers.
- **Averages**: `AVG(stars)` returns many decimal places. The questions ask for `ROUND(…, 2)` where it matters.

## Running the script more than once

This script drops and recreates the tables at the top, and with no foreign keys there's nothing to block the drops, so it can be re-run safely.

## Using the sandbox

**Open the SQL sandbox** runs real PostgreSQL in your browser with these tables loaded. Changes stick until you press **Reset this dataset**; use `BEGIN; … ROLLBACK;` to try a change without keeping it. Practice questions are marked by running your SQL against the original rows and a hidden second set, so hard-coded IDs or answers that fit only these rows are marked wrong.

## Patterns to have ready

| Task | Pattern |
|---|---|
| reviewer names with movie titles | join all three: `Rating JOIN Reviewer USING (rID) JOIN Movie USING (mID)` |
| per movie / per reviewer | `GROUP BY` and `MAX`, `MIN`, `AVG`, `COUNT` |
| including ones with no ratings | `LEFT JOIN` from Movie or Reviewer, and `COUNT(Rating.something)`, not `COUNT(*)` |
| the same reviewer and movie twice | a self-join of Rating on rID and mID |
| none / never | `NOT IN` / `NOT EXISTS` (careful: `NOT IN` with a null in the subquery returns nothing) |
| the highest average | compare with a subquery: `>= ALL (SELECT AVG(…) … GROUP BY …)` |
