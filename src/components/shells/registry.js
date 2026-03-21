import { ClassicShell } from "@/components/shells/classic/classic-shell";
import { ModernShell } from "@/components/shells/modern/modern-shell";

export const SHELL_REGISTRY = {
  classic: ClassicShell,
  modern: ModernShell,
};

export const DEFAULT_LAYOUT = "modern";

export function resolveShell(uiLayout) {
  return SHELL_REGISTRY[uiLayout] || SHELL_REGISTRY[DEFAULT_LAYOUT];
}
