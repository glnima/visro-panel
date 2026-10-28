import { Armchair, Hammer, Layers, Paintbrush, Shirt, Truck, type LucideIcon } from "lucide-react";
import type { StationKey } from "@/lib/types";

export const stationIcons: Record<StationKey, LucideIcon> = {
  carpentry: Hammer,
  zirkar: Layers,
  rangkar: Paintbrush,
  tailor: Shirt,
  ruyekoob: Armchair,
  final: Truck,
};
