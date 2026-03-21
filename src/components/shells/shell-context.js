"use client";

import { createContext, useContext } from "react";

const ShellContext = createContext({ layout: "modern" });

export function ShellContextProvider({ layout, children }) {
  return (
    <ShellContext.Provider value={{ layout }}>
      {children}
    </ShellContext.Provider>
  );
}

export function useShellLayout() {
  return useContext(ShellContext);
}
