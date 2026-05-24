// ============================================================
// Neo4j — Production Cypher Query Templates
// Used by Supabase Edge Functions. Parameters prefixed with $.
// ============================================================


// ─── WRITE QUERIES (called by sync Edge Functions) ────────

// 1. Create or update a Pet node (on Supabase pets INSERT/UPDATE)
// MERGE (p:Pet {id: $pet_id})
// SET p.name = $name,
//     p.species = $species,
//     p.breed = $breed,
//     p.temperament = $temperament,
//     p.size = $size,
//     p.is_vaccinated = $is_vaccinated,
//     p.owner_id = $owner_id,
//     p.city = $city,
//     p.lat = $lat,
//     p.lng = $lng,
//     p.created_at = $created_at

// 2. Create Owner node and link to Pet (on pet creation)
// MERGE (o:Owner {id: $owner_id})
// SET o.display_name = $display_name,
//     o.city = $city,
//     o.lat = $lat,
//     o.lng = $lng
// WITH o
// MATCH (p:Pet {id: $pet_id})
// MERGE (o)-[:OWNS {since: $since}]->(p)

// 3. Create friendship (both directions)
// MATCH (a:Pet {id: $pet_a_id}), (b:Pet {id: $pet_b_id})
// MERGE (a)-[r1:FRIENDS_WITH]->(b)
// SET r1.since = $since, r1.compatibility = $compatibility
// MERGE (b)-[r2:FRIENDS_WITH]->(a)
// SET r2.since = $since, r2.compatibility = $compatibility

// 4. Remove friendship
// MATCH (a:Pet {id: $pet_a_id})-[r:FRIENDS_WITH]-(b:Pet {id: $pet_b_id})
// DELETE r

// 5. Block a pet (remove friendship + add BLOCKED edge)
// MATCH (a:Pet {id: $from_pet_id}), (b:Pet {id: $to_pet_id})
// MERGE (a)-[:BLOCKED {created_at: $created_at}]->(b)
// WITH a, b
// OPTIONAL MATCH (a)-[f:FRIENDS_WITH]-(b)
// DELETE f

// 6. Create Place node
// MERGE (pl:Place {id: $place_id})
// SET pl.name = $name,
//     pl.type = $type,
//     pl.lat = $lat,
//     pl.lng = $lng,
//     pl.city = $city,
//     pl.avg_rating = $avg_rating

// 7. Record meetup visit (VISITED + MET_AT relationships)
// MATCH (a:Pet {id: $pet_a_id}), (b:Pet {id: $pet_b_id}), (pl:Place {id: $place_id})
// MERGE (a)-[:VISITED {visited_at: $visited_at, meetup_id: $meetup_id}]->(pl)
// MERGE (b)-[:VISITED {visited_at: $visited_at, meetup_id: $meetup_id}]->(pl)
// MERGE (a)-[:MET_AT {meetup_id: $meetup_id, met_at: $visited_at}]->(pl)
// MERGE (b)-[:MET_AT {meetup_id: $meetup_id, met_at: $visited_at}]->(pl)


// ─── READ QUERIES (called by discovery Edge Functions) ────

// 8. Friends of a pet (1 hop)
// MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH]->(friend:Pet)
// WHERE NOT (me)-[:BLOCKED]-(friend)
// RETURN friend.id as pet_id, friend.name, friend.breed,
//        friend.temperament, friend.city

// 9. Friends of friends (2 hops) — key discovery query
// MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH*2]->(fof:Pet)
// WHERE NOT (me)-[:FRIENDS_WITH]->(fof)
//   AND NOT (me)-[:BLOCKED]-(fof)
//   AND fof.id <> $my_pet_id
// WITH fof,
//      COUNT { (me)-[:FRIENDS_WITH*2]->(fof) } as mutual_count
// ORDER BY mutual_count DESC
// RETURN fof.id as pet_id, fof.name, fof.breed,
//        fof.temperament, fof.city, mutual_count
// LIMIT 50

