## Where we are

Week 7 covered 1NF, 2NF and 3NF (and introduced BCNF). This week finishes **BCNF**, then goes past functional dependencies to **multivalued dependencies** and **4NF**, and ends with **denormalization**: when not to normalize. 5NF is on the list of normal forms but isn't covered in the slides.

The skills from last week that every question still relies on:

1. Given relations and/or requirements, **identify the anomalies** (insertion, deletion, modification).
2. **Identify the FDs**: on the primary key, and between other attributes.
3. Identify which are **full** dependencies on the key and which are **partial**.
4. Identify **transitive** dependencies on the key.

| Form | Condition (the course's wording) |
|---|---|
| 1NF | a primary key, and no repeating groups (atomic values) |
| 2NF | 1NF, and no partial dependencies on the key |
| 3NF | 2NF, and no transitive dependencies on the key |
| BCNF | every determinant is a candidate key |
| 4NF | BCNF, and no multivalued dependencies, or all of them are also FDs |

**Decomposition**, in one line: separate the attributes that cause the violation into a new, smaller relation. If R(A, B, C, D) has a non-trivial FD C → D that breaks a normal form, split it into R1(A, B, C) and R2(C, D). A decomposition is **good** if it's non-loss (R1 ∩ R2 is a key of R1 or R2 or both) and preserves the FDs.

## BCNF, recapped

TEACH(Student, Course, Instructor), with (Student, Course) → Instructor and Instructor → Course, has two overlapping composite candidate keys, (Student, Course) and (Student, Instructor). It's in 3NF but not BCNF, because Instructor is a determinant and not a candidate key. Splitting it into SI(Student, Instructor) and IC(Instructor, Course) reaches BCNF; it's lossless, but (Student, Course) → Instructor can no longer be enforced. See the Week 7 notes and examples for the details.

> Anomalies can remain in a 3NF relation when it has **several candidate keys** that are **composite** and **overlap**. BCNF removes every anomaly caused by **functional** dependencies.

## Multivalued dependencies

BCNF deals with FDs, but there's a second kind of dependency that also causes redundancy. Take students with their courses and their hobbies, which have nothing to do with each other:

| Student | Courses | Hobbies |
|---|---|---|
| Jin | DBMS, OS | Tennis, Cooking |
| Habib | C++, Networking, CA | Reading, Surfing |

That's not even 1NF (the cells hold sets). Flattening it to 1NF, SCH(<u>Student, Courses, Hobbies</u>), forces **every course to be paired with every hobby**, because no pairing is more correct than another: Jin gets 2 × 2 = 4 rows and Habib 3 × 2 = 6.

SCH has no non-trivial FDs (a student has many courses and many hobbies), so its key is all three attributes and it's in **BCNF**. It's still redundant: each of Jin's courses is stored once per hobby. Adding a hobby for Habib takes **three** new rows, one per course; add just one and the table now suggests the hobby depends on the course.

The cause is **two independent 1:N relationships in one relation**: Student : Courses and Student : Hobbies.

> A **multivalued dependency** between attributes A, B and C means that for each value of A there's a **set** of B values and a **set** of C values, and the two sets are **independent** of each other. It's written **A →→ B | C** ("A multidetermines B, independently of C").

SCH has Student →→ Courses | Hobbies. In terms of rows: whenever two rows share an A value, swapping their B values gives two more rows that must also be in the table. That's exactly the "every combination" pattern above.

Things to know:

- MVDs exist **because of 1NF**: an attribute can't hold a set of values, so the sets turn into combinations of rows.
- **Every FD is also an MVD**: if A → B, each A has a set of exactly one B value.
- An MVD is **trivial** when B is part of A, or when A and B together are the whole relation (then there's nothing for B to be independent of).
- The sets must be **independent**. If each teacher of a course uses their own textbook, Course, Teacher and Textbook are related, and there's no MVD; the redundancy test is whether every pairing has to be present.

The lecture's three relations:

| Relation | Non-trivial MVD? | Why |
|---|---|---|
| PERSON(SIN, PhoneNos, KidsSIN) | yes: SIN →→ PhoneNos \| KidsSIN | a person's phone numbers and children are independent sets |
| FACULTY(UtorId, coursesTeach, dependentSIN) | yes: UtorId →→ coursesTeach \| dependentSIN | the courses someone teaches have nothing to do with their dependants |
| STUINFO(StudentNo, Height, ShoeSize) | its only MVDs are **FDs** | a student has one height and one shoe size, so StudentNo → Height, ShoeSize |

## Fourth normal form (4NF)

> A relation is in **4NF** if it's in BCNF and it has **no MVDs, or all its MVDs are also FDs** (equivalently: the left side of every non-trivial MVD is a superkey).

- SCH is in BCNF but **not 4NF**: Student →→ Courses isn't an FD.
- STUINFO **is** in 4NF: its MVDs are the FDs StudentNo → Height and StudentNo → ShoeSize, on its key.

Decompose the same way as for the other forms, putting each independent set in its own relation:

- SC(<u>Student, Courses</u>)
- SH(<u>Student, Hobbies</u>)

That's lossless: because Student →→ Courses | Hobbies, joining SC and SH on Student rebuilds every combination, which is exactly SCH. Habib's new hobby is now one row in SH.

**Relations mapped from an ER model usually need no transformation to 4NF.** A set of values for one entity is a multivalued attribute, and mapping step 6 already gives each one its own relation (DEP_LOCATION, MEMBER_PHONE). Two independent sets never end up in the same table.

**5NF** is listed after 4NF; it deals with dependencies that need a decomposition into three or more relations. The slides don't cover it.

## Denormalization

Normalization puts **one fact in one place**. That makes **updates** fast and safe (change the fact once), at the expense of **retrievals**: reading related facts means visiting several relations and **joining** them, and if the relations are stored as separate files, joins can be slow.

> **Denormalization** is deliberately adding redundant data, or grouping data, to make retrieval faster: moving from a higher normal form to a lower one.

The lecture's example:

CONTACT(<u>Name</u>, Street, Zip, City, Province)

| Name | Street | Zip | City | Province |
|---|---|---|---|---|
| John | 401 Sunset Av. | N91 Q23 | Windsor | ON |
| Harry | 402 Sunset Av. | N4T 3R5 | Windsor | ON |
| Bill | 123 First St. | N4Y 7Y8 | London | ON |

- The primary key is **Name**.
- A postal code determines its city and province: Zip → City, Province. Since Name → Zip, City and Province are **transitively** dependent on Name, so CONTACT is in **2NF but not 3NF**.
- The 3NF decomposition is CONTACT(<u>Name</u>, Street, Zip) and ZIP(<u>Zip</u>, City, Province).

**Is it worth it?** Weigh what the anomalies would cost against what the join costs:

- An address is almost always read whole, so every lookup would need a join.
- A postal code's city and province essentially never change, so the modification anomaly hardly ever happens.
- The redundancy is small: a city and a province per contact.

That's the typical case for keeping a table denormalized (here, in 2NF). Normalization is one design goal among several, not a rule to apply blindly.

## Common mistakes

- Thinking BCNF is the end: an all-key relation like SCH is in BCNF and can still be redundant.
- Calling any two multi-valued attributes an MVD. They have to be **independent** sets for the same determinant.
- Forgetting that an FD is also an MVD, which is why STUINFO is in 4NF.
- Decomposing SCH into SC and SH and thinking it's lossy because Student isn't a key of either: the MVD is what makes the join correct.
- Treating denormalization as a mistake. It's a deliberate trade: faster reads for more redundancy and some risk of anomalies.
