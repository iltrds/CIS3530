## Why design first

Before writing a single CREATE TABLE, everyone involved has to agree on **what** the database records: which things, how they are related, and which rules always hold. Getting that wrong is expensive to fix once data exists. Design happens in four phases:

| Phase | Output | Model used |
|---|---|---|
| 1. Requirements gathering | what the users need, in words | interviews, forms, documents |
| 2. Conceptual design | a high-level picture of the data | **ER model** (this week) |
| 3. Logical design | tables, keys, foreign keys | **relational model** (Weeks 1–4) |
| 4. Physical design | storage, indexes | a specific DBMS |

The ER model is deliberately **not tied to any DBMS**. It was proposed by Peter Chen (1976), and CIS3530 uses **Chen's notation**: rectangles, diamonds and ovals. (The other common notation, crow's foot, draws cardinalities as forks on the lines; you won't need it here.) An ER design is drawn as an **ER diagram**.

## Entities

An **entity** is a thing in the real world with an **independent existence** that can be told apart from other things. It can be physical (a student, a car) or conceptual (a course, a bank account).

- An **entity type** is the description shared by entities with the same attributes: STUDENT, COURSE. This is what you draw and design with. Notation: a **rectangle** with the name in capitals.
- An **entity set** is the collection of all entities of one type in the database **right now**: every student currently stored. It plays the role a relation instance plays in the relational model.

People say entity, entity type and entity set loosely, but the design is always about **types**; instances only help you understand the requirements.

**Finding entities in requirements.** Look for nouns that exist on their own and that the system stores several facts about. In *"a student can take several courses but is taught by one instructor"*, student, course and instructor are entities; "takes" and "is taught by" are relationships. A noun that is only ever a single fact about something else (a student's email) is an attribute, not an entity.

## Attributes

An **attribute** is a property every entity of a type has. Notation: an **oval** joined to its entity (or relationship) by a line. Attributes are classified three ways, plus keys:

{{er:w6-attr-kinds}}

| Kind | Meaning | Notation | Example |
|---|---|---|---|
| **Simple** | one indivisible part | plain oval | dob |
| **Composite** | made of parts, each meaningful on its own | oval with its parts' ovals hanging off it | name → first, last; address → number, street, city, postal code |
| **Single-valued** | at most one value per entity | plain oval | dob |
| **Multivalued** | possibly several values per entity | **double oval** (also written `{email}`) | a student's emails, a department's locations |
| **Stored** | kept in the database | plain oval | dob |
| **Derived** | computable from other data | the course uses **no special notation**; the textbook draws a dashed oval | age (from dob), number of employees (by counting) |
| **Key** | its value is different for every entity of the type | **underlined** name | student_id |

The three classifications are independent: an attribute can be composite *and* multivalued (several addresses, each with parts), or simple *and* derived.

Keys: an entity type can have more than one key attribute (a student number and an email might both be unique); underline the one you'll use. A key can also be composite (underline the composite attribute), in which case its parts together identify the entity.

## Relationships

A **relationship** is an association between entities: *Ritu works for SoCS*. Following the same pattern as entities:

- a **relationship instance** is one such association (Ritu–SoCS),
- a **relationship type** is the kind of association between entity types: WORKS_FOR between EMPLOYEE and DEPARTMENT. Notation: a **diamond** joined to the entity types that take part,
- a **relationship set** is all the instances of one type currently stored.

The entity types joined by a relationship type are its **participating entity types**. The number of them is the relationship's **degree**: two makes a **binary** relationship (all of this course's examples), three a ternary one.

**Attributes of relationships.** Some facts describe the *association* rather than either entity. "Hours per week an employee volunteers on an activity" depends on both the employee *and* the activity: Ritu might give 2 hours to one activity and 5 to another. So `hours` is drawn as an oval on the Volunteers diamond, not on EMPLOYEE or ACTIVITY.

### Recursive relationships and roles

When the **same entity type takes part twice** in one relationship type, the relationship is **recursive** (also called unary or self-referencing). Each line to the entity plays a different **role**, and you can write the role names on the lines to make the meaning clear (roles are optional otherwise):

