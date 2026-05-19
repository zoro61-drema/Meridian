import { createUnit } from "./createUnit";

export const Engineer = createUnit({
  displayName: "Engineer",
  component: "Engineer",
  // Native 76px source vs Marine's 86px — base ratio 76/86 keeps
  // per-pixel scale matched. Bumped 1.1× because the Engineer's
  // silhouette reads visually smaller than the other humanoids at
  // the matched-pixel size (slimmer build, smaller tool/weapon).
  scale: (76 / 86) * 1.1,
});