// 10. Nearby pets by city
// MATCH (me:Pet {id: $my_pet_id})
// MATCH (other:Pet)
// WHERE other.city = me.city
//   AND other.id <> $my_pet_id
//   AND NOT (me)-[:BLOCKED]-(other)
//   AND NOT (me)-[:FRIENDS_WITH]->(other)
// RETURN other.id as pet_id, other.name, other.breed,
//        other.temperament, other.species
// LIMIT 100

// 11. Compatible pets (same species, shared temperament, same city)
// MATCH (me:Pet {id: $my_pet_id})
// MATCH (other:Pet)
// WHERE other.species = me.species
//   AND other.city = me.city
//   AND other.id <> $my_pet_id
//   AND NOT (me)-[:BLOCKED]-(other)
//   AND ANY(t IN other.temperament WHERE t IN me.temperament)
// WITH me, other,
//      SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits
// ORDER BY shared_traits DESC
// RETURN other.id as pet_id, other.name, other.breed,
//        other.temperament, shared_traits as compatibility_score
// LIMIT 30

// 12. Mutual friends between two pets
// MATCH (a:Pet {id: $pet_a_id})-[:FRIENDS_WITH]->(mutual:Pet)<-[:FRIENDS_WITH]-(b:Pet {id: $pet_b_id})
// RETURN mutual.id as pet_id, mutual.name, mutual.breed

// 13. Suggested friends (FoF + species match + compatibility)
// MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH]->(friend:Pet)-[:FRIENDS_WITH]->(suggestion:Pet)
// WHERE suggestion.id <> $my_pet_id
//   AND NOT (me)-[:FRIENDS_WITH]->(suggestion)
//   AND NOT (me)-[:BLOCKED]-(suggestion)
//   AND suggestion.species = me.species
// WITH suggestion,
//      COUNT(friend) as mutual_count,
//      SIZE([t IN suggestion.temperament WHERE t IN $my_temperament]) as shared_traits
// ORDER BY mutual_count DESC, shared_traits DESC
// RETURN suggestion.id as pet_id, suggestion.name, suggestion.breed,
//        suggestion.temperament, mutual_count, shared_traits
// LIMIT 20

// 14. Places friends have visited (social proof)
// MATCH (me:Pet {id: $my_pet_id})-[:FRIENDS_WITH]->(friend:Pet)-[:VISITED]->(place:Place)
// WITH place, COUNT(friend) as friend_visits
// ORDER BY friend_visits DESC
// RETURN place.id as place_id, place.name, place.type,
//        place.lat, place.lng, friend_visits
// LIMIT 20

// 15. Check relationship status (for meetup eligibility)
// MATCH (a:Pet {id: $pet_a_id}), (b:Pet {id: $pet_b_id})
// RETURN EXISTS((a)-[:FRIENDS_WITH]-(b)) as are_friends,
//        EXISTS((a)-[:BLOCKED]-(b)) as is_blocked

// 16. Full compatibility score (0–100)
// MATCH (me:Pet {id: $my_pet_id}), (other:Pet {id: $other_pet_id})
// WITH me, other,
//      SIZE([t IN other.temperament WHERE t IN me.temperament]) as shared_traits,
//      SIZE(me.temperament) as my_traits
// WITH me, other, shared_traits, my_traits,
//      CASE WHEN my_traits > 0 THEN toFloat(shared_traits) / my_traits * 60 ELSE 0 END as trait_score,
//      CASE WHEN me.size = other.size THEN 20 ELSE 0 END as size_score,
//      CASE WHEN me.species = other.species THEN 10 ELSE 0 END as species_score,
//      CASE WHEN me.is_vaccinated AND other.is_vaccinated THEN 10 ELSE 0 END as vacc_score
// RETURN other.id as pet_id,
//        toInteger(trait_score + size_score + species_score + vacc_score) as compatibility_score
