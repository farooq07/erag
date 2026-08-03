# Floor Plan & Seating Manager

A standalone, drag-and-drop tool to manage your office floor plan and seating.
No build step, no server, no dependencies — just open the file in a browser.

## Run it

Open `floor-plan/index.html` in any modern browser (double-click it, or
`Right click → Open with → Chrome`). That's it.

Your changes are saved automatically in the browser (localStorage). Use
**Export** to save a `.json` backup and **Import** to restore it (or to move
your layout to another computer).

## What it does

- **Drag & drop people** — drag a person chip from the *Unassigned* pool onto
  any seat. Drag between two seats to move or swap people. Drag a seated person
  back to the pool to free them up.
- **Click any seat** to add / rename a person or change their department.
- **Color-coded by department** so you can see at a glance where Dev, IT, HR,
  Design, etc. are sitting. Click a department in the legend to highlight it on
  the floor; click its color swatch to recolor.
- **Search** any name or department to spotlight matching seats.
- **Editable layout**:
  - `＋ Person` – add someone to the pool.
  - `＋ Zone` – add a block of desks (choose rows × seats and which column).
  - `＋ Area` – add a non-desk space (Conference Room, Kitchen, Open to sky…).
  - On each zone: `＋` adds a row, `🗑` deletes the zone (its people return to
    the pool). `＋` at the end of a row adds a seat.
  - Click a zone title or a row label to rename it inline.
- **Stats** panel shows seated / empty / pool counts live.
- **Reset** restores the default demo floor.

## Default layout

The app opens pre-seeded to match the described floor:

- **Left column** – a 50-seat block (10 rows × 5) and a 20-seat block (4 × 5).
- **Middle column** – Conference Room, Open to sky, and Manager Cabins.
- **Right column** – Right Top (20 seats, 4 × 5) and Right Bottom (20 seats, 4 × 5).

Everything is editable, so rename/resize zones and rows to match your real
office exactly.
