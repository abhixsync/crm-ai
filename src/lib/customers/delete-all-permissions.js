const ADMIN_DELETE_ALL_ENV_KEY = "ENABLE_ADMIN_DELETE_ALL_CUSTOMERS";

export function isAdminDeleteAllCustomersEnabled() {
  return String(process.env[ADMIN_DELETE_ALL_ENV_KEY] || "")
    .trim()
    .toLowerCase() === "true";
}

export function canUserDeleteAllCustomers(role) {
  const normalizedRole = String(role || "").trim().toUpperCase();

  if (normalizedRole === "SUPER_ADMIN") {
    return true;
  }

  if (normalizedRole === "ADMIN") {
    return isAdminDeleteAllCustomersEnabled();
  }

  return false;
}
