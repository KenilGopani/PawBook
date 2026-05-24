// ============================================================
// Neo4j AuraDB — Constraints & Indexes Setup
// Run this in the AuraDB Browser console after creating your instance.
// ============================================================

// ─── Node Constraints (uniqueness) ────────────────────────

CREATE CONSTRAINT pet_id_unique IF NOT EXISTS
FOR (p:Pet) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT owner_id_unique IF NOT EXISTS
FOR (o:Owner) REQUIRE o.id IS UNIQUE;

CREATE CONSTRAINT place_id_unique IF NOT EXISTS
FOR (pl:Place) REQUIRE pl.id IS UNIQUE;

// ─── Node Indexes (query performance) ─────────────────────

CREATE INDEX pet_city_idx IF NOT EXISTS FOR (p:Pet) ON (p.city);
CREATE INDEX pet_species_idx IF NOT EXISTS FOR (p:Pet) ON (p.species);
CREATE INDEX pet_breed_idx IF NOT EXISTS FOR (p:Pet) ON (p.breed);
CREATE INDEX pet_owner_idx IF NOT EXISTS FOR (p:Pet) ON (p.owner_id);
