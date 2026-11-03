## Where normalization fits

ER modelling designs a database from the requirements. **Normalization** is the other half of design: a technique, introduced by E. F. Codd, for checking a set of relations and reshaping them so that each fact is stored **once**. You need it when there's no ER model to start from (an existing spreadsheet or legacy table), to clean up redundancy in a design, to make the data harder to corrupt, and to spot missing tables, columns and constraints. In practice the two are used together: draw the ER model, map it, then normalize what comes out.

Relations are sorted into **normal forms**: 1NF, 2NF, 3NF, BCNF, 4NF and 5NF. Each one adds conditions to the one before, so a relation in a higher form is also in every lower form, and less exposed to update anomalies. This week covers 1NF to BCNF; 4NF and 5NF may follow in Week 8. Occasionally a design is deliberately **denormalized** (facts stored twice) to make frequent queries faster.

## Redundancy causes update anomalies

The lecture's example is one relation for suppliers, the parts they ship, and where they are:

FIRST(<u>S#</u>, STATUS, CITY, <u>P#</u>, QTY), where each supplier is in one city and **each city has one status**.

| S# | STATUS | CITY | P# | QTY |
|---|---|---|---|---|
| S1 | 20 | London | P1 | 300 |
| S1 | 20 | London | P2 | 200 |
| … | | | | |
| S3 | 50 | Guelph | P2 | 200 |
| S4 | 20 | London | P2 | 200 |

S1's city is written six times (once per part), and London's status once per London shipment. That redundancy causes three **update anomalies**:

| Anomaly | Meaning | In FIRST |
|---|---|---|
| **Insertion** | a fact can't be recorded on its own, without also inventing an unrelated fact | a new supplier S6 in Guelph can't be added until S6 ships a part: P# is part of the key and can't be null |
| **Modification** (update) | one fact is stored in several places, so a change has to be made in all of them, or the data contradicts itself | moving S1 to Guelph means changing six rows; miss one and S1 is in two cities |
| **Deletion** | deleting one fact deletes another one by accident | deleting S3's only shipment also deletes the fact that Guelph's status is 50 |

Normalization removes the anomalies by **decomposing** the relation into smaller ones (projections), guided by its constraints.

## First normal form (1NF)

A relation is in **1NF** when every value is **atomic**: no cell holds a list or a group of values, and there are no **repeating groups**. (By definition, a table with repeating groups isn't really a relation.) A 1NF relation also has its key attributes defined, and every attribute depends on the key.

A table that lists S1 once and then six parts in the rows below it, with S#, STATUS and CITY blank, has a repeating group. It also breaks queries: asking for the city of suppliers who ship P2 finds the P2 rows, whose CITY is empty. To reach 1NF, **flatten** the table: fill in the blanks so that every row is complete. That gives FIRST.

FIRST **is** in 1NF and still has every anomaly above. 1NF is only the start.

## Functional dependencies

Normalization is driven by **functional dependencies** (FDs). For attribute sets X and Y of a relation R:

> **Y is functionally dependent on X** (written **X → Y**, "X determines Y") if any two tuples that agree on X also agree on Y. Each X value goes with exactly one Y value.

X is the **determinant** and Y the **dependant**. The FDs of FIRST:

- (S#, P#) → QTY, (S#, P#) → CITY, (S#, P#) → STATUS
- S# → CITY, S# → STATUS
- CITY → STATUS

Instead of listing them you can draw an **FD diagram**: each attribute once, with an arrow from each determinant to its dependants (for a composite determinant, the arrow starts from a box around its attributes).

Things to know about FDs:

- X needn't be a key, and X and Y can both be composite.
- Two attributes can determine each other (husband → wife and wife → husband).
- The same Y value can appear many times (many suppliers are in London); what's forbidden is one X value with two Y values.
- An FD is **trivial** if it can't fail, because Y is part of X: (CITY, STATUS) → STATUS. Normalization cares only about **non-trivial** FDs that hold **at all times**.
- FDs come from the **rules** of the enterprise, which is how CIS3530 finds them. An instance can show that an FD does **not** hold (two rows agreeing on X but not on Y), but it can't prove one does: the next row might break it.

### Closures and keys

The **closure** X⁺ of X is every attribute that X determines, directly or through a chain: start with X, and keep adding the right side of any FD whose left side you already have. In FIRST, S#⁺ = {S#, CITY, STATUS}: S# gives CITY, and CITY gives STATUS.

- X is a **superkey** if X⁺ is every attribute.
- A **candidate key** is a minimal superkey: no smaller part of it is a superkey. (S#, P#) is FIRST's only one.
- The **primary key** is the candidate key chosen. In this course's definitions, a **non-prime-key attribute** is one that isn't part of the primary key.

### Full, partial and transitive dependencies

- Y is **fully** functionally dependent on X if X → Y and no proper part of X determines Y. (S#, P#) → QTY is full.
- Otherwise it's **partial** (non-full): (S#, P#) → CITY is partial, because S# alone determines CITY.
- Z is **transitively** dependent on X when X → Y and Y → Z (so X → Z, but only through Y). In FIRST, S# → CITY and CITY → STATUS, so STATUS is transitively dependent on S#.

## Second normal form (2NF)

> A relation is in **2NF** if it's in 1NF and every non-prime-key attribute is **fully** dependent on the primary key.

FIRST isn't: CITY and STATUS depend on S#, only part of the key. Fix it by moving the partially dependent attributes into their own relation, keyed on the part of the key they depend on:

- SP(<u>S#, P#</u>, QTY): QTY depends on the whole key
- SECOND(<u>S#</u>, CITY, STATUS)

Both are in 2NF (a relation with a single-attribute key is in 2NF automatically, since it has no smaller part to depend on).

## Decomposing without losing information

Splitting a relation is only useful if it's a **non-loss** (lossless) decomposition:

1. joining the parts back together gives **exactly** the original relation, no more and no fewer rows, and
2. the parts can be maintained independently, because every FD can still be enforced.

A **lossy** decomposition produces extra, **spurious** tuples when rejoined. U(A, B, C) holding (5, 10, 6) and (7, 10, 4), split into (A, B) and (B, C), rejoins to four rows, including (5, 10, 4), which was never true. Split into (A, B) and (A, C), it rejoins to the original two.

You can't test every instance, so use **Rissanen's rules**. Decomposing R into R1 and R2 is good if:

1. the attributes R1 and R2 have **in common form a candidate key of at least one of them**, and
2. **every FD of R can be derived** from the FDs that hold within R1 and within R2 (dependency preservation).

FIRST into SP and SECOND: the common attribute S# is the key of SECOND (rule 1), and every FD is either inside SP or inside SECOND (rule 2). Good.

## Third normal form (3NF)

SECOND is in 2NF but still has anomalies: Paris's status can't be recorded until some supplier is in Paris, and deleting S3 loses Guelph's status. The cause is the transitive dependency S# → CITY → STATUS.

> A relation is in **3NF** if it's in 2NF and **no non-prime-key attribute is transitively dependent** on the primary key.

Move the dependency CITY → STATUS into its own relation:

- SC(<u>S#</u>, CITY)
- CS(<u>CITY</u>, STATUS)

The lecture asks you to try the alternatives too:

| Decomposition of SECOND | Common attribute | Verdict |
|---|---|---|
| SC(S#, CITY) + CS(CITY, STATUS) | CITY, the key of CS | good: lossless, and every FD is kept |
| (S#, STATUS) + (S#, CITY) | S#, a key of both | lossless, but **CITY → STATUS is lost**: nothing stops two London suppliers having different statuses |
| (S#, STATUS) + (CITY, STATUS) | STATUS, a key of neither | **lossy**: rejoining pairs suppliers with every city of the same status |

A summary to remember the three forms: every non-key attribute depends on **the key** (1NF), **the whole key** (2NF), and **nothing but the key** (3NF), "so help me Codd".

## Boyce–Codd normal form (BCNF)

3NF still lets anomalies through when a relation has **several candidate keys that are composite and overlap**. The lecture's example:

TEACH(Student, Course, Instructor)
- for each course, a student is taught by one instructor: (Student, Course) → Instructor
- each instructor teaches only one course: Instructor → Course
- candidate keys: (Student, Course) and (Student, Instructor)

With (Student, Course) as the primary key, the only non-prime-key attribute is Instructor. It's fully dependent on the key and nothing intermediate determines it, so TEACH is in **3NF**. Yet the fact "Instructor X teaches course Y" is repeated for every student X teaches, and can't be stored until X has a student.

(With (Student, Instructor) as the primary key instead, Course is the non-prime-key attribute, and it depends on Instructor, part of the key: then TEACH isn't even in 2NF under this course's definitions. Same table, same problem; the choice of key only changes which form names it.)

> A relation is in **BCNF** if **every determinant is a candidate key**.

Instructor is a determinant (Instructor → Course) but not a candidate key, so TEACH isn't in BCNF. Decompose on that dependency:

- SI(<u>Student, Instructor</u>)
- IC(<u>Instructor</u>, Course)

That's lossless (Instructor is the key of IC), and both parts are in BCNF. But (Student, Course) → Instructor spans both relations, so it **can't be enforced** any more: nothing stops a student being given two instructors for the same course. BCNF sometimes costs a dependency; 3NF never has to.

## A procedure for normalization questions

1. **Find the FDs** from the rules (list them or draw the FD diagram).
2. **Find the key(s)**: which attributes determine everything?
3. **Check each form in turn**: atomic values (1NF), no partial dependency on the primary key (2NF), no transitive dependency (3NF), every determinant a candidate key (BCNF).
4. **Decompose** on the offending FD: its determinant and dependants become a new relation keyed on the determinant; the determinant stays behind in the original.
5. **Check the decomposition** with Rissanen's rules.

## The ER model, continued: existence dependency revisited

The Week 7 lecture finished the ER model with a recap (the University Staff design, now with participation constraints) and one new way of seeing existence dependency in the relational model:

- **Existence dependency** is total participation: an entity can't exist without the related entity.
- In relations: if an entity's **foreign key can't be null** (it's mandatory, NOT NULL), the entity is **existence-dependent** on the entity it references.
- If the foreign key **can be null**, the entity is **existence-independent** of it.

So in SECTION(<u>CLASS_CODE</u>, CRS_CODE, …) with CRS_CODE NOT NULL, SECTION is existence-dependent on COURSE, but it isn't weak: its key, CLASS_CODE, doesn't contain COURSE's key. In the mapped University Staff design, EMPLOYEE.dnumber is NOT NULL (every employee works for a department), while EMPLOYEE.s_sin allows nulls (someone has no supervisor).

The lecture's general approach to ER design, from requirements: identify the entity and relationship sets and their cardinalities first, then add attributes, then identify keys or discriminators.

## Common mistakes

- Deciding an FD holds because the sample rows happen to fit it. FDs come from the rules; an instance can only disprove one.
- Calling FIRST "not 1NF" because it's redundant. Redundancy is a 2NF/3NF problem; 1NF is only about atomic values.
- Mixing up partial and transitive: partial means part of the **key** determines the attribute; transitive means a **non-key** attribute does.
- Forgetting that a relation with a one-attribute primary key can't have a partial dependency.
- Decomposing so that the common attributes aren't a key of either part (lossy), or so that an FD ends up split across relations (not dependency-preserving).
- Assuming 3NF means no anomalies: overlapping composite candidate keys still need BCNF.
