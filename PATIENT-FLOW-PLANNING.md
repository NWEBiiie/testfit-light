# Current default: compact waiting and a patient circulation loop

This schematic revision is the default. Earlier options and the original saved layout remain in the study selector.

## What changed

- Waiting is a broad, approximately 600-sf public room, about 27 × 23 ft overall, with a stepped outline following the arrival recess. It is not a corridor object. Patients can walk across it to its 10-ft north opening; furniture must leave that route clear.
- Three 400-sf clear ORs (20 × 20 ft) sit alongside the patient-care block on the west.
- Each OR has two separate 4-ft patient doors, marked IN and OUT. Both open onto the patient-side spine; they are not separate clean and dirty doors.
- North and south 8-ft patient links connect the OR spine to the pre-op/PACU observation aisle, forming a loop.
- Discharge follows the observation aisle, the upper patient link and the right-side discharge recess. It does not enter decontamination, clean assembly or sterile storage. Solid walls separate those rooms from the patient link.
- Twelve universal bays remain: six at 120 sf and six at 124 sf where the hatch reaches the exterior shell.
- The 240-sf nurse station opens north, east and south. Its projecting north/south openings have geometric views to the curtain fronts.
- Two patient toilets (approximately 109 sf each) open directly onto the PACU aisle.
- Reception, Office and Consult remain separate rooms. Consult connects both to waiting and patient circulation.
- Staff lounge is approximately 306 sf, with separate men's and women's lockers of approximately 124 sf each. No PT/mobility room is included.

## What the routes do—and do not—establish

The bottom recess remains arrival; the top recess remains discharge. The primary interior patient links are 8 ft wide, and the observation aisle is at least 9.33 ft beside nursing. The unchanged shell recesses are narrower: 7.667 ft at arrival and 6.833 ft at discharge.

IN/OUT door labels express the intended workflow. The shared spine and loop are not physically one-way routes. They do not establish separate clean/dirty instrument circulation or a complete restricted-zone system. No claim of code or clinical compliance is made.

Emergency electrical, Medical gas, R.O. water/utility, Mechanical/HVAC/boiler and Receiving/equipment storage still need service access. The webpage flags these rooms. No substitute route through patient rooms is assumed. Independent clean-side OR access and dirty-return logistics remain unresolved.

The support and engineering areas were refitted to accommodate this arrangement. Their capacities are not verified: decontamination is approximately 329 sf, assembly 237 sf, sterile/equipment storage 405 sf, and receiving/equipment storage 129 sf. MEP room sizes, service clearances, equipment fit and robot/stretcher/nourishment storage require further planning.

## Editing and shell rules retained

The supplied boundary points are unchanged. Left and bottom faces, including the lower-left chamfer, prohibit exterior doors/open passages. Top/right service doors are allowed where shown.

The boundary represents the interior face of the larger exterior wall. Coincident room partitions are omitted; hatches reach the shell. Moving the room away restores its partition. Group boundaries remain alignment guides.

Waiting is an editable custom room: move or extend its edges like other rooms. Its bounding width × depth is not its exact stepped hatch area. Corridors do not overlap its floor.

Bulk columns remain text input, one line per column:

```text
name,x,y,width,depth
C1,-30,-20,1.5,1.5
C2,-15,-20,2,2
```

Coordinates locate column centers in feet. Tabs are also accepted. Columns remain non-bounding references and can be toggled. JSON, SVG and CAD wall-centerline DXF features remain available. Door IN/OUT roles survive JSON Save/Open.

### Column snapping

Under Columns, enable **Snap rooms / walls / corridors to columns** and choose **Column snap alignment**:

- **Outside face** (default): aligns a room wall's outer face or a corridor edge to the facing column surface. The column stays outside the corridor.
- **Centerline**: aligns a room wall centerline or corridor edge through the column center, incorporating it into the wall line. Part of the column may project into clear room/corridor space; this is not a clearance-approved condition.

The mode applies to whole-room movement, wall resizing/extensions, corridor segment movement, corridor ends and custom-outline edges. Existing geometry is not moved when the mode changes. Hidden/disabled columns do not snap; the column-snap checkbox is independent of room snapping. Settings persist in JSON and can be undone. Columns remain reference objects: they do not clip hatches, deduct area, become room boundaries or disappear when incorporated into a wall line.

## Verification and limitations

Automated checks cover all room and corridor containment, room/corridor collisions, door hosting/access, three 400-sf ORs, twelve bays, two patient toilets, six OR transfer doors and patient-only routes from waiting to PACU/ORs and to discharge. Earlier studies remain unchanged.

Sixty sightlines sample five points across every curtain front from the projecting north/south nurse openings. All stay in the observation aisle and avoid other room envelopes; the longest sampled line is 26.78 ft. This does not mean all curtains are visible from one seated position. Curtains, beds, carts, doors and furniture can obstruct actual views.

Seating capacity, privacy, accessibility, fire/egress requirements, staff toilets/showers, OR equipment/procedure fit, storage capacities, staffing and zoning require professional review. The unresolved service and instrument routes mean this is not an access-complete clinical plan.

Builder: `scripts/build-patient-loop.cjs`. Regression: `tests/patient-loop.cjs`, alongside the existing shell, facade, door, editing, import, columns and CAD tests.
