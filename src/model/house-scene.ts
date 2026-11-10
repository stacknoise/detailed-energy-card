import type { EnergyModel } from "./compute";
import { emptyScene, gridOf, type HouseConfig, type HouseScene, type HouseSelection } from "./house";

/** Input of the scene builder: the computed model of the energy card, the config with its layouts, the selection and the value format. */
export interface HouseSceneInput {
  model: EnergyModel;
  config: HouseConfig;
  selection: HouseSelection;
  /** formats watts as the card shows them (`formatPower` with the card's unit and decimals) */
  format: (watts: number) => string;
  /** language for names and the aria texts */
  lang?: string;
}

/** AP2: builds the scene (slabs, rooms, labels, flow lines) from the model; returns the empty scene with the grid of the config for now. */
export function buildHouseScene(input: HouseSceneInput): HouseScene {
  const { cols, rows } = gridOf(input.config);
  return emptyScene(cols, rows);
}
