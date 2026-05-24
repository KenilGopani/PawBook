/**
 * Neo4j AuraDB HTTP API client.
 *
 * All Neo4j access from Supabase Edge Functions goes through this client.
 * Uses the Neo4j HTTP Transaction API (not Bolt) since AuraDB Free supports HTTPS.
 *
 * Environment variables required:
 *   NEO4J_URI      — https://<instance-id>.databases.neo4j.io
 *   NEO4J_USER     — neo4j (default)
 *   NEO4J_PASSWORD — from AuraDB console
 */

interface Neo4jResult {
  columns: string[];
  data: Array<{ row: unknown[]; meta: unknown[] }>;
}

interface Neo4jResponse {
  results: Neo4jResult[];
  errors: Array<{ code: string; message: string }>;
}

/**
 * Execute a Cypher query against Neo4j AuraDB via HTTP API.
 *
 * @param cypher - The Cypher query string
 * @param params - Parameters to bind into the query (use $paramName in Cypher)
 * @returns Array of result rows, each as a record object
 *
 * @example
 * const results = await neo4jQuery(
 *   'MATCH (p:Pet {id: $id}) RETURN p.name as name',
 *   { id: 'some-uuid' }
 * );
 * // results = [{ name: 'Max' }]
 */
export async function neo4jQuery(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<Record<string, unknown>[]> {
  const uri = Deno.env.get("NEO4J_URI");
  const user = Deno.env.get("NEO4J_USER") || "neo4j";
  const password = Deno.env.get("NEO4J_PASSWORD");

  if (!uri || !password) {
    throw new Error("Neo4j credentials not configured (NEO4J_URI, NEO4J_PASSWORD)");
  }

  // Neo4j HTTP API endpoint for auto-commit transactions
  const endpoint = `${uri}/db/neo4j/tx/commit`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${btoa(`${user}:${password}`)}`,
      Accept: "application/json",
    },
    body: JSON.stringify({
      statements: [
        {
          statement: cypher,
          parameters: params,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Neo4j HTTP error ${response.status}: ${text}`);
  }

  const data: Neo4jResponse = await response.json();

  // Check for Cypher errors
  if (data.errors && data.errors.length > 0) {
    const errMsg = data.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(`Neo4j query error: ${errMsg}`);
  }

  // Transform results into record objects
  if (!data.results || data.results.length === 0) {
    return [];
  }

  const result = data.results[0];
  if (!result.data || result.data.length === 0) {
    return [];
  }

  return result.data.map((d) => {
    const record: Record<string, unknown> = {};
    result.columns.forEach((col, i) => {
      record[col] = d.row[i];
    });
    return record;
  });
}

/**
 * Execute a write-only Cypher query (no return value expected).
 * Wraps neo4jQuery but doesn't return results.
 */
export async function neo4jWrite(
  cypher: string,
  params: Record<string, unknown> = {}
): Promise<void> {
  await neo4jQuery(cypher, params);
}
