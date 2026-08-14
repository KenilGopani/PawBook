import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { distanceLabel, getQueryParams } from "./helpers.ts";

Deno.test("distanceLabel: under 100m reads 'Nearby'", () => {
  assertEquals(distanceLabel(0), "Nearby");
  assertEquals(distanceLabel(99), "Nearby");
});

Deno.test("distanceLabel: under 1km rounds to the nearest 100m", () => {
  assertEquals(distanceLabel(430), "~400m away");
  assertEquals(distanceLabel(999), "~1000m away");
});

Deno.test("distanceLabel: under 10km shows one decimal of km", () => {
  assertEquals(distanceLabel(1000), "~1.0km away");
  assertEquals(distanceLabel(4200), "~4.2km away");
});

Deno.test("distanceLabel: 10km and over rounds to whole km", () => {
  assertEquals(distanceLabel(10000), "~10km away");
  assertEquals(distanceLabel(15600), "~16km away");
});

Deno.test("getQueryParams extracts search params from a request URL", () => {
  const req = new Request("https://example.com/feed?limit=20&cursor=2024-01-15T10:00:00Z");
  assertEquals(getQueryParams(req), { limit: "20", cursor: "2024-01-15T10:00:00Z" });
});

Deno.test("getQueryParams returns an empty object when there are no params", () => {
  const req = new Request("https://example.com/feed");
  assertEquals(getQueryParams(req), {});
});
