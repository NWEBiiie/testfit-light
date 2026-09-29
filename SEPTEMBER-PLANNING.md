# September 29 — exact boundary and three schematic options

## Source and status

The supplied photographs of ASC PLANNING SKILLS and the point list are the client brief for these options. They are not treated as a building-code standard. The original saved project remains unchanged at `options/saved.json` and is available from the study selector.

The new default is option 1. Options 2 and 3 are alternatives within the same clinical shell, not different surgical-capacity proposals. They vary nursing/support ordering, PT position, and the public/staff suite positions. The OR and processing arrangement remains constant for comparison.

All 13 source coordinates are retained numerically and in their original order. The app uses them as its point input, including negative values. No source-axis conversion, boundary normalization, scaling, rotation, or mirroring is applied. The area enclosed by that list is 9,766.41 square feet. The internal layout builder uses auxiliary axes only to place new rooms; the exported boundary is the literal source list. The empty exact-point study lets you inspect it independently.

## Applied client priorities

1. Start with the boundary and service edge, then 8-foot clear circulation.
2. Two equal 600-sf **hatched clear-area** operating rooms, with patient-side and clean-side double doors.
3. Ten universal pre-op/PACU bays, 120 sf of clear hatch each. Solid bay partitions and corridor-facing curtains; curtain faces touch corridor edges.
4. Nursing has an open patient-corridor frontage and adjoining medication/clean and soiled support. Meds is 170 sf.
5. PT/mobility is 150 sf. The recovery toilet is nearby in options 1 and 2; option 3 puts PT nearer the OR transfer.
6. Decontamination, clean assembly and sterile storage retain the previous saved project's **hatched** areas, with sequential connecting doors.
7. Engineering rooms have exterior-side doors only. Their actual equipment capacity remains unverified.
8. Waiting and reception share an open public room. Consult has both public-room and corridor access; the business office is enclosed.
9. Staff lounge has exterior access and adjoining locker/toilet rooms.
10. The specified room colors are applied: plant #C8C8C8, administration #EBDAA9, patient #A4C3CE, support #B8CCAD, public #B39AB8, diagnostic/treatment #D19CA6. Anesthesia uses the latest brief's treatment category.

## Option comparison

| Option | Main difference | Nursing to nearest OR | PT to nearest OR |
| --- | --- | ---: | ---: |
| 1 — Central nursing | Public suite by clinical connector; meds/clean on one side of nursing, soiled on the other | ~46 ft | ~69 ft |
| 2 — Staff-first | Staff suite by connector; meds/clean and soiled reverse around nursing | ~53 ft | ~69 ft |
| 3 — PT transfer | PT moves to the clinical connector; staff-first public arrangement | ~54 ft | ~38 ft |

Distances follow the drawn corridor centerlines from threshold center to the nearest OR patient-door threshold. They exclude movement within rooms, staffing, door delays and restrictions. They describe unedited presets and are not performance predictions.

## Material compromises — not resolved by geometry checks

- **Clean/dirty separation is not complete.** The two transfer spines share patient/clinical traffic; the upper spine also serves processing and clean-side OR doors. This is a known conflict with the brief. Controlled-zone thresholds and truly separated routes require another design pass.
- **Bay aisles have dead ends.** The current cross-connection is at the OR end, not a complete racetrack around the bays. A return route and stretcher-turn study are still required.
- **Nursing cannot directly see all ten bays.** Back-to-back banks obscure the far bank. A satellite observation position or revised bay arrangement is needed; none is represented as solved.
- **Waiting/reception is 500 sf**, reduced from the previous approximately 817-sf waiting room. Thirty-seat capacity has not been established.
- **Support and engineering space is reduced/consolidated.** Mechanical/HVAC/boiler share 177 sf; electrical/building electrical 70 sf; emergency electrical 70 sf; RO/utility/riser 80 sf; medical gas 60 sf. Equipment specifications, access clearances, ventilation and required separation are not verified.
- Equipment/supply/robot storage is a shared 180-sf room, not dedicated robot storage. Nurse/nourish/staging functions share a 240-sf room. Dedicated nourishment, stretcher staging and expanded storage are not demonstrated.
- Non-sterile janitor and rear clean utility access is through the nursing/support area; dirty-cart transport still requires review.
- Positive ambulation routes, natural light, the provision of training stairs/handrails/walker storage, and PT maneuvering clearances are not proven.
- Stretcher turn templates, doors in use, furniture/equipment clearances, privacy, anesthesia operations, egress, accessibility and building-system loads are not validated.
- Residual pockets remain; they are not claimed as usable support space. The schemes are two-OR concepts only; no four-OR growth claim is made.

These are client-discussion test fits, not construction or regulatory approval documents.

## Verification performed

Automated checks cover the literal boundary, six-inch wall containment, room non-overlap, 8-foot corridor polygons clear of room wall mass, curtain-to-corridor contact, exact OR/bay hatch areas, retained SPD hatch areas, resolvable hosted doors, and preservation of the original saved project. They do **not** verify clinical workflow.

Builder: `scripts/build-september-presets.cjs`. Browser data: `september-studies.js`. Regression checks: `tests/september-studies.cjs`.

Browser smoke tests also passed for option switching, Save/Open roundtrips, the unchanged previous saved layout, Undo, default reload, exact-point editor contents, direct option links and mobile startup, without browser errors.

The broader legacy suite has four failures outside these new studies: `boundary-merge.cjs` expects older untrimmed rooms; `client-studies.cjs` checks retired study geometry; `refit.cjs` expects older PACU areas; and `geometry.cjs` still expects overlapping JSON imports to throw despite the later request to permit those imports. These were reported, not silently rewritten. The new study checks and ten other non-browser suites pass.
