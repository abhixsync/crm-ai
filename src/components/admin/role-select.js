"use client";

import { Select } from "@/components/ui/select";

export function RoleSelect({ roles = [], value, onChange, disabled }) {
  return (
    <Select value={value} onChange={onChange} disabled={disabled}>
      <option value="">Select role</option>
      {roles.map((role) => (
        <option key={role.id} value={role.key}>
          {role.name} ({role.key})
        </option>
      ))}
    </Select>
  );
}
