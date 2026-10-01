## What relational algebra is

A formal query language for the relational model. The **operands are relations** and **every result is a relation**, so operators can be nested like arithmetic. The course treats relations as **sets**: every result has its duplicates removed.

The running schema is `Movies(mID, title, director, year, length)`, `Artists(aID, aName, nationality)`, `Roles(mID, aID, character)`, where Roles.mID references Movies and Roles.aID references Artists.

## The operators

| Operator | Notation | Result | Degree | Cardinality |
|---|---|---|---|---|
| Select | σ<sub>c</sub>(R) | rows of R satisfying c | = deg R | ≤ \|R\| |
| Project | π<sub>L</sub>(R) | only the attributes in L, **duplicates removed** | = \|L\| | ≤ \|R\| |
| Product | R × S | every tuple of R joined to every tuple of S | deg R + deg S | \|R\| · \|S\| |
| Natural join | R ⋈ S | × then select equal values on same-named attributes, then drop the duplicate columns | deg R + deg S − #common | 0 … \|R\|·\|S\| |
| Theta join | R ⋈<sub>c</sub> S | σ<sub>c</sub>(R × S) (keeps both copies of columns) | deg R + deg S | 0 … \|R\|·\|S\| |
| Outer joins | ⟕ ⟖ ⟗ | natural join, plus unmatched tuples padded with null (left, right or both) | as ⋈ | ≥ \|R ⋈ S\| |
| Union | R ∪ S | tuples in either | deg R | ≤ \|R\| + \|S\| |
| Intersection | R ∩ S | tuples in both | deg R | ≤ min |
| Difference | R − S | tuples in R but not S | deg R | ≤ \|R\| |
| Division | R ÷ S | values of R's other attributes that appear with **every** tuple of S | deg R − deg S | ≤ \|π(R)\| |
| Rename | ρ<sub>N</sub>(R) | same tuples, new relation (or attribute) names | = deg R | = \|R\| |

**Equi join** is a theta join whose condition only uses `=`.

## Natural join details

- Matches on attributes with the **same name**. With no common attributes, R ⋈ S = R × S.
- Commutative and associative, so R₁ ⋈ R₂ ⋈ … ⋈ Rₙ needs no brackets.
- It can **over-match**: if Artists and Movies both had a `name` column, ⋈ would demand actor name = movie name. Fix with ρ or use × with an explicit σ.

## Composing expressions

Precedence, highest first: **σ, π** → **×, ⋈** → **∩** → **∪, −**. Use brackets unless you're sure.

**Assignment** `R := expression` (or `R(A₁, …, Aₙ) := …` to name the attributes) stores an intermediate result in a temporary relation. It never changes a relation in the schema. **ρ** renames inside an expression: `ρ M1 (Movies)`.

A **self join** (comparing a relation with itself, e.g. pairs of artists with the same nationality) needs ρ so the two copies can be told apart, then × and σ.

## Set operators

R ∪ S, R ∩ S and R − S need **union-compatible** relations: same degree, and the domain of the i-th attribute matches on both sides. Project first to make them compatible. Results are sets (duplicates removed).

## Division

R ÷ S needs every attribute of S to be an attribute of R. The result has R's other attributes, and keeps a value only if it appears in R **with every tuple of S**. Words like **"every"** and **"all"** are the cue.

`π aName ((π mID, aID (Roles) ÷ π mID (Movies)) ⋈ Artists)` finds actors who play a role in every movie.

## Approaching a problem

1. Decide which relations you need.
2. If an instance is given, work out the answer by hand first; it shows which operators you need.
3. Build intermediate relations with assignment and draw them with real data.
4. Every time you combine relations, check which attributes will be matched by name.
5. Natural join is usually enough; a self join needs ρ and ×; "every" means ÷.

Relational calculus (declarative, based on first-order logic, same expressive power) is mentioned but **not examined** this term.