- Supervision: an EMPLOYEE in the role *supervisor* supervises EMPLOYEEs in the role *subordinate*.
- A course is a prerequisite of other courses; a person is the parent of other people; a student is another student's buddy.

A recursive relationship is still **binary**: it has two participating *roles*, both filled by the same entity type. Being recursive says nothing about its cardinality ratio; work it out from the roles as for any relationship:

| Recursive relationship | Ratio | Why |
|---|---|---|
| Supervision | 1:N | a supervisor has many subordinates; each subordinate has one supervisor |
| Course and prerequisite | M:N | a course can need several prerequisites, and be a prerequisite for several courses |
| User follows user (X, Instagram) | M:N | you follow many accounts and many follow you |
| Person and biological mother | 1:N | a mother can have many children; each person has one mother |
| Person and current spouse | 1:1 | at most one in each direction |

## Structural constraints

Business rules limit which combinations of entities can be related. Chen diagrams show two such constraints on every line.

### Cardinality ratio

The **cardinality ratio** says how many relationship instances an entity can take part in, at most: **1:1**, **1:N** or **M:N**. It is written as a number on each line, **next to the entity it counts**.

> To find how many **B**s one **A** can be related to, read the number written **next to B**.

In DEPARTMENT —1— WORKS_FOR —N— EMPLOYEE, the N next to EMPLOYEE means one department can have **many employees**, and the 1 next to DEPARTMENT means an employee works for **one department**. That's a 1:N relationship from DEPARTMENT to EMPLOYEE.

| Ratio | Reads as | University Staff example |
|---|---|---|
| 1:1 | each A with at most one B, each B with at most one A | a department has one manager, an employee manages at most one department (Manages) |
| 1:N | each A with many Bs, each B with at most one A | a department hosts many activities; each activity belongs to one department (Hosts) |
| M:N | many in both directions | an employee volunteers for many activities; an activity has many volunteers (Volunteers) |

The textbook sometimes uses arrows instead of numbers; this course uses Chen's numbers.

### Participation

The **participation constraint** says whether every entity of a type **must** take part in the relationship:

- **Total** participation (also called *existence dependency*): every entity of that type is related to at least one entity on the other side. Drawn as a **double line** between the entity and the diamond.
- **Partial** participation: some entities may not be related at all. A single line.

Participation is about the entity **at the double-lined end**: a double line between EMPLOYEE and WORKS_FOR says *every employee works for a department*; it says nothing about whether every department has employees.

Cardinality gives the **maximum** (1 or many) and participation the **minimum** (0 for partial, 1 for total). Keep the two apart: "an employee works for exactly one department" needs both the 1 next to DEPARTMENT (at most one) **and** the double line on EMPLOYEE's side (at least one).

## Weak entity types

A **weak entity type** meets two conditions:

1. it is **existence dependent**: an entity can't exist without the entity it is related to, and
2. its key is **partly (or wholly) borrowed** from that other entity.

Instead of a key of its own, a weak entity type has a **partial key** (also called a **discriminator**) that tells apart the weak entities belonging to **the same** owner. Notation:

- weak entity type: **double rectangle**,
- its **identifying relationship** to the owner (the **identifying entity type**): **double diamond**,
- the partial key: **dashed underline**,
- the weak entity's participation in the identifying relationship is **always total** (no owner, no weak entity).

Examples: a section of a course; a driver's licence; an employee's dependants. In the University Staff design a DEPENDENT is identified by **the employee's SIN plus the dependant's first name**: two employees can each have a dependant called Sam, but one employee can't have two.

{{er:w6-course-weak}}

**Existence-dependent is not the same as weak.** Give SECTION a key of its own (a surrogate `class_code`) and it is a regular entity type, even if every section must still belong to a course: its participation is total, but its key doesn't borrow COURSE's key.

{{er:w6-course-strong}}

## Relationship instance diagrams

An **instance diagram** draws a snapshot instead of the design: an oval per entity set (a1, a2, …) and per relationship set (r1, r2, …), with each relationship instance joining one entity from each side. A quiz question gives a model and several snapshots and asks **which are possible**. Check each line of the model in turn:

