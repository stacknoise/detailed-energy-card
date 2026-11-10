/** Texts of the 3D editor (AP5 and AP6). Keys start with `house_ed_`; this file belongs to the editor packages. AP5 uses `house_ed_grid_`. */
export const houseEditorDe = {
  house_ed_placeholder: "Der Editor der 3D-Karte folgt.",
  house_ed_grid_label: "Grundriss der Etage",
  house_ed_grid_hint:
    "Auf eine freie Fläche ziehen legt einen Raum an. Einen Raum ziehen verschiebt ihn, der Punkt in der Ecke ändert die Größe. Mit der Tastatur: Tab wählt einen Raum, Pfeiltasten verschieben ihn, Umschalt plus Pfeiltasten ändern die Größe, Entf löscht ihn.",
  house_ed_grid_room_pos: "Spalte {0}, Zeile {1}, {2} mal {3} Zellen",
};
export const houseEditorEn: typeof houseEditorDe = {
  house_ed_placeholder: "The editor of the 3D card is coming.",
  house_ed_grid_label: "Floor plan",
  house_ed_grid_hint:
    "Drag on a free area to add a room. Drag a room to move it; the dot in the corner resizes it. With the keyboard: Tab selects a room, arrow keys move it, Shift plus arrow keys resize it, Delete removes it.",
  house_ed_grid_room_pos: "column {0}, row {1}, {2} by {3} cells",
};
