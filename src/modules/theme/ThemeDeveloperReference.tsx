"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Mode = "light" | "dark";

export function ThemeDeveloperReference() {
  const [mode, setMode] = useState<Mode>("light");

  const previewStyle = useMemo(
    () => ({
      background: mode === "dark" ? "#0b1220" : "var(--background)",
      color: mode === "dark" ? "#e2e8f0" : "var(--foreground)",
    }),
    [mode]
  );

  return (
    <div className="space-y-4 rounded-lg border border-border p-4" style={previewStyle}>
      <div className="flex gap-2">
        <Button variant={mode === "light" ? "default" : "secondary"} onClick={() => setMode("light")}>Light</Button>
        <Button variant={mode === "dark" ? "default" : "secondary"} onClick={() => setMode("dark")}>Dark</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Themed Card</CardTitle>
          <CardDescription>Card colors and typography are fully token-driven.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button>Primary Action</Button>
        </CardContent>
      </Card>

      <div className="themed-table overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left">Customer</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-3 py-2">Riya Sharma</td>
              <td className="px-3 py-2">Interested</td>
            </tr>
            <tr data-state="selected">
              <td className="px-3 py-2">Ankit Verma</td>
              <td className="px-3 py-2">Follow Up</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
