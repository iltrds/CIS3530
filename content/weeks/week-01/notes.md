## Databases and the DBMS

A **database** is a collection of related data about some **mini-world**, the slice of reality it describes (a university's grades, a company's suppliers). **Data** are recorded facts with an implicit meaning. A **DBMS** is the software that lets you define, create and maintain a database and controls access to it; this course uses **PostgreSQL**. The DBMS plus the data (and sometimes the applications) is a **database system**.

Every DBMS is built on a **data model**: a notation describing the *structure* of data, the *constraints* on it, and the *operations* on it. Network and hierarchical models are historic; this course uses the **relational model**. Semistructured models come up later.

## Relations are sets

Mathematically, given domains dom(A₁), …, dom(Aₙ), a relation is any **subset of their Cartesian product**. With A₁ = {2, 4} and A₂ = {1, 3, 5}, A₁ × A₂ has 6 ordered pairs, and {(2, 1), (4, 1)} is one relation on them. A set of tuples is only a relation on A₁, A₂, A₃ if every tuple has exactly three values, drawn from those domains in that order.

## Vocabulary

| Informal | Formal |
|---|---|
| table | relation |
| row | **tuple** |
| column | **attribute** |
| type of a column | **domain** |
| number of columns | **degree** (arity) |
| number of rows | **cardinality** |

A **schema** is the structure, written `S(sno, sname, status, city)`; an **instance** is the data at one moment. Instances change constantly, schemas rarely. A database schema is a set of relation schemas; a database instance is a set of relation instances.

## Properties of a relation

1. Its name is distinct from every other relation in the schema.
2. Each cell holds exactly one **atomic** value.
3. Each attribute has a distinct name (no duplicate column names).
4. All values of an attribute come from the same domain.
5. There are no duplicate tuples.
6. The order of tuples doesn't matter.
7. The order of attributes doesn't matter.

Because a relation is a *set*, duplicates are impossible in theory. Commercial DBMSs actually use **bags** (duplicates allowed); that matters in SQL (Week 3).

## Keys

- **Superkey**: a set of attributes whose combined values are unique in every tuple. Every relation has one: all of its attributes together. Adding attributes to a superkey gives another superkey.
- **Candidate key**: a *minimal* superkey. Two properties: **uniqueness** and **irreducibility** (no proper subset is unique).
- **Primary key**: the candidate key chosen to identify tuples. Shown **underlined**.
- **Alternate key**: a candidate key that wasn't chosen.
- **Surrogate key**: a system-generated key with no business meaning (an auto-increment id).
- **Composite key**: a key made of several attributes. `course(courseCode, dno)` has **one** primary key made of two attributes, not two primary keys.
- **Foreign key**: attributes FK in R₁ that reference the primary key of R₂: same domain, and every FK value either appears as a PK value in R₂ or is **null**. Drawn as an arrow from the referencing (child) relation to the referenced (parent) one.

## Integrity constraints

| Constraint | Rule | Typical violation |
|---|---|---|
| Domain | Every value is an atomic value from its attribute's domain | `status = 'high'` in an integer column |
| Entity integrity | No primary key attribute may be null | Inserting a course with a null courseCode |
| Referential integrity | An FK value matches an existing PK value, or is null | Inserting a course with dno 64 when no dept 64 exists; deleting a dept that courses still reference |

A duplicate primary key value also breaks the key (uniqueness) constraint; on quizzes both duplicates and nulls count as a **primary key violation**. A foreign key *can* be null, unless it is also part of its own relation's primary key or is declared NOT NULL.