1. **A 1 next to entity type E**: no entity on the other side may be linked to two different Es.
2. **A double line from E**: every entity in E's set must appear in at least one instance.
3. **N, M and single lines** never rule anything out: "many" and "none" are both allowed.

For A —N— R —1— B —N— S —1— C with C total (the Week 6 quiz's model):

- a snapshot with no instances at all fails rule 2 (every C needs a B),
- a2 linked to both b1 and b2 fails rule 1 for R (one B per A),
- b1 linked to both c1 and c2 fails rule 1 for S (one C per B),
- a1–b1, b1–c1, b2–c2 is possible: a2 and nothing else is unlinked, and that's allowed because A's line is single.

Read statements about a model the same way. "A professor teaches **1 or more** students" needs both an N (many allowed) **and** a double line on the professor's side; an N alone means "any number, including zero".

## The whole picture: University Staff

The lecture builds one diagram from four requirements: departments (unique name and number, one manager with a start date, several locations), activities hosted by departments, employees (name, SIN, address, salary, gender, birth date; each works for a department, may volunteer on activities for some hours a week, and has a supervisor), and dependants (first name, gender, birth date).

{{er:w6-staff}}

Reading it line by line:

- **Manages** (1:1) with attribute **stDate**: the manager's start date belongs to the *managing*, not to the employee or the department in general.
- **WORKS_FOR** (1:N): many employees per department, one department per employee; every employee works for one (double line on EMPLOYEE's side).
- **Hosts** (1:N): every activity is hosted by exactly one department.
- **Volunteers** (M:N) with attribute **hours**.
- **Has** (identifying, 1:N) to the weak entity **DEPENDENT**, partial key fname.
- **Supervision** (recursive, 1:N) with roles supervisor and subordinate. It isn't drawn total: the person at the top of the university has no supervisor.
- **location** of DEPARTMENT is multivalued; **name** of EMPLOYEE is composite (fname, lname).

The requirements also mention each dependant's relationship to the employee; the lecture's diagram leaves it out. If you add it, it is one more simple attribute of DEPENDENT.

## Reading a diagram: True, False or Maybe

A worksheet-style question gives a diagram and statements to judge:

- **True**: the diagram shows it (a 1, an N, a double line, a double oval…).
- **False**: the diagram contradicts it. "Must" is false if the line is single (partial participation); "at most one" is false if the number next to that entity is N or M; "composite" is false if the oval has no parts.
- **Maybe**: the diagram doesn't show it but nothing in it rules it out. Facts the diagram never mentions, like whether a non-key attribute happens to be unique, or anything about a value's range, are Maybe.

Work each statement out by naming the **exact** symbol you're relying on. Be careful with "may" (a permission, true unless something forbids it) and "must" (a requirement, true only if a double line or a key demands it).

## Mapping ER to relations

Logical design turns the ER diagram into relations. The overall idea:

- each entity type becomes a relation; a composite attribute contributes only its simple parts; a derived attribute is usually not stored,
- a **1:1** or **1:N** relationship becomes a **foreign key** added to one of the existing relations,
- an **M:N** relationship becomes a **new relation**,
- a **multivalued** attribute becomes a **new relation**.

The textbook's seven steps:

| Step | For each… | Do this | Primary key |
|---|---|---|---|
| 1 | regular (strong) entity type | a relation with its simple attributes (parts of composites) | one of its key attributes |
| 2 | weak entity type | a relation with its simple attributes **plus the owner's key** as a foreign key | owner's key + partial key |
| 3 | binary **1:1** relationship | add the other side's key as a FK to one side, **preferably the side with total participation**; put the relationship's attributes there too | unchanged |
| 4 | binary **1:N** relationship | add the **1-side's key** as a FK to the **N-side** relation, with the relationship's attributes | unchanged |
| 5 | binary **M:N** relationship | a **new relation** with both sides' keys as FKs, plus the relationship's attributes | both FKs together |
| 6 | multivalued attribute | a **new relation**: the attribute plus the owner's key as a FK | owner's key + the attribute |
| 7 | n-ary relationship (n > 2) | a new relation with every participant's key as a FK, plus its attributes | usually all the FKs (leave out the FK to any side with cardinality 1) |

Why the N side in step 4? Each N-side entity is related to **at most one** 1-side entity, so one FK column holds it. Put the FK on the 1 side and a department would need a column per employee. For M:N neither side has "at most one", which is why step 5 needs a separate relation.

Why the total side in step 3? If every department has a manager, `mgr_sin` in DEPARTMENT is never null. Put the FK in EMPLOYEE instead and most employees (who don't manage anything) would have a null there.

A **recursive** relationship is mapped like any other: a recursive 1:N adds a FK that references **the same relation** (Supervision becomes `s_sin` in EMPLOYEE, referencing EMPLOYEE).

### University Staff, mapped

| Relation | Primary key | Foreign keys | From step |
|---|---|---|---|
| DEPARTMENT(<u>dnumber</u>, dname, mgr_sin, stDate) | dnumber | mgr_sin → EMPLOYEE | 1, 3 (Manages) |
| EMPLOYEE(<u>SIN</u>, fname, lname, gender, address, salary, dob, dnumber, s_sin) | SIN | dnumber → DEPARTMENT, s_sin → EMPLOYEE | 1, 4 (WORKS_FOR, Supervision) |
| ACTIVITY(<u>anumber</u>, aname, location, dnumber) | anumber | dnumber → DEPARTMENT | 1, 4 (Hosts) |
| DEPENDENT(<u>SIN, fname</u>, gender, dob) | (SIN, fname) | SIN → EMPLOYEE | 2 |
| VOLUNTEER(<u>SIN, anumber</u>, hours) | (SIN, anumber) | SIN → EMPLOYEE, anumber → ACTIVITY | 5 |
| DEP_LOCATION(<u>dnumber, location</u>) | (dnumber, location) | dnumber → DEPARTMENT | 6 |

The lecture's summary lists DEPARTMENT as (dnumber, dname, SIN); step 3 says the 1:1 relationship's attribute stDate travels with the FK, so it belongs there too. Composite `name` became `fname` and `lname`; nothing called `name` survives.

## From relations back to ER

Run the steps backwards:

| In the relational schema | In the ER model |
|---|---|
| a relation whose key is its own attribute(s) | a regular entity type |
| a relation whose key is **another relation's key plus** something of its own, with a FK to that relation | a **weak** entity type (that something is its partial key) with an identifying relationship |
| a relation whose key is **two FKs** (plus maybe other columns) | an **M:N** relationship (the other columns are its attributes) |
| a FK that is not part of the key | a **1:N** relationship; the relation holding the FK is the N side |
| a FK that is also unique | a **1:1** relationship |
| a FK declared NOT NULL | **total** participation of the side that holds it |
| a relation of (key, value) pairs only | possibly a **multivalued attribute** |

The lecture's COURSE/SECTION example shows the weak-vs-strong line. With SECTION(<u>CRS_CODE, SECTION#, YEAR, SEM</u>, …) the key includes COURSE's key, so SECTION is **weak**. With SECTION(<u>CLASS_CODE</u>, CRS_CODE, …) and CRS_CODE NOT NULL, a section still can't exist without its course (total participation), but its key is its own, so it is **not** weak.

## Common mistakes

- Reading the cardinality from the wrong end. The number next to an entity counts **that** entity.
- Reading N as "one or more". N is a maximum (many); the minimum comes from the line: single means zero is fine.
- Giving a data type (string, integer) when asked what *type of attribute* something is. The answer is simple, composite, multivalued, derived, key…
- Assuming a recursive relationship is 1:N. Followers and prerequisites are M:N.
- Treating "must" as true without a double line.
- Putting a relationship attribute (hours, start date) on an entity.
- Making something that has its own attributes, or that relates to other things, a multivalued attribute instead of an entity (e.g. `{followers}` instead of a recursive relationship).
- Calling an entity weak just because it can't exist alone; it's weak only if its key borrows the owner's key.
- Mapping a 1:N relationship with the FK on the 1 side, or an M:N relationship as a single FK.
- Keeping a composite attribute as one column, or forgetting that a multivalued attribute needs its own relation.
