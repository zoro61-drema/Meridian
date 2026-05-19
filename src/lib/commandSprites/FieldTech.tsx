import { createUnit } from "./createUnit";

export const FieldTech = createUnit({
  displayName: "Medic",
  component: "FieldTech",
  // Native 72px source vs Marine's 86px — render at 72/86 ≈ 0.84
  // so per-pixel display scale matches Marine and Medic doesn't
  // appear ~20% larger than the rest of the humanoids.
  scale: 72 / 86,
});
