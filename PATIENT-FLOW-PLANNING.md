# Patient entry / discharge test fits

The lower recess on the current webpage is patient arrival: X = −1.375 ft, Y = −15.1665 ft at its midpoint. The upper recess is discharge: X = −4.146 ft, Y = −111.6045 ft. All original boundary vertices remain unchanged. These directions refer to the displayed plan, not geographic north.

Both recesses now connect through actual unoccupied passage polygons to the patient spine. Waiting/reception has a door on the arrival passage; PT has a door on the discharge passage. The markers are access designations, not specified or approved exterior door assemblies.

The entry recess is 7.667 ft wide and the discharge recess is 6.833 ft wide. They flare to 8-ft interior paths. The exact shell cannot provide an uninterrupted 8-ft width at these thresholds. Clear door openings, stretcher movement, accessible maneuvering space and exterior approaches require verification.

## Three options

| Option | Waiting/reception | PT beside discharge | Main variation |
| --- | ---: | ---: | --- |
| 1 — Entry-to-recovery flow (default) | 375 sf | 184.84 sf | Nursing between meds/clean and soiled support; lounge before lockers |
| 2 — Larger arrival lounge | 400 sf | 159.84 sf | Larger waiting, reversed lounge/lockers, meds on the OR side of nursing |
| 3 — Larger discharge PT | 360 sf | 199.84 sf | More mobility space, smaller waiting, nursing shifted toward entry-side bays |

All options retain two 600-sf clear-area ORs, ten universal 120-sf clear-area bays, 170-sf meds, and the previous saved scheme's decontamination, assembly and sterile-storage hatch areas. Main interior spines are 8 ft wide. A 5 × 6-ft clear sterile janitor closet is inset beside sterile storage rather than represented as an unusably narrow strip.

The original saved arrangement remains available and unchanged. These three replace the immediately preceding advice presets; the previous preset builder remains in the local project for reproducibility.

## Material compromises requiring client review

- Clean/dirty and public/restricted traffic are not fully separated. Distinct arrival and discharge portals do not resolve the shared clinical spine.
- Nursing cannot directly observe every bay, and the bay aisles retain dead ends. Observation coverage, return circulation, turning templates and staffing remain unresolved.
- Waiting is smaller than both the original approximately 817-sf area and the previous 500-sf advice option. Thirty-seat capacity is not established.
- Office, manager and records share a 120-sf room. The lounge is 180 sf. One patient/public toilet serves the arrival/recovery area; another toilet sits beside discharge.
- Engineering remains schematic: mechanical/HVAC/boiler share 150 sf; electrical, emergency electrical, RO/utility and medical gas each occupy approximately 83.33 sf. Equipment capacity, required separations and service clearances are unverified. Their doors open toward the exterior, not patient corridors.
- Receiving and bio-waste have exterior access; cart movement and clean/dirty servicing require review. Equipment/supply/robot space remains shared rather than dedicated robot storage.
- No furniture, PT training stairs, handrails, walker storage, structural survey, fire strategy, egress or accessibility approval is implied.

## Columns

Columns are a separate saved collection, not rooms, walls, room boundaries or circulation cutouts. Start with no columns because no surveyed locations were supplied. Add each by center X/Y coordinates and rectangular width/depth in feet.

- **Show / enable columns:** hides the overlay and disables its snapping without deleting coordinates.
- **Snap walls / rooms to column faces:** independently controls magnetic alignment.
- Each column also has its own enable checkbox and editable X/Y/width/depth.
- Full and partial wall drags use the wall's outer face, accounting for wall thickness. Moving rooms can snap to column faces as well.
- Columns never reshape or clip rooms, deduct hatch area, block room movement, or enforce structural clearances. They may lie inside a room or outside the site. This behavior is intentional: check actual column conflicts separately.
- Save/Open and Undo/Redo retain column coordinates and toggle states. Remove is recoverable with Undo.

## Checks

The new tests verify literal boundary points, passage connectivity at both recesses, room/wall containment, non-overlap with corridors, OR/bay clear areas, hosted-door access and resolvability, and three distinct room arrangements. Column tests cover outer-face snapping, wall thickness, partial walls, disabled targets and non-bounding movement. Geometric checks do not establish safe clinical workflow.

Reproducible builder: `scripts/build-patient-flow.cjs`. Tests: `tests/patient-flow.cjs`, `tests/columns.cjs`. Browser data: `september-studies.js`.
