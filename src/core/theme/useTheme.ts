"use client";

import { useContext } from "react";
import { ThemeContext } from "@/core/theme/ThemeProvider";

export function useTheme() {
  return useContext(ThemeContext);
}
