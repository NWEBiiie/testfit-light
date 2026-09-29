# Current default: west ORs and twelve universal bays

This patient-first revision is the default. The previous ten-bay default is available under **Previous default · ten-bay observation**. Options 2 and 3 are unchanged earlier studies; the original saved layout also remains available.

## Requested program

- Three separate ORs on the west/left, 400 sf clear each. They are now 25 × 16 ft clear, not the former 20 × 20 ft squares.
- An 8-ft patient spine alongside the ORs, on the left of the pre-op/PACU zone. It is to the right of the OR rooms, not outside their west walls.
- Twelve universal pre-op/PACU bays, 120 sf clear each (15 × 8 ft). They remain interchangeable bays rather than twelve pre-op plus twelve PACU rooms.
- Two dedicated patient toilets in the pre-op/PACU zone, approximately 83.38 sf each, with doors directly onto the observation aisle. They are not OR toilets.
- A 240-sf nurse station, open toward the observation aisle. Its projecting north/south openings have direct geometric views to all twelve curtain fronts.
- Separate Consult (110 sf), Reception (70 sf) and Office (70 sf).
- Waiting/public circulation approximately 489.29 sf. Patients arrive at the lower recess and walk through this public space to the clinical circulation; it is not all available for seating.
- A dedicated 300-sf staff lounge plus separate 100-sf men's and women's locker rooms. These replace the former combined 265-sf staff block.
- No PT/mobility room.

## Routes and visibility

The lower boundary recess remains patient arrival; the upper recess remains discharge. Patient-care and OR patient-access routes remain 8 ft, with at least 8.33 ft beside the projecting nursing station. Staff utility access is now 6 ft; the utility rooms shift down 3 ft and the lower plant strip reduces accordingly. New-route controls offer 8-ft patient and 6-ft staff/service presets. Existing/custom route widths remain editable.

The site boundary is now the interior face of the exterior wall. Coincident room-wall portions are omitted, including in CAD centerline export, without moving room geometry. Hatches and measured clear dimensions reach the shell face. Consequently, perimeter room areas shown live can exceed the earlier 400-sf OR / 120-sf bay and support-room targets listed above; those earlier figures describe the partition-based footprint, not the revised net hatch. Moving away restores the partition. Group boundaries are alignment guides and do not suppress walls.

Bulk column text: one line per column, `name, x, y, width, depth`, in feet with center coordinates. Example: `C1, -30, -20, 1.5, 1.5`. An optional `name,x,y,width,depth` header and tab-separated rows are accepted. Batches are validated fully, appended without replacing existing columns, and undone in one step. Width/depth must be 0.1–100 ft; names at most 32 characters; maximum 500 columns per batch.

Tests sample five points across each of twelve physical curtain faces, using observation points on the usable projecting north/south nurse openings. All sixty lines remain in the aisle and avoid other room/wall envelopes. The longest sampled line is 27.34 ft. This is opening-to-curtain geometry, not continuous visibility from one seated position or a staffing guarantee. Curtains, carts, doors, furniture and bed orientation still require a real visibility study.

## Remaining design issues

This is a schematic arrangement, not a construction or clinical approval plan.

- Clean/dirty transport is not segregated: ORs, processing and discharge still share the patient spine and transfer connections. ORs currently have a single patient-side double-door opening; a separate clean-side OR access system is not resolved.
- The new rectangular ORs and 15 × 8-ft bays need procedure/equipment, bed, staff and transfer-clearance checks.
- Waiting has an approximately 8-ft-wide public route. Seating must not obstruct it; no 30-seat capacity is established.
- Reception and office are small enclosed planning rooms, not furnished layouts.
- Locker fixture counts, staff toilets/showers, wheelchair clearances and staff utility access need further design. The two shown patient toilets do not establish staff toilet provision.
- Decontamination and assembly retain their previous net areas; sterile/equipment storage increases to approximately 414.37 sf. Sterile and non-sterile janitor closets are not separately resolved in this revision.
- Receiving and equipment storage are consolidated into a 100-sf exterior-access block; equipment also shares sterile storage. Dedicated robot/stretcher/nourishment storage remains unresolved.
- Engineering/service rooms use exterior doors where shown. IT has internal staff access. MEP capacities and service clearances are not verified.
- The shell entrance and discharge recesses remain narrower than the interior routes (7.667 ft and 6.833 ft). Access, egress and jurisdictional requirements require professional review.

## Preservation and checks

The exact supplied boundary coordinates, non-bounding columns, import/edit controls, SVG and CAD wall-centerline DXF exports remain available. No surveyed column locations are assumed.

Builder: `scripts/build-patient-revision.cjs`. Test: `tests/patient-revision.cjs`. Checks cover room/bay counts, clear areas, outer-wall containment, room/corridor overlap, door access, curtain sightlines and preservation of earlier studies. Import round-trip, door/column regressions and CAD export tests also run. Original studies retain their own earlier assumptions.
