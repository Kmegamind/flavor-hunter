/**
 * Block 1 parse harness + evidence byte-verify over A1–A12.
 * Hard gates: A2, A6, A9, A11, A12. Exit 1 on failure.
 */
import cases from "../schemas/harness-cases.json"
import { parseHeuristic, stripNegationsFromSensory, assertNoAuthenticityField } from "../lib/pipeline/parse-heuristic"
import { gate, placesKeyword } from "../lib/pipeline/gate"
import { huntToEvents } from "../lib/pipeline/run-hunt"
import { pickFixture } from "../lib/pipeline/fixture-data"
import { byteVerify, memoryMatch } from "../schemas/score"
import { searchQueries } from "../lib/pipeline/search-queries"
import type { HuntRequest } from "../schemas"

let failed = 0
function check(id: string, ok: boolean, detail: string) {
  const mark = ok ? "PASS" : "FAIL"
  if (!ok) failed++
  console.log(`  [${mark}] ${id} ${detail}`)
}

async function main() {
  console.log("Flavor Hunter harness — parse + gate + evidence")
  for (const c of cases.cases) {
    const parsed0 = stripNegationsFromSensory(parseHeuristic(c.memory_text))
    const req: HuntRequest = {
      memory_text: c.memory_text,
      locale: "locale" in c && typeof c.locale === "string" ? c.locale : "en",
      range_mi: 20,
      city_label: c.city_label,
    }
    const parsed = gate(req, parsed0)
    const e = c.expect as Record<string, unknown>

    if (e.searchable === true) check(c.id, parsed.searchable === true, "searchable")
    if (e.searchable === false) check(c.id, parsed.searchable === false, "not searchable")
    if (e.dish_present) check(c.id, parsed.anchors.dish !== null, "dish present")
    if (e.person_present) check(c.id, parsed.anchors.person !== null, "person present")
    if (e.direction) check(c.id, parsed.anchors.direction === e.direction, `direction=${e.direction}`)
    if (Array.isArray(e.category_name_matches)) {
      const hit = (e.category_name_matches as string[]).some((m) =>
        parsed.category_name.toLowerCase().includes(m.toLowerCase()),
      )
      check(c.id, hit, "category_name")
    }
    if (typeof e.negation_contains === "string") {
      const needle = e.negation_contains.toLowerCase()
      check(
        c.id,
        parsed.anchors.negation.some((n) => n.value.toLowerCase().includes(needle)),
        "negation",
      )
    }
    if (e.no_authenticity_field) check(c.id, assertNoAuthenticityField(parsed), "no authenticity field")
    if (Array.isArray(e.substyle_matches)) {
      const v = parsed.anchors.substyle?.value ?? ""
      check(
        c.id,
        (e.substyle_matches as string[]).some((m) => v.toLowerCase().includes(m.toLowerCase())),
        "substyle",
      )
    }
    if (typeof e.cuisine_matches === "string") {
      check(c.id, (parsed.anchors.cuisine?.value ?? "").toLowerCase().includes(e.cuisine_matches), "cuisine")
    }
    if (Array.isArray(e.negation_contains_any)) {
      const blob = parsed.anchors.negation.map((n) => n.value.toLowerCase()).join(" ")
      check(
        c.id,
        (e.negation_contains_any as string[]).some((m) => blob.includes(m.toLowerCase())),
        "negation any",
      )
    }
    if (Array.isArray(e.sensory_must_not_contain_as_positive)) {
      const sensory = parsed.anchors.sensory.map((s) => s.value.toLowerCase()).join(" ")
      check(
        c.id,
        (e.sensory_must_not_contain_as_positive as string[]).every((m) => !sensory.includes(m.toLowerCase())),
        "sensory not positive",
      )
    }
    if (e.substyle_is_not_search_city) {
      const kw = placesKeyword(parsed, c.city_label)
      check(c.id, !/hunan|changsha/i.test(kw), `Places keyword="${kw}"`)
      check(c.id, c.city_label === "Boston, MA", "search city Boston")
    }
    if (e.zero_places_calls) check(c.id, parsed.searchable === false, "zero Places (not searchable)")

    if (Array.isArray(e.query_variants_include)) {
      const blob = (parsed.anchors.query_variants ?? []).join(" ").toLowerCase()
      check(
        c.id,
        (e.query_variants_include as string[]).every((m) => blob.includes(m.toLowerCase())),
        "query_variants",
      )
      const qs = searchQueries(parsed, c.city_label)
      check(c.id, qs.length > 1, `Stage-1 searches ${qs.length} variants`)
    }
    if (typeof e.fallback_ladder_first_dish === "string") {
      check(c.id, parsed.anchors.fallback_ladder[0]?.dish === e.fallback_ladder_first_dish, "ladder first dish")
    }
    if (e.fallback_ladder_relation_required) {
      check(
        c.id,
        parsed.anchors.fallback_ladder.length > 0 && parsed.anchors.fallback_ladder.every((r) => r.relation.length > 0),
        "every rung has relation",
      )
    }

    if (c.id === "A6") {
      check(c.id, memoryMatch(parsed.anchors, []) === null, "earned 0 → no percentage")
    }

    if (parsed.searchable) {
      const events = await huntToEvents({ ...req, confirmed: true })
      const locked = events.find((ev) => ev.type === "locked")
      const fixtures = pickFixture(parsed)
      if (locked && locked.type === "locked") {
        for (const cand of locked.ranked) {
          const src = fixtures.find((f) => f.id === cand.id)
          const corpus = `${src?.menu_text ?? ""}\n${(src?.reviews ?? []).map((r) => r.text).join("\n")}`
          for (const line of cand.evidence) {
            check(
              `${c.id}/${cand.id}`,
              byteVerify(line.quote, corpus) || byteVerify(line.quote, src?.menu_text ?? ""),
              `quote «${line.quote.slice(0, 40)}»`,
            )
          }
        }
      }
      if (e.two_doors_on_zero_evidence) {
        const widen = events.find((ev) => ev.type === "widen")
        const sub = events.find((ev) => ev.type === "substitute")
        check(c.id, Boolean(widen) && Boolean(sub), "widen + substitute doors")
        if (sub && sub.type === "substitute") {
          check(c.id, sub.to.relation.length > 0, `relation="${sub.to.relation}"`)
          check(c.id, sub.applied === false, "substitute not auto-applied")
        }
      }
    }
  }

  {
    const events = await huntToEvents({
      memory_text:
        "spicy ramen like hell ramen, extra hot, tonkotsu broth — authentic, not the Americanized kind",
      locale: "en",
      range_mi: 20,
      city_label: "Boston, MA",
    })
    check("parse-only", events.every((e) => e.type === "parsed"), "parsed only")
    check("parse-only", !events.some((e) => e.type === "candidates"), "zero Places events")
  }

  console.log(failed ? `\n${failed} failure(s)` : "\nAll harness checks passed.")
  process.exit(failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
