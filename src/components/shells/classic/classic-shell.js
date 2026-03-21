"use client";

// ClassicShell — wraps children with the existing hamburger menu layout (UI1)
// The GlobalHamburgerMenu is already rendered in the root layout, so this shell
// simply passes children through without extra chrome.
export function ClassicShell({ children }) {
  return <>{children}</>;
}
